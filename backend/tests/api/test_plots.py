from __future__ import annotations

from tests.conftest import (
    add_member,
    create_plot_from_demo,
    create_supplier,
    demo,
    demo_by_scenario,
)

CI_FARM = "CI-NAW-0001"  # compliant farmland polygon in Côte d'Ivoire


async def test_create_polygon_plot_is_assessed(owner) -> None:
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    assert plot["kind"] == "polygon"
    assert plot["verdict"] == "compliant"
    assert plot["countryName"] == "Côte d'Ivoire"
    assert plot["riskTier"] in ("low", "standard", "high")
    assert plot["h3Cell"] and plot["validation"]["valid"] is True
    assert len(plot["centroid"]) == 2
    a = plot["latestAssessment"]
    assert a["verdict"] == "compliant" and a["source"] == "bundled"
    assert set(a["datasets"]) >= {"forest2020", "forestLoss", "imagery", "changeModel", "rules"}
    assert len(a["inputsHash"]) == 64 and len(a["resultHash"]) == 64
    assert {
        "forest2020Ha",
        "lossAfter2020Ha",
        "lossByYear",
        "changeScore",
        "changeLevel",
        "signalsAgree",
    } <= set(a)


async def test_list_and_filters(owner) -> None:
    sup = await create_supplier(owner)
    other = await create_supplier(owner, "Second Coop")
    await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    nc = demo_by_scenario("non_compliant")[0]
    await create_plot_from_demo(owner, other["id"], nc)
    assert len((await owner.get("/api/v1/plots")).json()) == 2
    only = (await owner.get(f"/api/v1/plots?supplierId={other['id']}")).json()
    assert [p["reference"] for p in only] == [nc.reference]
    assert [p["verdict"] for p in (await owner.get("/api/v1/plots?verdict=non_compliant")).json()] == [
        "non_compliant"
    ]
    assert len((await owner.get("/api/v1/plots?q=second")).json()) == 1
    assert (await owner.get("/api/v1/plots?verdict=bogus")).status_code == 422


async def test_map_returns_feature_collection_with_point_circles(owner) -> None:
    sup = await create_supplier(owner)
    point = demo_by_scenario("compliant_point")[0]
    sup2 = await create_supplier(owner, "Point Coop", point.country, [point.commodity])
    await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    await create_plot_from_demo(owner, sup2["id"], point)
    fc = (await owner.get("/api/v1/plots/map")).json()
    assert fc["type"] == "FeatureCollection" and len(fc["features"]) == 2
    by_kind = {f["properties"]["kind"]: f for f in fc["features"]}
    assert by_kind["point"]["geometry"]["type"] == "Polygon"
    assert set(by_kind["point"]["properties"]) == {
        "id",
        "reference",
        "verdict",
        "commodity",
        "supplierName",
        "areaHa",
        "kind",
    }


async def test_validate_does_not_write(owner) -> None:
    dp = demo(CI_FARM)
    r = await owner.post("/api/v1/plots/validate", json={"geometry": dp.geometry, "country": "CI"})
    body = r.json()
    assert r.status_code == 200 and body["valid"] is True and body["kind"] == "polygon"
    assert body["areaHa"] > 0 and body["normalized"]["type"] == "Polygon"
    assert (await owner.get("/api/v1/plots")).json() == []


async def test_self_intersection_rejected(owner) -> None:
    bowtie = {
        "type": "Polygon",
        "coordinates": [[[-6.61, 5.78], [-6.60, 5.79], [-6.60, 5.78], [-6.61, 5.79], [-6.61, 5.78]]],
    }
    body = (await owner.post("/api/v1/plots/validate", json={"geometry": bowtie, "country": "CI"})).json()
    assert body["valid"] is False
    assert "self_intersection" in {i["code"] for i in body["issues"]}
    sup = await create_supplier(owner)
    r = await owner.post(
        "/api/v1/plots",
        json={
            "supplierId": sup["id"],
            "reference": "BAD-1",
            "commodity": "cocoa",
            "country": "CI",
            "geometry": bowtie,
        },
    )
    assert r.status_code == 422 and r.json()["code"] == "geometry_invalid"
    assert r.json()["errors"][0]["code"] == "self_intersection"


async def test_point_rules(owner) -> None:
    sup = await create_supplier(owner)
    pt = {"type": "Point", "coordinates": [-6.611234, 5.783456]}
    base = {"supplierId": sup["id"], "commodity": "cocoa", "country": "CI", "geometry": pt}
    r = await owner.post("/api/v1/plots", json={**base, "reference": "PT-1"})
    assert r.status_code == 422 and "point_needs_area" in {e["code"] for e in r.json()["errors"]}
    r = await owner.post("/api/v1/plots", json={**base, "reference": "PT-2", "declaredAreaHa": 6})
    assert r.status_code == 422 and "polygon_required" in {e["code"] for e in r.json()["errors"]}
    r = await owner.post("/api/v1/plots", json={**base, "reference": "PT-3", "declaredAreaHa": 2.5})
    assert r.status_code == 201 and r.json()["kind"] == "point" and r.json()["areaHa"] == 2.5


