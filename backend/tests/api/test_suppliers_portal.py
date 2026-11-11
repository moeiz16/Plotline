from __future__ import annotations

import io
import json
from datetime import timedelta

from sqlalchemy import update

from app.db.base import utcnow
from app.db.models.domain import Supplier
from app.db.session import session_scope
from tests.conftest import add_member, create_plot_from_demo, create_supplier, demo, demo_by_scenario

CI_FARM = "CI-NAW-0001"


async def test_supplier_crud_and_readiness(owner) -> None:
    sup = await create_supplier(owner, "Nawa Growers", "CI", ["cocoa"])
    assert sup["status"] == "invited" and sup["plots"] == [] and sup["readinessPct"] == 0
    assert sup["countryName"] == "Côte d'Ivoire"
    await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    listed = (await owner.get("/api/v1/suppliers")).json()
    assert listed[0]["plots"] == 1 and listed[0]["compliant"] == 1 and listed[0]["readinessPct"] == 100
    r = await owner.patch(
        f"/api/v1/suppliers/{sup['id']}",
        json={"commodities": ["cocoa", "coffee", "cocoa"], "contactEmail": "ops@nawa.example"},
    )
    assert r.status_code == 200 and r.json()["commodities"] == ["cocoa", "coffee"]
    assert r.json()["contactEmail"] == "ops@nawa.example"
    assert len((await owner.get("/api/v1/suppliers?commodity=coffee")).json()) == 1
    assert len((await owner.get("/api/v1/suppliers?country=GH")).json()) == 0
    assert len((await owner.get("/api/v1/suppliers?q=nawa")).json()) == 1


async def test_supplier_validation(owner) -> None:
    r = await owner.post("/api/v1/suppliers", json={"name": "", "country": "Ivory", "commodities": []})
    assert r.status_code == 422
    assert {e["field"] for e in r.json()["errors"]} >= {"name", "country", "commodities"}


async def _portal(owner, sup: dict) -> str:
    r = await owner.post(f"/api/v1/suppliers/{sup['id']}/portal-link")
    assert r.status_code == 200
    assert r.json()["url"].startswith("http://localhost:3010/portal/")
    return r.json()["url"].rsplit("/", 1)[1]


async def test_portal_flow_without_campaign(owner, make_client) -> None:
    sup = await create_supplier(owner)
    token = await _portal(owner, sup)
    anon = make_client()
    view = (await anon.get(f"/api/v1/portal/{token}")).json()
    assert view["supplierName"] == sup["name"] and view["status"] == "open" and view["campaignName"] is None
    assert view["orgName"] == "Riverside Imports"
    dp = demo(CI_FARM)
    v = await anon.post(
        f"/api/v1/portal/{token}/plots/validate", json={"geometry": dp.geometry, "country": "CI"}
    )
    assert v.json()["valid"] is True
    r = await anon.post(
        f"/api/v1/portal/{token}/plots",
        json={"reference": "NAWA-01", "commodity": "cocoa", "geometry": dp.geometry},
    )
    assert r.status_code == 201 and r.json()["verdict"] == "pending"
    r = await anon.post(
        f"/api/v1/portal/{token}/plots",
        json={"reference": "NAWA-02", "commodity": "coffee", "geometry": dp.geometry},
    )
    assert r.status_code == 422
    r = await anon.post(f"/api/v1/portal/{token}/submit")
    assert r.status_code == 200
    out = r.json()
    assert out["status"] == "submitted" and out["submittedAt"]
    assert out["plots"][0]["verdict"] == "compliant"  # assessed straight away without a campaign
    # The link that was used is closed after sending; a fresh link opens a new round of uploads.
    r = await anon.post(f"/api/v1/portal/{token}/submit")
    assert r.status_code == 409 and r.json()["code"] == "portal_submitted"
    fresh = (await anon.get(f"/api/v1/portal/{await _portal(owner, sup)}")).json()
    assert fresh["status"] == "open" and fresh["submittedAt"] and len(fresh["plots"]) == 1
    detail = (await owner.get(f"/api/v1/suppliers/{sup['id']}")).json()
    assert detail["status"] == "active" and detail["lastSubmissionAt"]
    labels = [i["label"] for i in (await owner.get("/api/v1/audit")).json()["items"]]
    assert f"{sup['name']} submitted their plots" in labels
    assert any(i["actorName"] == "Supplier link" for i in (await owner.get("/api/v1/audit")).json()["items"])


