"""The demo seed (contract Part 5) builds a coherent, fully offline organisation."""

from __future__ import annotations

from collections import Counter

from app.db.session import session_scope
from app.eo.demo import DEMO_PLOTS
from app.services.seed import DEMO_PASSWORD, already_seeded, seed_demo

OWNER = "amelie.kraus@northbank.example"


async def ensure_seeded() -> None:
    async with session_scope() as db:
        if not await already_seeded(db):
            await seed_demo(db)


async def login(client, email: str = OWNER):
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


async def test_seed_creates_the_demo_org(client) -> None:
    await ensure_seeded()
    body = await login(client)
    assert body["orgs"][0]["name"] == "Northbank Cocoa & Coffee Imports GmbH"
    org = (await client.get("/api/v1/org")).json()
    assert org["eori"] == "DE4471902385516" and org["operatorSize"] == "large" and org["country"] == "DE"
    members = (await client.get("/api/v1/org/members")).json()
    assert Counter(m["role"] for m in members) == Counter(
        {"owner": 1, "compliance_manager": 1, "sourcing": 1, "reviewer": 1, "auditor": 1, "supplier": 1}
    )
    suppliers = (await client.get("/api/v1/suppliers")).json()
    assert len(suppliers) == 9
    ucayali = next(s for s in suppliers if s["name"] == "Cacao Ucayali SAC")
    assert ucayali["status"] == "invited" and ucayali["plots"] == 0


async def test_seeded_plots_match_their_scenarios(client) -> None:
    await ensure_seeded()
    await login(client)
    plots = {p["reference"]: p for p in (await client.get("/api/v1/plots")).json()}
    assert len(plots) == len(DEMO_PLOTS)
    for dp in DEMO_PLOTS:
        expected = dp.expected_verdict if dp.assess_on_seed else "pending"
        assert plots[dp.reference]["verdict"] == expected, dp.reference
    assert any(p["kind"] == "point" for p in plots.values())
    warned = [r for r in plots if dp_scenario(r) == "compliant_low_precision"]
    detail = (await client.get(f"/api/v1/plots/{plots[warned[0]]['id']}")).json()
    assert any(i["severity"] == "warning" for i in detail["validation"]["issues"])


def dp_scenario(reference: str) -> str:
    return next(p.scenario for p in DEMO_PLOTS if p.reference == reference)


async def test_seeded_shipments_and_statement(client) -> None:
    await ensure_seeded()
    await login(client)
    shipments = (await client.get("/api/v1/shipments")).json()
    assert len(shipments) == 8
    assert Counter(s["status"] for s in shipments) == Counter({"ready": 4, "blocked": 3, "submitted": 1})
    blocked = {s["reference"]: s for s in shipments if s["status"] == "blocked"}
    failed = {}
    for ref, s in blocked.items():
        detail = (await client.get(f"/api/v1/shipments/{s['id']}")).json()
        failed[ref] = {c["code"] for c in detail["checks"] if c["status"] == "fail"}
    assert "no_non_compliant" in failed["NB-2026-006"]
    assert "mass_balance" in failed["NB-2026-007"]
    assert {"reviews_complete", "mixing"} <= failed["NB-2026-008"]
    statements = (await client.get("/api/v1/dds")).json()
    assert len(statements) == 1 and statements[0]["status"] == "submitted"
    assert statements[0]["shipmentReference"] == "NB-2026-001" and statements[0]["referenceNumber"]


async def test_seeded_campaign_and_dashboard(client) -> None:
    await ensure_seeded()
    await login(client)
    campaigns = (await client.get("/api/v1/campaigns")).json()
    assert [c["name"] for c in campaigns] == ["Q1 2027 harvest evidence"]
    c = (await client.get(f"/api/v1/campaigns/{campaigns[0]['id']}")).json()
    assert sorted(m["stage"] for m in c["members"]) == [
        "approved",
        "awaiting_review",
        "reminded",
        "requested",
    ]
    assert c["status"] == "running" and len(c["timeline"]) >= 8
    d = (await client.get("/api/v1/dashboard")).json()
    k = d["kpis"]
    expected = Counter(p.expected_verdict if p.assess_on_seed else "pending" for p in DEMO_PLOTS)
    assert (k["plotsCompliant"], k["plotsNeedsReview"], k["plotsNonCompliant"], k["plotsPending"]) == (
        expected["compliant"],
        expected["needs_review"],
        expected["non_compliant"],
        expected["pending"],
    )
    assert (k["shipmentsReady"], k["shipmentsBlocked"], k["shipmentsSubmitted"]) == (4, 3, 1)
    assert k["suppliers"] == 9 and d["plotsAtRisk"] and d["insights"]
    assert (await client.get("/api/v1/audit/verify")).json()["valid"] is True


async def test_seeded_supplier_user_and_idempotence(client) -> None:
    await ensure_seeded()
    await login(client, "kouame.yao@coopnawa.example")
    me = (await client.get("/api/v1/auth/me")).json()
    assert me["membership"]["role"] == "supplier" and me["user"]["fullName"] == "Kouamé Yao"
    suppliers = (await client.get("/api/v1/suppliers")).json()
    assert [s["name"] for s in suppliers] == ["Coopérative Agricole de Nawa"]
    assert {p["supplierName"] for p in (await client.get("/api/v1/plots")).json()} == {
        "Coopérative Agricole de Nawa"
    }
    async with session_scope() as db:
        assert await already_seeded(db)


async def test_campaign_timeline_uses_readable_dates(client) -> None:
    import re

    await ensure_seeded()
    await login(client)
    cid = (await client.get("/api/v1/campaigns")).json()[0]["id"]
    messages = [t["message"] for t in (await client.get(f"/api/v1/campaigns/{cid}")).json()["timeline"]]
    assert not any(re.search(r"\d{4}-\d{2}-\d{2}", m) for m in messages)
    assert any(re.search(r"due \d{1,2} [A-Z][a-z]{2} \d{4}", m) for m in messages)
