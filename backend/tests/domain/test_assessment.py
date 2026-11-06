"""Assessment engine on the bundled landscape: demo scenarios, reproducibility, imagery, similarity."""

from __future__ import annotations

import dataclasses
import io

import numpy as np
import pytest
from PIL import Image

from app.assessment import PlotInput, assess_plot, engine, render_imagery, similar_plots
from app.eo.demo import DEMO_PLOTS, SCENARIOS
from app.eo.rasters import EvidenceUnavailable
from app.eo.synthetic import scenario_for
from app.ml.change import load_encoder
from app.spatial.validate import validate_geometry

HAS_ENCODER = load_encoder() is not None
needs_encoder = pytest.mark.skipif(not HAS_ENCODER, reason="encoder.npz not exported")
METRIC_KEYS = {
    "forest2020Ha",
    "forest2020Share",
    "lossAfter2020Ha",
    "lossByYear",
    "treeCover2000Pct",
    "cloudFreeShare",
    "changeScore",
    "changeLevel",
    "signalsAgree",
}


def as_input(p) -> PlotInput:
    v = validate_geometry(p.geometry, p.country, p.declared_area_ha)
    return PlotInput(
        id=p.reference,
        reference=p.reference,
        geometry=v.normalized,
        commodity=p.commodity,
        country=p.country,
        area_ha=v.area_ha,
    )


@pytest.fixture(scope="module")
def results() -> dict:
    return {p.reference: assess_plot(as_input(p), source="bundled") for p in DEMO_PLOTS}


def test_demo_set_matches_the_seed_plan() -> None:
    assert len(DEMO_PLOTS) == 26
    assert len({p.reference for p in DEMO_PLOTS}) == 26
    assert {p.supplier_key for p in DEMO_PLOTS} == {
        "coop-nawa",
        "cavally-cocoa",
        "wn-cocoa-union",
        "sul-minas-cafe",
        "rondonia-robusta",
        "gayo-highland",
        "sulawesi-kakao",
        "san-martin-coop",
    }
    assert {p.scenario for p in DEMO_PLOTS} == set(SCENARIOS)
    points = [p for p in DEMO_PLOTS if p.geometry["type"] == "Point"]
    assert points and all(p.declared_area_ha <= 4 for p in points)
    verdicts = [p.expected_verdict for p in DEMO_PLOTS if p.assess_on_seed]
    assert (verdicts.count("compliant"), verdicts.count("needs_review"), verdicts.count("non_compliant")) == (
        15,
        5,
        3,
    )


@pytest.mark.parametrize("plot", DEMO_PLOTS, ids=lambda p: p.reference)
def test_demo_geometry_is_valid_in_its_country(plot) -> None:
    v = validate_geometry(plot.geometry, plot.country, plot.declared_area_ha)
    assert v.valid, v.issues
    assert v.country_detected == plot.country
    warnings = {i.code for i in v.issues}
    assert warnings == ({"low_precision"} if plot.scenario == "compliant_low_precision" else set())


@pytest.mark.parametrize("plot", DEMO_PLOTS, ids=lambda p: p.reference)
def test_demo_scenario_verdicts(plot, results) -> None:
    if plot.scenario == "review_land_change" and not HAS_ENCODER:
        pytest.skip("needs the land-change encoder")
    r = results[plot.reference]
    assert r.verdict == plot.expected_verdict, (r.headline, r.metrics)
    assert set(r.metrics) >= METRIC_KEYS
    assert r.source == "bundled"


def test_contract_example_plot(results) -> None:
    r = results["CI-NAW-0007"]
    assert r.verdict == "non_compliant"
    assert r.headline == "2.42 ha of forest cleared in 2022"
    assert r.metrics["lossByYear"] == {"2022": 2.42}


@needs_encoder
def test_land_change_signal_on_the_demo_landscape(results) -> None:
    levels = {ref: r.metrics["changeLevel"] for ref, r in results.items()}
    by_scenario: dict[str, set] = {}
    for p in DEMO_PLOTS:
        by_scenario.setdefault(p.scenario, set()).add(levels[p.reference])
    assert by_scenario["review_land_change"] == {"high"}
    assert by_scenario["non_compliant_regrowth"] == {"low"}
    assert "high" not in by_scenario["compliant_farmland"] | by_scenario["compliant_agroforest"]
    assert by_scenario["compliant_cloudy"] == {None}
    regrowth = results["CI-CAV-0003"]
    assert regrowth.review_required and regrowth.metrics["signalsAgree"] is False
    nc = [results[p.reference] for p in DEMO_PLOTS if p.scenario == "non_compliant"]
    assert all(r.metrics["signalsAgree"] for r in nc)


def test_cloudy_plot_has_no_change_score(results) -> None:
    r = results["BR-SMC-0003"]
    assert r.metrics["changeScore"] is None and r.metrics["cloudFreeShare"] < 0.9
    assert r.verdict == "compliant"


