"""Supplier campaigns end to end on Temporal's time-skipping test server (weeks pass in milliseconds).

The test server binary is downloaded once into `.tools/` (git-ignored) and reused offline afterwards.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from temporalio.testing import WorkflowEnvironment

from app.core.config import get_settings
from app.db.models.domain import Campaign, CampaignEvent, CampaignMember
from app.db.models.platform import Notification
from app.db.session import session_scope
from app.workflows import client as wf
from app.workflows.types import member_workflow_id
from tests.api.test_campaigns_api import insert_campaign
from tests.conftest import TOOLS_DIR, add_member, create_plot_from_demo, create_supplier, demo


@pytest_asyncio.fixture
async def engine(monkeypatch) -> AsyncIterator[WorkflowEnvironment]:
    try:
        env = await WorkflowEnvironment.start_time_skipping(download_dest_dir=str(TOOLS_DIR))
    except Exception as exc:  # pragma: no cover - first run without network
        pytest.skip(f"time-skipping test server unavailable: {exc}")
    queue = f"test-{uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(get_settings(), "temporal_task_queue", queue)
    wf.set_client(env.client)
    async with wf.build_worker(env.client, task_queue=queue):
        yield env
    wf.set_client(None)
    await env.shutdown()


async def eventually(check: Callable[[], Awaitable[object]], wait_s: float = 20.0) -> object:
    deadline = asyncio.get_running_loop().time() + wait_s
    while True:
        value = await check()
        if value:
            return value
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError("condition not reached in time")
        await asyncio.sleep(0.05)


def timeline_has(acct, cid: str, kind: str, count: int = 1) -> Callable[[], Awaitable[object]]:
    async def _check() -> object:
        c = (await acct.get(f"/api/v1/campaigns/{cid}")).json()
        return sum(1 for t in c["timeline"] if t["kind"] == kind) >= count

    return _check


def stage_of(acct, cid: str, supplier_id: str, *expected: str) -> Callable[[], Awaitable[object]]:
    async def _check() -> object:
        c = (await acct.get(f"/api/v1/campaigns/{cid}")).json()
        m = next(m for m in c["members"] if m["supplierId"] == supplier_id)
        return m if m["stage"] in expected else None

    return _check


async def _start(owner, suppliers: list[dict], due_in_days: int = 30) -> dict:
    r = await owner.post(
        "/api/v1/campaigns",
        json={
            "name": "Q1 2027 harvest evidence",
            "commodity": "cocoa",
            "supplierIds": [s["id"] for s in suppliers],
            "dueDate": (date.today() + timedelta(days=due_in_days)).isoformat(),
            "reminderEveryDays": 7,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_full_campaign_with_reminders_review_and_changes(engine, owner, make_client) -> None:
    a = await create_supplier(owner, "Alpha Coop")
    b = await create_supplier(owner, "Beta Coop")
    reviewer = await add_member(owner, make_client(), "reviewer")
    c = await _start(owner, [a, b])
    assert c["engineOnline"] is True and c["status"] == "running"
    cid = c["id"]
    await eventually(timeline_has(owner, cid, "requested", 2))
    detail = (await owner.get(f"/api/v1/campaigns/{cid}")).json()
    assert sum(1 for t in detail["timeline"] if t["kind"] == "requested") == 2
    assert all(m["portalUrl"] for m in detail["members"])

    # A week passes without uploads: both suppliers get an automatic reminder.
    await engine.sleep(timedelta(days=7, hours=1))
    for s in (a, b):
        m = await eventually(stage_of(owner, cid, s["id"], "reminded"))
        assert m["remindersSent"] == 1

    # Alpha uploads through its link and submits; the plots are checked and handed to a reviewer.
    anon = make_client()
    link = next(m["portalUrl"] for m in detail["members"] if m["supplierId"] == a["id"]).rsplit("/", 1)[1]
    dp = demo("CI-NAW-0001")
    r = await anon.post(
        f"/api/v1/portal/{link}/plots",
        json={"reference": "ALPHA-1", "commodity": "cocoa", "geometry": dp.geometry},
    )
    assert r.status_code == 201
    assert (await anon.post(f"/api/v1/portal/{link}/submit")).status_code == 200
    m = await eventually(stage_of(owner, cid, a["id"], "awaiting_review"))
    assert m["verdictSummary"]["compliant"] == 1
    assert any(n["type"] == "campaign.review" for n in (await reviewer.get("/api/v1/notifications")).json())

    r = await reviewer.post(
        f"/api/v1/campaigns/{cid}/suppliers/{a['id']}/decision", json={"approve": True, "note": ""}
    )
    assert r.status_code == 202
    await eventually(stage_of(owner, cid, a["id"], "approved"))

    # Beta submits, the reviewer asks for changes, Beta resubmits and is approved.
    await create_plot_from_demo(owner, b["id"], demo("CI-NAW-0001"), reference="BETA-1")
    link_b = next(m["portalUrl"] for m in detail["members"] if m["supplierId"] == b["id"]).rsplit("/", 1)[1]
    await anon.post(f"/api/v1/portal/{link_b}/submit")
    await eventually(stage_of(owner, cid, b["id"], "awaiting_review"))
    r = await reviewer.post(
        f"/api/v1/campaigns/{cid}/suppliers/{b['id']}/decision",
        json={"approve": False, "note": "Please add the second farm."},
    )
    assert r.status_code == 202
    await eventually(stage_of(owner, cid, b["id"], "changes_requested"))
    assert (await anon.get(f"/api/v1/portal/{link_b}")).json()["status"] == "open"
    await anon.post(f"/api/v1/portal/{link_b}/submit")
    await eventually(stage_of(owner, cid, b["id"], "awaiting_review"))
    await reviewer.post(
        f"/api/v1/campaigns/{cid}/suppliers/{b['id']}/decision", json={"approve": True, "note": ""}
    )

    async def completed() -> object:
        c = (await owner.get(f"/api/v1/campaigns/{cid}")).json()
        return c if c["status"] == "completed" else None

    done = await eventually(completed)
    assert done["progressPct"] == 100
    kinds = [t["kind"] for t in done["timeline"]]
    assert {
        "requested",
        "reminded",
        "submitted",
        "assessing",
        "awaiting_review",
        "changes_requested",
        "approved",
        "completed",
    } <= set(kinds)
    handle = engine.client.get_workflow_handle(f"campaign-{cid}")
    assert await handle.result() == "completed"


async def test_overdue_supplier(engine, owner) -> None:
    a = await create_supplier(owner)
    c = await _start(owner, [a], due_in_days=3)
    await eventually(timeline_has(owner, c["id"], "requested"))
    await engine.sleep(timedelta(days=7, hours=1))
    m = await eventually(stage_of(owner, c["id"], a["id"], "overdue"))
    assert m["remindersSent"] == 1
    listed = (await owner.get("/api/v1/campaigns")).json()
    assert listed[0]["overdue"] == 1
    async with session_scope() as db:
        types = (await db.execute(select(Notification.type))).scalars().all()
    assert "campaign.overdue" in types


async def test_manual_reminder_and_cancel(engine, owner) -> None:
    a = await create_supplier(owner)
    c = await _start(owner, [a])
    await eventually(timeline_has(owner, c["id"], "requested"))
    r = await owner.post(f"/api/v1/campaigns/{c['id']}/suppliers/{a['id']}/remind")
    assert r.status_code == 202
    m = await eventually(stage_of(owner, c["id"], a["id"], "reminded"))
    assert m["remindersSent"] == 1
    r = await owner.post(f"/api/v1/campaigns/{c['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert r.json()["timeline"][0]["kind"] == "cancelled"
    again = await owner.post(f"/api/v1/campaigns/{c['id']}/cancel")
    assert again.status_code == 409 and again.json()["code"] == "campaign_closed"


async def test_resumes_seeded_campaign_from_database(engine, owner) -> None:
    """A campaign written straight to the database (like the demo seed) is adopted without repeating steps."""
    a = await create_supplier(owner, "Waiting Coop")
    b = await create_supplier(owner, "Done Coop")
    await create_plot_from_demo(owner, a["id"], demo("CI-NAW-0001"))
    cid = await insert_campaign(owner.org_id, {a["id"]: "awaiting_review", b["id"]: "approved"})
    assert await wf.reconcile(engine.client) >= 1
    assert await wf.reconcile(engine.client) >= 1  # idempotent: already running workflows are left alone
    async with session_scope() as db:
        member_id = (
            await db.execute(
                select(CampaignMember.id).where(
                    CampaignMember.campaign_id == uuid.UUID(cid),
                    CampaignMember.supplier_id == uuid.UUID(a["id"]),
                )
            )
        ).scalar_one()

    async def child_running() -> object:
        try:
            return await engine.client.get_workflow_handle(member_workflow_id(cid, str(member_id))).describe()
        except Exception:
            return None

    await eventually(child_running)
    r = await owner.post(
        f"/api/v1/campaigns/{cid}/suppliers/{a['id']}/decision", json={"approve": True, "note": ""}
    )
    assert r.status_code == 202
    await eventually(stage_of(owner, cid, a["id"], "approved"))

    async def completed() -> object:
        async with session_scope() as db:
            c = await db.get(Campaign, uuid.UUID(cid))
            return c is not None and c.status == "completed"

    await eventually(completed)
    async with session_scope() as db:
        requested = (
            (
                await db.execute(
                    select(CampaignEvent).where(
                        CampaignEvent.campaign_id == uuid.UUID(cid), CampaignEvent.kind == "requested"
                    )
                )
            )
            .scalars()
            .all()
        )
        members = await db.execute(select(CampaignMember).where(CampaignMember.campaign_id == uuid.UUID(cid)))
        assert {m.stage for m in members.scalars()} == {"approved"}
    assert len(requested) == 2  # the seeded request events, none added


async def test_supplier_cannot_join_two_running_campaigns(engine, owner) -> None:
    a = await create_supplier(owner)
    await _start(owner, [a])
    r = await owner.post(
        "/api/v1/campaigns",
        json={
            "name": "Duplicate",
            "commodity": "cocoa",
            "supplierIds": [a["id"]],
            "dueDate": (date.today() + timedelta(days=30)).isoformat(),
        },
    )
    assert r.status_code == 409 and r.json()["code"] == "supplier_in_campaign"
    r = await owner.post(
        "/api/v1/campaigns",
        json={"name": "Past", "commodity": "coffee", "supplierIds": [a["id"]], "dueDate": "2020-01-01"},
    )
    assert r.status_code == 422
