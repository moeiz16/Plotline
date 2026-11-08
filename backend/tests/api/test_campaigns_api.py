"""Campaign API while the workflow service is offline: reads work from the database, actions answer 503."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.core import events
from app.db.models.domain import Campaign, CampaignEvent, CampaignMember
from app.db.session import session_scope
from app.workflows.types import campaign_workflow_id
from tests.conftest import add_member, create_plot_from_demo, create_supplier, demo


async def insert_campaign(org_id: str, stages: dict[str, str], name: str = "Q1 evidence") -> str:
    """Campaign rows as the seed writes them (no workflow running)."""
    cid = uuid.uuid4()
    async with session_scope() as db:
        db.add(
            Campaign(
                id=cid,
                org_id=uuid.UUID(org_id),
                name=name,
                commodity="cocoa",
                status="running",
                due_date=date.today() + timedelta(days=20),
                reminder_every_days=7,
                workflow_id=campaign_workflow_id(str(cid)),
            )
        )
        await db.flush()
        for supplier_id, stage in stages.items():
            db.add(
                CampaignMember(
                    org_id=uuid.UUID(org_id),
                    campaign_id=cid,
                    supplier_id=uuid.UUID(supplier_id),
                    stage=stage,
                    reminders_sent=1 if stage == "reminded" else 0,
                )
            )
            db.add(
                CampaignEvent(
                    org_id=uuid.UUID(org_id),
                    campaign_id=cid,
                    supplier_id=uuid.UUID(supplier_id),
                    kind="requested",
                    message="Evidence requested.",
                )
            )
    return str(cid)


async def test_create_campaign_needs_engine(owner) -> None:
    sup = await create_supplier(owner)
    r = await owner.post(
        "/api/v1/campaigns",
        json={
            "name": "Harvest",
            "commodity": "cocoa",
            "supplierIds": [sup["id"]],
            "dueDate": (date.today() + timedelta(days=30)).isoformat(),
        },
    )
    assert r.status_code == 503
    assert r.json()["code"] == "engine_unavailable" and r.headers["retry-after"] == "30"
    assert (await owner.get("/api/v1/campaigns")).json() == []


async def test_campaign_validation(owner) -> None:
    r = await owner.post(
        "/api/v1/campaigns",
        json={
            "name": "",
            "commodity": "cocoa",
            "supplierIds": [],
            "dueDate": "2027-01-01",
            "reminderEveryDays": 0,
        },
    )
    assert r.status_code == 422
    assert {e["field"] for e in r.json()["errors"]} >= {"name", "supplierIds", "reminderEveryDays"}


async def test_reads_work_offline(owner, make_client) -> None:
    a = await create_supplier(owner, "Alpha Coop")
    b = await create_supplier(owner, "Beta Coop")
    await create_plot_from_demo(owner, a["id"], demo("CI-NAW-0001"))
    await owner.post(f"/api/v1/suppliers/{a['id']}/portal-link")
    cid = await insert_campaign(owner.org_id, {a["id"]: "awaiting_review", b["id"]: "approved"})
    listed = (await owner.get("/api/v1/campaigns")).json()
    assert listed[0]["suppliers"] == 2 and listed[0]["approved"] == 1 and listed[0]["awaitingReview"] == 1
    assert listed[0]["progressPct"] == 50
    c = (await owner.get(f"/api/v1/campaigns/{cid}")).json()
    assert c["engineOnline"] is False and c["reminderEveryDays"] == 7
    members = {m["supplierName"]: m for m in c["members"]}
    assert members["Alpha Coop"]["plotsSubmitted"] == 1
    assert members["Alpha Coop"]["verdictSummary"]["compliant"] == 1
    assert members["Alpha Coop"]["portalUrl"].startswith("http://localhost:3010/portal/")
    assert members["Beta Coop"]["portalUrl"] is None  # no live link issued
    assert len(c["timeline"]) == 2
    reviewer = await add_member(owner, make_client(), "reviewer")
    hidden = (await reviewer.get(f"/api/v1/campaigns/{cid}")).json()
    assert all(m["portalUrl"] is None for m in hidden["members"])


async def test_actions_offline_and_state_conflicts(owner) -> None:
    a = await create_supplier(owner, "Alpha Coop")
    b = await create_supplier(owner, "Beta Coop")
    cid = await insert_campaign(owner.org_id, {a["id"]: "awaiting_review", b["id"]: "approved"})
    r = await owner.post(
        f"/api/v1/campaigns/{cid}/suppliers/{a['id']}/decision", json={"approve": True, "note": ""}
    )
    assert r.status_code == 503
    r = await owner.post(
        f"/api/v1/campaigns/{cid}/suppliers/{b['id']}/decision", json={"approve": True, "note": ""}
    )
    assert r.status_code == 409 and r.json()["code"] == "not_awaiting_review"
    r = await owner.post(
        f"/api/v1/campaigns/{cid}/suppliers/{a['id']}/decision", json={"approve": False, "note": " "}
    )
    assert r.status_code == 422
    r = await owner.post(f"/api/v1/campaigns/{cid}/suppliers/{b['id']}/remind")
    assert r.status_code == 409 and r.json()["code"] == "nothing_to_remind"
    assert (await owner.post(f"/api/v1/campaigns/{cid}/cancel")).status_code == 503
    assert (await owner.post(f"/api/v1/campaigns/{cid}/suppliers/{uuid.uuid4()}/remind")).status_code == 404


async def test_campaign_permissions(owner, make_client) -> None:
    a = await create_supplier(owner)
    cid = await insert_campaign(owner.org_id, {a["id"]: "awaiting_review"})
    sourcing = await add_member(owner, make_client(), "sourcing")
    r = await sourcing.post(f"/api/v1/campaigns/{cid}/suppliers/{a['id']}/decision", json={"approve": True})
    assert r.status_code == 403
    auditor = await add_member(owner, make_client(), "auditor")
    assert (await auditor.get(f"/api/v1/campaigns/{cid}")).status_code == 200
    assert (await auditor.post(f"/api/v1/campaigns/{cid}/cancel")).status_code == 403


async def test_portal_submission_recorded_while_offline(owner, make_client) -> None:
    a = await create_supplier(owner)
    cid = await insert_campaign(owner.org_id, {a["id"]: "reminded"})
    token = (await owner.post(f"/api/v1/suppliers/{a['id']}/portal-link")).json()["url"].rsplit("/", 1)[1]
    anon = make_client()
    view = (await anon.get(f"/api/v1/portal/{token}")).json()
    assert view["campaignName"] == "Q1 evidence" and view["status"] == "open" and view["dueDate"]
    dp = demo("CI-NAW-0001")
    await anon.post(
        f"/api/v1/portal/{token}/plots",
        json={"reference": "P-1", "commodity": "cocoa", "geometry": dp.geometry},
    )
    r = await anon.post(f"/api/v1/portal/{token}/submit")
    assert r.status_code == 200 and r.json()["status"] == "submitted"
    c = (await owner.get(f"/api/v1/campaigns/{cid}")).json()
    assert c["members"][0]["stage"] == "submitted"
    assert c["timeline"][0]["kind"] == "submitted"
    r = await anon.post(
        f"/api/v1/portal/{token}/plots",
        json={"reference": "P-2", "commodity": "cocoa", "geometry": dp.geometry},
    )
    assert r.status_code == 409 and r.json()["code"] == "portal_submitted"


async def test_event_stream_headers(owner, monkeypatch) -> None:
    a = await create_supplier(owner)
    cid = await insert_campaign(owner.org_id, {a["id"]: "requested"})
    monkeypatch.setattr(events, "HEARTBEAT_SECONDS", 0.01)
    r = await owner.get(f"/api/v1/campaigns/{cid}/events?maxEvents=1")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache, no-transform"
    assert r.headers["x-accel-buffering"] == "no"
    assert r.headers["content-type"].startswith("text/event-stream")
    assert "event: heartbeat" in r.text
    other = uuid.uuid4()
    assert (await owner.get(f"/api/v1/campaigns/{other}/events")).status_code == 404