async def test_country_mismatch_rejected(owner) -> None:
    sup = await create_supplier(owner, country="GH")
    dp = demo(CI_FARM)
    r = await owner.post(
        "/api/v1/plots",
        json={
            "supplierId": sup["id"],
            "reference": "X-1",
            "commodity": "cocoa",
            "country": "GH",
            "geometry": dp.geometry,
        },
    )
    assert r.status_code == 422 and "country_mismatch" in {e["code"] for e in r.json()["errors"]}


async def test_duplicate_reference_conflict(owner) -> None:
    sup = await create_supplier(owner)
    await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    other = demo_by_scenario("compliant_agroforest")[0]
    body = {
        "supplierId": sup["id"],
        "reference": CI_FARM.lower(),
        "commodity": "cocoa",
        "country": other.country,
        "geometry": other.geometry,
    }
    r = await owner.post("/api/v1/plots", json=body)
    assert r.status_code == 409 and r.json()["code"] == "reference_taken"


async def test_overlap_is_a_warning(owner) -> None:
    sup = await create_supplier(owner)
    dp = demo(CI_FARM)
    await create_plot_from_demo(owner, sup["id"], dp)
    body = (
        await owner.post("/api/v1/plots/validate", json={"geometry": dp.geometry, "country": "CI"})
    ).json()
    overlap = [i for i in body["issues"] if i["code"] == "overlap"]
    assert body["valid"] is True and overlap and overlap[0]["severity"] == "warning"
    assert CI_FARM in overlap[0]["message"]


async def test_non_compliant_plot(owner) -> None:
    dp = demo_by_scenario("non_compliant")[0]
    sup = await create_supplier(owner, country=dp.country, commodities=[dp.commodity])
    plot = await create_plot_from_demo(owner, sup["id"], dp)
    a = plot["latestAssessment"]
    assert plot["verdict"] == "non_compliant"
    assert a["lossAfter2020Ha"] >= 0.5
    assert any(r["severity"] == "critical" for r in a["reasons"])
    assert sum(a["lossByYear"].values()) > 0


async def test_review_queue_and_confirm(owner, make_client) -> None:
    reviewer = await add_member(owner, make_client(), "reviewer")
    dp = demo_by_scenario("review_small_loss")[0]
    sup = await create_supplier(owner, country=dp.country, commodities=[dp.commodity])
    plot = await create_plot_from_demo(owner, sup["id"], dp)
    assert plot["verdict"] == "needs_review" and plot["reviewRequired"] is True
    queue = (await reviewer.get("/api/v1/reviews")).json()
    assert [p["id"] for p in queue] == [plot["id"]]
    notes = (await reviewer.get("/api/v1/notifications")).json()
    assert any(n["type"] == "review.needed" for n in notes)
    r = await reviewer.post(
        f"/api/v1/plots/{plot['id']}/review",
        json={"decision": "confirm_compliant", "note": "Loss is a shade-tree replant."},
    )
    assert r.status_code == 200
    a = r.json()
    assert a["verdict"] == "compliant" and a["reviewRequired"] is False
    assert a["review"]["reviewerName"] == "Reviewer Person" and a["review"]["decision"] == "confirm_compliant"
    assert (await reviewer.get("/api/v1/reviews")).json() == []
    detail = (await owner.get(f"/api/v1/plots/{plot['id']}")).json()
    assert detail["verdict"] == "compliant" and detail["headline"] == "Confirmed compliant by a reviewer"


async def test_review_permissions_and_overrule_needs_note(owner, make_client) -> None:
    dp = demo_by_scenario("non_compliant")[0]
    sup = await create_supplier(owner, country=dp.country, commodities=[dp.commodity])
    plot = await create_plot_from_demo(owner, sup["id"], dp)
    sourcing = await add_member(owner, make_client(), "sourcing")
    r = await sourcing.post(
        f"/api/v1/plots/{plot['id']}/review", json={"decision": "confirm_compliant", "note": ""}
    )
    assert r.status_code == 403
    r = await owner.post(
        f"/api/v1/plots/{plot['id']}/review", json={"decision": "confirm_compliant", "note": "ok"}
    )
    assert r.status_code == 422 and r.json()["errors"][0]["field"] == "note"
    r = await owner.post(
        f"/api/v1/plots/{plot['id']}/review", json={"decision": "confirm_non_compliant", "note": ""}
    )
    assert r.status_code == 200 and r.json()["verdict"] == "non_compliant"
    r = await owner.post(f"/api/v1/plots/{plot['id']}/review", json={"decision": "approve", "note": ""})
    assert r.status_code == 422


