from __future__ import annotations

import uuid

from sqlalchemy import update

from app.db.models.platform import AuditLog
from app.db.session import session_scope
from app.services.audit import GENESIS, audit, describe, verify_chain
from tests.conftest import signup


async def test_chain_appends_and_verifies() -> None:
    org = uuid.uuid4()
    async with session_scope() as db:
        first = await audit(db, None, org_id=org, action="plot.created", metadata={"reference": "A-1"})
        second = await audit(db, None, org_id=org, action="plot.assessed", metadata={"reference": "A-1"})
        assert first.prev_hash == GENESIS
        assert second.prev_hash == first.hash
    async with session_scope() as db:
        assert await verify_chain(db, org) == {"valid": True, "checked": 2, "brokenAt": None}


async def test_tampering_breaks_the_chain() -> None:
    org = uuid.uuid4()
    async with session_scope() as db:
        rows = [
            await audit(db, None, org_id=org, action="plot.created", metadata={"reference": f"T-{i}"})
            for i in range(3)
        ]
    async with session_scope() as db:
        await db.execute(
            update(AuditLog).where(AuditLog.id == rows[1].id).values(meta={"reference": "forged"})
        )
    async with session_scope() as db:
        result = await verify_chain(db, org)
    assert result["valid"] is False
    assert result["brokenAt"] == rows[1].id
    assert result["checked"] == 1


async def test_chains_are_per_org() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    async with session_scope() as db:
        await audit(db, None, org_id=a, action="x.one")
        rb = await audit(db, None, org_id=b, action="x.two")
        assert rb.prev_hash == GENESIS


def test_describe_labels() -> None:
    assert describe("plot.assessed", {"reference": "CI-NAW-0007"}) == "Plot CI-NAW-0007 assessed"
    assert (
        describe("dds.submitted", {"referenceNumber": "26DEABC"})
        == "Due diligence statement 26DEABC submitted"
    )
    assert describe("plot.created", {}) == "Plot … added"
    assert describe("something.custom_thing", None) == "Something custom thing"


async def test_audit_api_lists_and_verifies(client) -> None:
    owner = await signup(client)
    r = await owner.get("/api/v1/audit?limit=2")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 2
    assert body["nextBefore"] is not None
    assert {"id", "action", "label", "actorName", "createdAt", "metadata"} <= set(body["items"][0])
    older = await owner.get(f"/api/v1/audit?before={body['nextBefore']}")
    assert all(i["id"] < body["nextBefore"] for i in older.json()["items"])
    r = await owner.get("/api/v1/audit/verify")
    assert r.json()["valid"] is True and r.json()["checked"] >= 3


async def test_audit_filter_by_action(client) -> None:
    owner = await signup(client)
    r = await owner.get("/api/v1/audit?action=org.created")
    assert [i["action"] for i in r.json()["items"]] == ["org.created"]
    r = await owner.get("/api/v1/audit?action=org.")
    assert {i["action"] for i in r.json()["items"]} == {"org.created", "org.updated"}
