from __future__ import annotations

import base64
import json

from app.services import domain
from tests.conftest import (
    add_member,
    create_plot_from_demo,
    create_product,
    create_supplier,
    demo_by_scenario,
)


async def _compliant_cocoa(owner, n: int = 2) -> tuple[dict, list[dict]]:
    sup = await create_supplier(owner)
    picks = [dp for dp in demo_by_scenario("compliant_farmland") if dp.commodity == "cocoa"][:n]
    plots = [await create_plot_from_demo(owner, sup["id"], dp) for dp in picks]
    return sup, plots


def _alloc(plot: dict, share: float = 0.5) -> dict:
    cap = domain.plot_capacity_kg("cocoa", plot["areaHa"])
    return {"plotId": plot["id"], "quantityKg": round(cap * share)}


async def _ready_shipment(owner, reference: str = "SH-1") -> tuple[dict, dict]:
    _sup, plots = await _compliant_cocoa(owner)
    product = await create_product(owner)
    allocs = [_alloc(p) for p in plots]
    r = await owner.post(
        "/api/v1/shipments",
        json={
            "reference": reference,
            "productId": product["id"],
            "harvestYear": 2026,
            "quantityKg": sum(a["quantityKg"] for a in allocs),
            "allocations": allocs,
        },
    )
    assert r.status_code == 201, r.text
    return r.json(), product


async def test_products(owner) -> None:
    p = await create_product(owner, "coffee")
    assert p["hsCode"] == "0901 11"
    assert (await owner.get("/api/v1/products")).json()[0]["id"] == p["id"]
    r = await owner.post("/api/v1/products", json={"name": "X", "commodity": "tea", "hsCode": "0902"})
    assert r.status_code == 422


async def test_ready_shipment(owner) -> None:
    s, _p = await _ready_shipment(owner)
    assert s["status"] == "ready"
    assert s["issues"] == 0 and s["plots"] == 2 and s["suppliers"] == 1
    assert {c["code"] for c in s["checks"]} >= {
        "allocations_present",
        "quantities_match",
        "mass_balance",
        "no_non_compliant",
        "mixing",
    }
    assert all(c["status"] == "pass" for c in s["checks"])
    assert all(m["ok"] for m in s["massBalance"])
    assert s["mixing"]["mixed"] is False
    assert s["countries"][0]["code"] == "CI"
    listed = (await owner.get("/api/v1/shipments?status=ready")).json()
    assert [x["reference"] for x in listed] == ["SH-1"]
    assert listed[0]["ddsId"] is None


async def test_blocked_by_non_compliant_plot_and_mixing(owner) -> None:
    _sup, plots = await _compliant_cocoa(owner, 1)
    nc = next(dp for dp in demo_by_scenario("non_compliant") if dp.commodity == "cocoa")
    sup2 = await create_supplier(owner, "Risky Coop", nc.country)
    bad = await create_plot_from_demo(owner, sup2["id"], nc)
    product = await create_product(owner)
    allocs = [_alloc(plots[0], 0.3), _alloc(bad, 0.3)]
    r = await owner.post(
        "/api/v1/shipments",
        json={
            "reference": "SH-BAD",
            "productId": product["id"],
            "harvestYear": 2026,
            "quantityKg": sum(a["quantityKg"] for a in allocs),
            "allocations": allocs,
        },
    )
    s = r.json()
    assert s["status"] == "blocked"
    failed = {c["code"] for c in s["checks"] if c["status"] == "fail"}
    assert {"no_non_compliant", "mixing"} <= failed
    assert s["mixing"]["mixed"] is True and s["mixing"]["unverifiedKg"] > 0
    assert s["issues"] >= 2
    r = await owner.post(f"/api/v1/shipments/{s['id']}/dds")
    assert r.status_code == 409 and r.json()["code"] == "shipment_not_ready"