async def test_reassessment_is_reproducible_and_appended(owner) -> None:
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    r = await owner.post(f"/api/v1/plots/{plot['id']}/assess")
    assert r.status_code == 200
    history = (await owner.get(f"/api/v1/plots/{plot['id']}/assessments")).json()
    assert len(history) == 2
    assert history[0]["id"] == r.json()["id"]
    assert history[0]["inputsHash"] == history[1]["inputsHash"]
    assert history[0]["resultHash"] == history[1]["resultHash"]


async def test_auto_assess_off_leaves_plot_pending(owner) -> None:
    await owner.patch("/api/v1/org", json={"settings": {"autoAssess": False}})
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    assert plot["verdict"] == "pending" and plot["latestAssessment"] is None
    r = await owner.post(
        f"/api/v1/plots/{plot['id']}/review", json={"decision": "confirm_compliant", "note": ""}
    )
    assert r.status_code == 409 and r.json()["code"] == "not_assessed"
    assert (await owner.post(f"/api/v1/plots/{plot['id']}/assess")).json()["verdict"] == "compliant"


async def test_imagery_png(owner) -> None:
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    for kind in ("baseline", "current", "forest", "loss"):
        r = await owner.get(f"/api/v1/plots/{plot['id']}/imagery/{kind}.png")
        assert r.status_code == 200, kind
        assert r.headers["content-type"] == "image/png"
        assert r.headers["cache-control"] == "private, max-age=3600"
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert (await owner.get(f"/api/v1/plots/{plot['id']}/imagery/ndvi.png")).status_code == 422


async def test_similar_plots(owner) -> None:
    sup = await create_supplier(owner)
    plots = [
        await create_plot_from_demo(owner, sup["id"], dp) for dp in demo_by_scenario("compliant_farmland")[:3]
    ]
    r = await owner.get(f"/api/v1/plots/{plots[0]['id']}/similar?k=2")
    assert r.status_code == 200
    items = r.json()
    assert 1 <= len(items) <= 2
    assert all(0 <= i["similarity"] <= 1 for i in items)
    assert plots[0]["id"] not in {i["plot"]["id"] for i in items}


async def test_patch_and_archive(owner) -> None:
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    r = await owner.patch(f"/api/v1/plots/{plot['id']}", json={"reference": "CI-NAW-RENAMED"})
    assert r.status_code == 200 and r.json()["reference"] == "CI-NAW-RENAMED"
    assert (await owner.delete(f"/api/v1/plots/{plot['id']}")).status_code == 204
    assert (await owner.get(f"/api/v1/plots/{plot['id']}")).status_code == 404
    assert (await owner.get("/api/v1/plots")).json() == []
    actions = {i["action"] for i in (await owner.get("/api/v1/audit")).json()["items"]}
    assert {"plot.created", "plot.assessed", "plot.updated", "plot.archived"} <= actions


async def test_role_restrictions_on_plots(owner, make_client) -> None:
    sup = await create_supplier(owner)
    other = await create_supplier(owner, "Not Mine")
    auditor = await add_member(owner, make_client(), "auditor")
    dp = demo(CI_FARM)
    body = {
        "supplierId": sup["id"],
        "reference": "A-1",
        "commodity": "cocoa",
        "country": "CI",
        "geometry": dp.geometry,
    }
    assert (await auditor.post("/api/v1/plots", json=body)).status_code == 403
    supplier_user = await add_member(owner, make_client(), "supplier", supplier_id=sup["id"])
    assert (await supplier_user.post("/api/v1/plots", json=body)).status_code == 201
    foreign = {**body, "supplierId": other["id"], "reference": "A-2"}
    assert (await supplier_user.post("/api/v1/plots", json=foreign)).status_code == 404
    await create_plot_from_demo(owner, other["id"], demo_by_scenario("compliant_agroforest")[0])
    assert [p["reference"] for p in (await supplier_user.get("/api/v1/plots")).json()] == ["A-1"]
    assert (await supplier_user.get("/api/v1/reviews")).status_code == 403


async def test_point_plot_overlap_uses_its_footprint(owner) -> None:
    sup = await create_supplier(owner)
    dp = demo(CI_FARM)
    await create_plot_from_demo(owner, sup["id"], dp)
    lon, lat = dp.geometry["coordinates"][0][0]
    inside = {"type": "Point", "coordinates": [round(lon + 0.0004, 6), round(lat - 0.0012, 6)]}
    body = (
        await owner.post(
            "/api/v1/plots/validate", json={"geometry": inside, "country": "CI", "declaredAreaHa": 3}
        )
    ).json()
    assert body["valid"] is True and body["kind"] == "point"
    assert "overlap" in {i["code"] for i in body["issues"]}


async def test_dataset_versions_use_plain_labels(owner) -> None:
    sup = await create_supplier(owner)
    plot = await create_plot_from_demo(owner, sup["id"], demo(CI_FARM))
    a = plot["latestAssessment"]
    assert a["datasets"]["changeModel"].startswith("Land-change signal")
    assert "sha256" not in a["datasets"]["changeModel"]
    assert a["datasetIds"]["changeModel"] != a["datasets"]["changeModel"]
    assert "lossBefore2021Ha" in a