def test_reproducible_results() -> None:
    p = as_input(DEMO_PLOTS[3])
    engine._CACHE.clear()
    a = assess_plot(p, source="bundled")
    engine._CACHE.clear()
    b = assess_plot(dataclasses.replace(p, id="other-id"), source="bundled")
    assert a.as_dict() == b.as_dict()
    assert a.inputs_hash == b.inputs_hash and a.result_hash == b.result_hash
    assert a.embedding == b.embedding
    c = assess_plot(dataclasses.replace(p, commodity="coffee"), source="bundled")
    assert c.inputs_hash != a.inputs_hash


def test_dataset_versions_are_recorded(results) -> None:
    d = results["GH-WNR-0001"].datasets
    assert set(d) == {"forest2020", "forestLoss", "imagery", "changeModel", "rules"}
    assert d["rules"] == "eudr-rules-2026.1"
    assert "GFC2020" in d["forest2020"] and "GFC-2025-v1.13" in d["forestLoss"]
    if HAS_ENCODER:
        assert d["changeModel"].startswith("plotline-lejepa-s2-v1")
        assert len(results["GH-WNR-0001"].embedding) == 128


def test_new_plots_get_a_deterministic_landscape() -> None:
    geom = {
        "type": "Polygon",
        "coordinates": [[[-2.40, 6.30], [-2.398, 6.30], [-2.398, 6.302], [-2.40, 6.302], [-2.40, 6.30]]],
    }
    assert scenario_for("NEW-1", geom) == scenario_for("NEW-2", geom)
    p = PlotInput("x", "NEW-1", geom, "cocoa", "GH", 4.9)
    assert assess_plot(p, source="bundled").result_hash == assess_plot(p, source="bundled").result_hash
    # a demo reference at another location does not borrow the demo scenario
    assert scenario_for("CI-NAW-0007", geom) == scenario_for("ANY", geom)


def test_live_mode_without_evidence_is_pending(monkeypatch) -> None:
    import app.eo.live as live

    def unavailable(*_a, **_k):
        raise EvidenceUnavailable("offline")

    monkeypatch.setattr(live, "live_rasters", unavailable)
    engine._CACHE.clear()
    r = assess_plot(as_input(DEMO_PLOTS[0]), source="live")
    assert r.verdict == "pending" and r.source == "live"
    assert r.reasons[0]["code"] == "evidence_unavailable"
    assert r.embedding is None


@pytest.mark.parametrize("kind", ["baseline", "current", "forest", "loss"])
def test_imagery_png(kind: str) -> None:
    png = render_imagery(as_input(DEMO_PLOTS[3]), kind)
    img = Image.open(io.BytesIO(png))
    assert img.format == "PNG" and img.size[0] >= 256 and img.mode == "RGB"


def test_loss_overlay_shows_red_where_forest_was_cleared() -> None:
    img = np.asarray(Image.open(io.BytesIO(render_imagery(as_input(DEMO_PLOTS[3]), "loss"))))
    red = (img[..., 0] > 180) & (img[..., 1] < 120) & (img[..., 2] < 100)
    assert red.mean() > 0.01
    clean = np.asarray(Image.open(io.BytesIO(render_imagery(as_input(DEMO_PLOTS[0]), "loss"))))
    assert ((clean[..., 0] > 180) & (clean[..., 1] < 120) & (clean[..., 2] < 100)).mean() < 0.001


def test_imagery_rejects_unknown_kind() -> None:
    with pytest.raises(ValueError):
        render_imagery(as_input(DEMO_PLOTS[0]), "infrared")  # type: ignore[arg-type]


def test_imagery_placeholder_when_live_evidence_is_missing(monkeypatch) -> None:
    import app.eo.live as live

    monkeypatch.setattr(engine, "_source", lambda: "live")
    monkeypatch.setattr(live, "live_rasters", lambda *a, **k: (_ for _ in ()).throw(EvidenceUnavailable("x")))
    engine._CACHE.clear()
    assert render_imagery(as_input(DEMO_PLOTS[1]), "current").startswith(b"\x89PNG")


def test_similar_plots_ranking() -> None:
    t = [1.0, 0.0, 0.0]
    cands = [
        ("same", [2.0, 0.0, 0.0]),
        ("orth", [0.0, 1.0, 0.0]),
        ("opp", [-1.0, 0.0, 0.0]),
        ("none", None),
        ("short", [1.0]),
    ]
    res = similar_plots(t, cands, k=6)
    assert res == [("same", 1.0), ("orth", 0.5), ("opp", 0.0)]
    assert similar_plots(t, cands, k=1) == [("same", 1.0)]
    assert similar_plots([], cands) == [] and similar_plots([0.0, 0.0, 0.0], cands) == []


@needs_encoder
def test_similar_plots_on_demo_embeddings(results) -> None:
    emb = {ref: r.embedding for ref, r in results.items() if r.embedding}
    target = emb["CI-NAW-0002"]
    res = similar_plots(target, [(k, v) for k, v in emb.items() if k != "CI-NAW-0002"], k=5)
    assert len(res) == 5
    assert all(0 <= s <= 1 for _, s in res)
    assert [s for _, s in res] == sorted((s for _, s in res), reverse=True)