async def test_mass_balance_counts_other_shipments(owner) -> None:
    _sup, plots = await _compliant_cocoa(owner, 1)
    product = await create_product(owner)
    first = _alloc(plots[0], 0.7)
    r1 = await owner.post(
        "/api/v1/shipments",
        json={
            "reference": "MB-1",
            "productId": product["id"],
            "harvestYear": 2026,
            "quantityKg": first["quantityKg"],
            "allocations": [first],
        },
    )
    assert r1.json()["status"] == "ready"
    second = _alloc(plots[0], 0.7)
    r2 = await owner.post(
        "/api/v1/shipments",
        json={
            "reference": "MB-2",
            "productId": product["id"],
            "harvestYear": 2026,
            "quantityKg": second["quantityKg"],
            "allocations": [second],
        },
    )
    s2 = r2.json()
    assert s2["status"] == "blocked"
    assert next(c for c in s2["checks"] if c["code"] == "mass_balance")["status"] == "fail"
    assert s2["massBalance"][0]["utilisationPct"] > 100


async def test_allocation_validation(owner) -> None:
    _sup, plots = await _compliant_cocoa(owner, 1)
    coffee = await create_product(owner, "coffee")
    r = await owner.post(
        "/api/v1/shipments",
        json={
            "reference": "X",
            "productId": coffee["id"],
            "harvestYear": 2026,
            "quantityKg": 100,
            "allocations": [_alloc(plots[0])],
        },
    )
    assert r.status_code == 422 and "cocoa" in r.json()["errors"][0]["message"]
    r = await owner.post(
        "/api/v1/shipments",
        json={"reference": "X", "productId": coffee["id"], "harvestYear": 2026, "quantityKg": -1},
    )
    assert r.status_code == 422


async def test_draft_without_allocations_and_patch(owner) -> None:
    _sup, plots = await _compliant_cocoa(owner, 1)
    product = await create_product(owner)
    r = await owner.post(
        "/api/v1/shipments",
        json={"reference": "DR-1", "productId": product["id"], "harvestYear": 2026, "quantityKg": 500},
    )
    s = r.json()
    assert s["status"] == "draft"
    r = await owner.patch(
        f"/api/v1/shipments/{s['id']}", json={"allocations": [{"plotId": plots[0]["id"], "quantityKg": 500}]}
    )
    assert r.status_code == 200 and r.json()["status"] == "ready"
    assert r.json()["allocations"][0]["reference"] == plots[0]["reference"]
    dup = await owner.post(
        "/api/v1/shipments",
        json={"reference": "DR-1", "productId": product["id"], "harvestYear": 2026, "quantityKg": 1},
    )
    assert dup.status_code == 409


async def test_trace_graph(owner) -> None:
    s, _p = await _ready_shipment(owner)
    g = (await owner.get(f"/api/v1/shipments/{s['id']}/trace")).json()
    types = [n["type"] for n in g["nodes"]]
    assert types.count("product") == 1 and types.count("shipment") == 1
    assert types.count("supplier") == 1 and types.count("plot") == 2
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    assert len(g["edges"]) == 4


async def test_dds_lifecycle(owner) -> None:
    s, _product = await _ready_shipment(owner)
    r = await owner.post(f"/api/v1/shipments/{s['id']}/dds")
    assert r.status_code == 201
    d = r.json()
    assert d["status"] == "draft" and d["referenceNumber"] is None
    assert d["internalRef"].startswith("DDS-")
    stmt = d["payload"]["statement"]
    assert d["payload"]["operatorType"] == "OPERATOR"
    assert stmt["activityType"] == "IMPORT" and stmt["countryOfActivity"] == "DE"
    assert stmt["operator"]["referenceNumber"][0] == {
        "identifierType": "eori",
        "identifierValue": "DE1234567890123",
    }
    line = stmt["commodities"][0]
    assert line["hsHeading"] == "1801"
    assert line["descriptors"]["goodsMeasure"]["netWeight"] == s["quantityKg"]
    fcs = [json.loads(base64.b64decode(p["geometryGeojson"])) for p in line["producers"]]
    assert all(fc["type"] == "FeatureCollection" for fc in fcs)
    assert sum(len(fc["features"]) for fc in fcs) == 2
    assert "deforestation" in d["summary"]

    r = await owner.post(f"/api/v1/dds/{d['id']}/submit")
    assert r.status_code == 200
    sub = r.json()
    assert sub["status"] == "submitted" and sub["submittedAt"]
    assert len(sub["referenceNumber"]) == 14 and sub["referenceNumber"][2:4] == "DE"
    assert len(sub["verificationNumber"]) == 8
    assert [x["status"] for x in sub["submissions"]] == ["sent", "submitted"]
    again = await owner.post(f"/api/v1/dds/{d['id']}/submit")
    assert again.status_code == 409 and again.json()["code"] == "dds_already_submitted"
    shipment = (await owner.get(f"/api/v1/shipments/{s['id']}")).json()
    assert shipment["status"] == "submitted" and shipment["ddsStatus"] == "submitted"
    r = await owner.patch(f"/api/v1/shipments/{s['id']}", json={"quantityKg": 1})
    assert r.status_code == 409
    assert (await owner.post(f"/api/v1/shipments/{s['id']}/dds")).status_code == 409
    listed = (await owner.get("/api/v1/dds")).json()
    assert listed[0]["shipmentReference"] == "SH-1" and listed[0]["referenceNumber"] == sub["referenceNumber"]


