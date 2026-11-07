"""Dashboard aggregates, reference data, notifications and tenant isolation."""

from __future__ import annotations

from tests.conftest import (
    add_member,
    create_plot_from_demo,
    create_product,
    create_supplier,
    demo,
    demo_by_scenario,
    signup,
)


async def test_empty_dashboard(owner) -> None:
    d = (await owner.get("/api/v1/dashboard")).json()
    assert d["kpis"]["plots"] == 0 and d["kpis"]["readinessPct"] == 0
    assert d["deadline"]["operatorSize"] == "large" and d["deadline"]["date"] == "2026-12-30"
    assert d["plotsAtRisk"] == [] and d["byCommodity"] == []
    assert any("days until the EUDR applies" in i["title"] for i in d["insights"])
    assert d["recentActivity"][0]["action"] in ("org.updated", "org.created")


async def test_dashboard_counts_and_insights(owner) -> None:
    sup = await create_supplier(owner)
    await create_supplier(owner, "Silent Exporter", "PE")
    await create_plot_from_demo(owner, sup["id"], demo("CI-NAW-0001"))
    nc = demo_by_scenario("non_compliant")[0]
    await create_plot_from_demo(owner, sup["id"], nc)
    rv = demo_by_scenario("review_small_loss")[0]
    await create_plot_from_demo(owner, sup["id"], rv)
    d = (await owner.get("/api/v1/dashboard")).json()
    k = d["kpis"]
    assert (k["plots"], k["plotsCompliant"], k["plotsNonCompliant"], k["plotsNeedsReview"]) == (3, 1, 1, 1)
    assert k["suppliers"] == 2 and k["suppliersReady"] == 0
    assert k["readinessPct"] == 33 and k["deforestedHa"] > 0 and k["areaHa"] > 0
    assert d["plotsAtRisk"][0]["verdict"] == "non_compliant"
    assert [p["verdict"] for p in d["plotsAtRisk"]] == ["non_compliant", "needs_review"]
    titles = " | ".join(i["title"] for i in d["insights"])
    assert "forest cleared after 2020" in titles and "waiting for a reviewer" in titles
    assert "yet to share plots" in titles
    assert {c["key"] for c in d["byCountry"]} >= {"CI"}
    sup_row = next(s for s in d["bySupplier"] if s["id"] == sup["id"])
    assert sup_row["plots"] == 3 and sup_row["readinessPct"] == 33
    assert any(a["label"].startswith("Plot ") for a in d["recentActivity"])


async def test_dashboard_copy_is_plain_language(owner) -> None:
    sup = await create_supplier(owner)
    for dp in demo_by_scenario("non_compliant")[:1] + demo_by_scenario("review_land_change")[:1]:
        await create_plot_from_demo(owner, sup["id"], dp)
    d = (await owner.get("/api/v1/dashboard")).json()
    text = " ".join(
        [i["title"] + " " + i["body"] for i in d["insights"]] + [p["headline"] for p in d["plotsAtRisk"]]
    )
    for word in ("model", "embedding", "pipeline", "cache", "fallback", "LLM", "vector"):
        assert word.lower() not in text.lower(), word


async def test_countries_reference(owner) -> None:
    r = await owner.get("/api/v1/countries")
    assert r.status_code == 200
    rows = {c["code"]: c for c in r.json()}
    assert rows["CI"]["riskTier"] in ("low", "standard", "high")
    assert {"code", "name", "riskTier", "commodities"} <= set(rows["BR"])
    assert r.headers["cache-control"] == "private, max-age=3600"


async def test_notifications_read_all(owner, make_client) -> None:
    reviewer = await add_member(owner, make_client(), "reviewer")
    sup = await create_supplier(owner)
    await create_plot_from_demo(owner, sup["id"], demo_by_scenario("review_small_loss")[0])
    items = (await reviewer.get("/api/v1/notifications")).json()
    assert items and items[0]["readAt"] is None and items[0]["link"].startswith("/app/plots/")
    assert (await reviewer.post("/api/v1/notifications/read-all")).status_code == 204
    assert all(n["readAt"] for n in (await reviewer.get("/api/v1/notifications")).json())


async def test_tenant_isolation(owner, make_client) -> None:
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo("CI-NAW-0001"))
    product = await create_product(owner)
    shipment = (
        await owner.post(
            "/api/v1/shipments",
            json={
                "reference": "ISO-1",
                "productId": product["id"],
                "harvestYear": 2026,
                "quantityKg": 100,
                "allocations": [{"plotId": plot["id"], "quantityKg": 100}],
            },
        )
    ).json()
    dds = (await owner.post(f"/api/v1/shipments/{shipment['id']}/dds")).json()

    intruder = await signup(make_client(), org_name="Intruder Imports")
    for path in (
        f"/api/v1/suppliers/{sup['id']}",
        f"/api/v1/plots/{plot['id']}",
        f"/api/v1/plots/{plot['id']}/assessments",
        f"/api/v1/plots/{plot['id']}/imagery/current.png",
        f"/api/v1/shipments/{shipment['id']}",
        f"/api/v1/shipments/{shipment['id']}/trace",
        f"/api/v1/dds/{dds['id']}",
        f"/api/v1/dds/{dds['id']}/evidence.html",
    ):
        r = await intruder.get(path)
        assert r.status_code == 404, path
        assert r.json()["code"] == "not_found"
    for path in (
        "/api/v1/suppliers",
        "/api/v1/plots",
        "/api/v1/shipments",
        "/api/v1/dds",
        "/api/v1/products",
        "/api/v1/reviews",
        "/api/v1/campaigns",
    ):
        assert (await intruder.get(path)).json() == [], path
    assert (await intruder.get("/api/v1/plots/map")).json()["features"] == []
    assert (await intruder.post(f"/api/v1/plots/{plot['id']}/assess")).status_code == 404
    assert (await intruder.post(f"/api/v1/dds/{dds['id']}/submit")).status_code == 404
    r = await intruder.post(
        "/api/v1/shipments",
        json={"reference": "STEAL", "productId": product["id"], "harvestYear": 2026, "quantityKg": 1},
    )
    assert r.status_code == 422
    other_product = await create_product(intruder)
    r = await intruder.post(
        "/api/v1/shipments",
        json={
            "reference": "STEAL-2",
            "productId": other_product["id"],
            "harvestYear": 2026,
            "quantityKg": 1,
            "allocations": [{"plotId": plot["id"], "quantityKg": 1}],
        },
    )
    assert r.status_code == 422
    audit = (await intruder.get("/api/v1/audit")).json()["items"]
    assert all(i["resourceId"] != plot["id"] for i in audit)