async def test_portal_link_rotation_and_expiry(owner, make_client) -> None:
    sup = await create_supplier(owner)
    old = await _portal(owner, sup)
    new = await _portal(owner, sup)
    anon = make_client()
    r = await anon.get(f"/api/v1/portal/{old}")
    assert r.status_code == 410 and r.json()["code"] == "link_expired"
    assert (await anon.get(f"/api/v1/portal/{new}")).status_code == 200
    async with session_scope() as db:
        import uuid

        await db.execute(
            update(Supplier)
            .where(Supplier.id == uuid.UUID(sup["id"]))
            .values(portal_expires_at=utcnow() - timedelta(minutes=1))
        )
    assert (await anon.get(f"/api/v1/portal/{new}")).status_code == 410
    assert (await anon.get("/api/v1/portal/short")).status_code == 410


async def test_portal_delete_and_empty_submit(owner, make_client) -> None:
    sup = await create_supplier(owner)
    token = await _portal(owner, sup)
    anon = make_client()
    assert (await anon.post(f"/api/v1/portal/{token}/submit")).json()["code"] == "no_plots"
    dp = demo(CI_FARM)
    p = (
        await anon.post(
            f"/api/v1/portal/{token}/plots",
            json={"reference": "DEL-1", "commodity": "cocoa", "geometry": dp.geometry},
        )
    ).json()
    assert (await anon.delete(f"/api/v1/portal/{token}/plots/{p['id']}")).status_code == 204
    assert (await anon.get(f"/api/v1/portal/{token}")).json()["plots"] == []
    other = await create_supplier(owner, "Other")
    foreign = await create_plot_from_demo(owner, other["id"], demo_by_scenario("compliant_agroforest")[0])
    assert (await anon.delete(f"/api/v1/portal/{token}/plots/{foreign['id']}")).status_code == 404


async def test_portal_import_geojson(owner, make_client) -> None:
    sup = await create_supplier(owner)
    token = await _portal(owner, sup)
    dp = demo(CI_FARM)
    fc = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"reference": "IMP-1"}, "geometry": dp.geometry},
            {
                "type": "Feature",
                "properties": {"reference": "IMP-2"},
                "geometry": {"type": "Point", "coordinates": [-6.611234, 5.783456]},
            },
        ],
    }
    r = await make_client().post(
        f"/api/v1/portal/{token}/plots/import",
        files={"file": ("plots.geojson", io.BytesIO(json.dumps(fc).encode()), "application/json")},
        data={"commodity": "cocoa"},
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert [p["reference"] for p in out["created"]] == ["IMP-1"]
    assert out["rejected"][0]["reference"] == "IMP-2"
    assert "point_needs_area" in {i["code"] for i in out["rejected"][0]["issues"]}


async def test_app_import_csv_and_errors(owner) -> None:
    sup = await create_supplier(owner)
    csv = "reference,latitude,longitude,area_ha\nCSV-1,5.783456,-6.611234,2.5\nCSV-2,5.784456,-6.612234,9\n"
    r = await owner.post(
        "/api/v1/plots/import",
        files={"file": ("plots.csv", csv.encode(), "text/csv")},
        data={"supplierId": sup["id"], "commodity": "cocoa"},
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert [p["reference"] for p in out["created"]] == ["CSV-1"]
    assert out["created"][0]["kind"] == "point"
    assert out["rejected"][0]["reference"] == "CSV-2"
    again = await owner.post(
        "/api/v1/plots/import",
        files={"file": ("plots.csv", csv.encode(), "text/csv")},
        data={"supplierId": sup["id"], "commodity": "cocoa"},
    )
    assert "duplicate_reference" in {i["code"] for i in again.json()["rejected"][0]["issues"]}
    bad = await owner.post(
        "/api/v1/plots/import",
        files={"file": ("plots.xlsx", b"x", "application/octet-stream")},
        data={"supplierId": sup["id"], "commodity": "cocoa"},
    )
    assert bad.status_code == 415
    assert any(i["action"] == "plot.imported" for i in (await owner.get("/api/v1/audit")).json()["items"])


async def test_supplier_user_sees_only_own_supplier(owner, make_client) -> None:
    mine = await create_supplier(owner, "Mine")
    other = await create_supplier(owner, "Other")
    user = await add_member(owner, make_client(), "supplier", supplier_id=mine["id"])
    assert (await user.get(f"/api/v1/suppliers/{other['id']}")).status_code == 404
    assert (await user.get(f"/api/v1/suppliers/{mine['id']}")).status_code == 200
    assert (await user.post(f"/api/v1/suppliers/{mine['id']}/portal-link")).status_code == 403