async def test_dds_downloads(owner) -> None:
    s, _p = await _ready_shipment(owner)
    d = (await owner.post(f"/api/v1/shipments/{s['id']}/dds")).json()
    r = await owner.get(f"/api/v1/dds/{d['id']}/payload.json")
    assert r.status_code == 200
    assert r.headers["content-disposition"] == f'attachment; filename="{d["internalRef"]}.json"'
    assert r.json() == d["payload"]
    html = await owner.get(f"/api/v1/dds/{d['id']}/evidence.html")
    assert html.status_code == 200 and html.headers["content-type"].startswith("text/html")
    assert "SH-1" in html.text and "Plots of production" in html.text and "<script" not in html.text
    pdf = await owner.get(f"/api/v1/dds/{d['id']}/evidence.pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"
    assert pdf.headers["content-type"] == "application/pdf"


async def test_changed_shipment_withdraws_draft(owner) -> None:
    s, _p = await _ready_shipment(owner)
    d = (await owner.post(f"/api/v1/shipments/{s['id']}/dds")).json()
    await owner.patch(f"/api/v1/shipments/{s['id']}", json={"harvestYear": 2027})
    r = await owner.post(f"/api/v1/dds/{d['id']}/submit")
    assert r.status_code == 409 and r.json()["code"] == "dds_superseded"


async def test_dds_permissions(owner, make_client) -> None:
    s, _p = await _ready_shipment(owner)
    sourcing = await add_member(owner, make_client(), "sourcing")
    assert (await sourcing.post(f"/api/v1/shipments/{s['id']}/dds")).status_code == 403
    d = (await owner.post(f"/api/v1/shipments/{s['id']}/dds")).json()
    auditor = await add_member(owner, make_client(), "auditor")
    assert (await auditor.get(f"/api/v1/dds/{d['id']}")).status_code == 200
    assert (await auditor.post(f"/api/v1/dds/{d['id']}/submit")).status_code == 403


async def test_review_unblocks_shipment(owner) -> None:
    _sup, plots = await _compliant_cocoa(owner, 1)
    rv = next(dp for dp in demo_by_scenario("review_small_loss") if dp.commodity == "cocoa")
    sup2 = await create_supplier(owner, "Review Coop", rv.country)
    review_plot = await create_plot_from_demo(owner, sup2["id"], rv)
    product = await create_product(owner)
    allocs = [_alloc(plots[0], 0.3), _alloc(review_plot, 0.3)]
    s = (
        await owner.post(
            "/api/v1/shipments",
            json={
                "reference": "RV-1",
                "productId": product["id"],
                "harvestYear": 2026,
                "quantityKg": sum(a["quantityKg"] for a in allocs),
                "allocations": allocs,
            },
        )
    ).json()
    assert s["status"] == "blocked"
    await owner.post(
        f"/api/v1/plots/{review_plot['id']}/review",
        json={"decision": "confirm_compliant", "note": "Checked with field visit photos."},
    )
    listed = {x["reference"]: x for x in (await owner.get("/api/v1/shipments")).json()}
    assert listed["RV-1"]["status"] == "ready"
