"""Plotline evaluation gates (``make eval``; runs from ``backend/`` with the backend venv, fully offline).

Gates
1. Geometry rules   - labelled EUDR geometry cases: expected validity and issue codes (100 % required).
2. Verdict rules    - rule-table cases for the decision logic, and every seeded demo plot's assessed verdict
                      against its intended scenario (100 % required).
3. Reproducibility  - repeated assessments give identical results and hashes (100 % required).
4. Mass balance     - labelled shipment cases: expected status and failing checks (100 % required).
5. Change signal    - the LeJEPA land-change signal against Hansen forest loss on regions held out of training
                      (``ml/artifacts/eval.json``): ROC-AUC must beat chance by a margin, the NumPy encoder
                      must reproduce PyTorch, and the bundled landscape must show the intended change levels.

Writes ``eval/RESULTS.md`` (committed snapshot) and ``eval/reports/latest.json``; exits 1 if a gate fails.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.assessment.engine import PlotInput, assess_plot  # noqa: E402
from app.eo.demo import DEMO_PLOTS  # noqa: E402
from app.ml.change import load_encoder  # noqa: E402
from app.ml.encoder import embed  # noqa: E402
from app.rules.massbalance import AllocationIn, check_shipment  # noqa: E402
from app.rules.verdict import Evidence, decide  # noqa: E402
from app.spatial.validate import validate_geometry  # noqa: E402

ARTIFACTS = ROOT / "ml" / "artifacts"
MIN_HELD_OUT_AUC = 0.60

_SQ = [
    [-6.611873, 5.783412],
    [-6.609912, 5.783401],
    [-6.609735, 5.785322],
    [-6.611688, 5.785517],
    [-6.611873, 5.783412],
]
_PT = {"type": "Point", "coordinates": [-6.640531, 5.752968]}

GEOMETRY_CASES: list[tuple[str, dict, str, float | None, bool, set[str]]] = [
    ("valid polygon", {"type": "Polygon", "coordinates": [_SQ]}, "CI", None, True, set()),
    ("valid point 3 ha", _PT, "CI", 3.0, True, set()),
    ("point exactly 4 ha", _PT, "CI", 4.0, True, set()),
    ("point without area", _PT, "CI", None, False, {"point_needs_area"}),
    ("point above 4 ha", _PT, "CI", 6.5, False, {"polygon_required"}),
    (
        "low precision",
        {"type": "Polygon", "coordinates": [[[round(x, 4), round(y, 4)] for x, y in _SQ]]},
        "CI",
        None,
        True,
        {"low_precision"},
    ),
    (
        "self-intersection",
        {"type": "Polygon", "coordinates": [[_SQ[0], _SQ[2], _SQ[1], _SQ[3], _SQ[0]]]},
        "CI",
        None,
        False,
        {"self_intersection"},
    ),
    ("unclosed ring", {"type": "Polygon", "coordinates": [_SQ[:-1]]}, "CI", None, True, {"ring_not_closed"}),
    (
        "two positions",
        {"type": "Polygon", "coordinates": [[_SQ[0], _SQ[1], _SQ[0]]]},
        "CI",
        None,
        False,
        {"too_few_positions"},
    ),
    ("wrong country", {"type": "Polygon", "coordinates": [_SQ]}, "GH", None, False, {"country_mismatch"}),
    ("at sea", {"type": "Point", "coordinates": [-5.0, 3.0]}, "CI", 2.0, False, {"country_mismatch"}),
    (
        "out of range",
        {"type": "Point", "coordinates": [5.75, -96.64]},
        "CI",
        2.0,
        False,
        {"coordinates_out_of_range"},
    ),
    (
        "too large",
        {
            "type": "Polygon",
            "coordinates": [[[-6.9, 5.6], [-6.5, 5.6], [-6.5, 6.0], [-6.9, 6.0], [-6.9, 5.6]]],
        },
        "CI",
        None,
        False,
        {"plot_too_large"},
    ),
    (
        "line string",
        {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        "CI",
        None,
        False,
        {"invalid_geometry"},
    ),
    ("area mismatch", {"type": "Polygon", "coordinates": [_SQ]}, "CI", 15.0, True, {"area_mismatch"}),
    ("unknown country", {"type": "Polygon", "coordinates": [_SQ]}, "XX", None, False, {"unknown_country"}),
]

VERDICT_CASES: list[tuple[float, str | None, str, bool]] = [
    (0.0, "low", "compliant", False),
    (0.0, "elevated", "compliant", False),
    (0.0, "high", "needs_review", True),
    (0.0, None, "compliant", False),
    (0.2, "low", "needs_review", True),
    (0.49, "high", "needs_review", True),
    (0.5, "high", "non_compliant", False),
    (0.5, None, "non_compliant", False),
    (3.0, "low", "non_compliant", True),
]


def _alloc(
    ref: str,
    qty: float,
    verdict: str = "compliant",
    area: float = 5.0,
    country: str = "CI",
    other: float = 0.0,
    reviewed: bool = False,
) -> AllocationIn:
    return AllocationIn(ref, ref, "cocoa", area, verdict, qty, other, country, reviewed=reviewed)


SHIPMENT_CASES: list[tuple[str, list[AllocationIn], float, str, set[str]]] = [
    ("ready", [_alloc("A", 4_000), _alloc("B", 3_000)], 7_000, "ready", set()),
    (
        "non-compliant plot",
        [_alloc("A", 4_000), _alloc("B", 3_000, "non_compliant")],
        7_000,
        "blocked",
        {"no_non_compliant", "mixing"},
    ),
    ("mass balance overrun", [_alloc("A", 9_000, area=4)], 9_000, "blocked", {"mass_balance"}),
    ("same-year overrun", [_alloc("A", 3_000, area=4, other=4_000)], 3_000, "blocked", {"mass_balance"}),
    (
        "unreviewed plot",
        [_alloc("A", 4_000), _alloc("B", 1_000, "needs_review")],
        5_000,
        "blocked",
        {"reviews_complete", "mixing"},
    ),
    ("unassessed plot", [_alloc("A", 1_000, "pending")], 1_000, "blocked", {"plots_assessed", "mixing"}),
    ("volume not traced", [_alloc("A", 3_000)], 5_000, "blocked", {"quantities_match"}),
    (
        "no plots",
        [],
        5_000,
        "blocked",
        {"allocations_present", "quantities_match", "mass_balance", "plots_assessed"},
    ),
    ("high-risk origin", [_alloc("A", 1_000, country="MM")], 1_000, "blocked", {"high_risk_review"}),
    ("high-risk reviewed", [_alloc("A", 1_000, country="MM", reviewed=True)], 1_000, "ready", set()),
]


def gate_geometry() -> dict:
    failures = []
    for name, geom, country, area, valid, expected in GEOMETRY_CASES:
        r = validate_geometry(geom, country, area)
        got = {i.code for i in r.issues}
        if r.valid != valid or not expected <= got or (not expected and got):
            failures.append({"case": name, "valid": r.valid, "codes": sorted(got)})
    n = len(GEOMETRY_CASES)
    return {
        "cases": n,
        "passed": n - len(failures),
        "accuracy": round((n - len(failures)) / n, 4),
        "failures": failures,
        "pass": not failures,
    }


def _as_input(p) -> PlotInput:
    v = validate_geometry(p.geometry, p.country, p.declared_area_ha)
    return PlotInput(p.reference, p.reference, v.normalized, p.commodity, p.country, v.area_ha)


def gate_verdicts() -> tuple[dict, dict]:
    failures = []
    for loss, level, verdict, review in VERDICT_CASES:
        ev = Evidence(
            3.0,
            0.5,
            loss,
            {"2022": loss} if loss else {},
            change_score=None if level is None else 0.1,
            change_level=level,
        )  # type: ignore[arg-type]
        d = decide(ev)
        if (d.verdict, d.review_required) != (verdict, review):
            failures.append({"loss": loss, "level": level, "got": [d.verdict, d.review_required]})
    demo_fail = []
    levels: dict[str, str | None] = {}
    t0 = time.perf_counter()
    for p in DEMO_PLOTS:
        r = assess_plot(_as_input(p), source="bundled")
        levels[p.reference] = r.metrics["changeLevel"]
        if r.verdict != p.expected_verdict:
            demo_fail.append({"plot": p.reference, "scenario": p.scenario, "got": r.verdict})
    ms = (time.perf_counter() - t0) * 1000 / len(DEMO_PLOTS)
    n = len(VERDICT_CASES) + len(DEMO_PLOTS)
    bad = len(failures) + len(demo_fail)
    gate = {
        "rule_cases": len(VERDICT_CASES),
        "demo_plots": len(DEMO_PLOTS),
        "passed": n - bad,
        "accuracy": round((n - bad) / n, 4),
        "failures": failures + demo_fail,
        "pass": bad == 0,
        "assessment_ms_per_plot": round(ms, 1),
    }
    return gate, levels


def gate_reproducibility() -> dict:
    mismatches = []
    for p in DEMO_PLOTS[::3]:
        from app.assessment import engine

        a = assess_plot(_as_input(p), source="bundled")
        engine._CACHE.clear()
        b = assess_plot(_as_input(p), source="bundled")
        if (a.inputs_hash, a.result_hash, a.embedding) != (b.inputs_hash, b.result_hash, b.embedding):
            mismatches.append(p.reference)
    n = len(DEMO_PLOTS[::3])
    return {"plots": n, "identical": n - len(mismatches), "mismatches": mismatches, "pass": not mismatches}


def gate_massbalance() -> dict:
    failures = []
    for name, allocs, qty, status, failing in SHIPMENT_CASES:
        ev = check_shipment(allocs, qty, 2026)
        got = {c.code for c in ev.checks if c.status == "fail"}
        if ev.status != status or got != failing:
            failures.append({"case": name, "status": ev.status, "failing": sorted(got)})
    n = len(SHIPMENT_CASES)
    return {
        "cases": n,
        "passed": n - len(failures),
        "accuracy": round((n - len(failures)) / n, 4),
        "failures": failures,
        "pass": not failures,
    }


def gate_change_signal(levels: dict[str, str | None]) -> dict:
    path = ARTIFACTS / "eval.json"
    if not path.exists():
        return {"pass": False, "error": "ml/artifacts/eval.json missing: run `make train` and `make ml-eval`"}
    rep = json.loads(path.read_text())
    held = rep["held_out_regions"]
    lejepa = held["lejepa"]
    w = load_encoder(ARTIFACTS / "encoder.npz")
    parity = None
    if w is not None and (ARTIFACTS / "reference.npz").exists():
        ref = np.load(ARTIFACTS / "reference.npz")
        parity = float(np.abs(embed(w, ref["inputs"]) - ref["embeddings"]).max())
    by_scenario: dict[str, set] = {}
    for p in DEMO_PLOTS:
        by_scenario.setdefault(p.scenario, set()).add(levels.get(p.reference))
    landscape_ok = (
        by_scenario.get("review_land_change") == {"high"}
        and by_scenario.get("non_compliant_regrowth") == {"low"}
        and "high" not in by_scenario.get("compliant_farmland", set())
    )
    checks = {
        "held_out_auc": lejepa.get("roc_auc", 0) >= MIN_HELD_OUT_AUC,
        "numpy_parity": parity is not None and parity < 1e-3,
        "bundled_landscape_levels": landscape_ok,
    }
    return {
        "held_out": {
            k: {
                m: v.get(m)
                for m in ("roc_auc", "average_precision", "precision", "recall", "f1", "n", "positives")
            }
            for k, v in held.items()
        },
        "all_regions_auc": {k: v.get("roc_auc") for k, v in rep["all_regions"].items()},
        "api_threshold": rep.get("api_threshold"),
        "min_held_out_auc": MIN_HELD_OUT_AUC,
        "numpy_vs_torch_max_abs": parity,
        "checks": checks,
        "pass": all(checks.values()),
    }


def _md(r: dict) -> str:
    g, v, rp, mb, cs = (
        r["geometry"],
        r["verdicts"],
        r["reproducibility"],
        r["mass_balance"],
        r["change_signal"],
    )

    def ok(x: bool) -> str:
        return "PASS" if x else "FAIL"

    lines = [
        "# Plotline evaluation gates",
        "",
        f"Run {r['generated_at']} · offline (bundled landscape) · overall: **{ok(r['pass'])}**",
        "",
        "| Gate | Result | Detail |",
        "|---|---|---|",
        f"| Geometry rules | {ok(g['pass'])} | {g['passed']}/{g['cases']} labelled EUDR geometry cases |",
        f"| Verdict rules | {ok(v['pass'])} | {v['passed']}/{v['rule_cases'] + v['demo_plots']} "
        f"({v['rule_cases']} rule-table cases + {v['demo_plots']} demo plots); "
        f"{v['assessment_ms_per_plot']} ms per assessment |",
        f"| Reproducibility | {ok(rp['pass'])} | {rp['identical']}/{rp['plots']} re-assessments identical "
        "(hashes, embedding) |",
        f"| Mass balance | {ok(mb['pass'])} | {mb['passed']}/{mb['cases']} labelled shipment cases |",
        f"| Change signal | {ok(cs['pass'])} | held-out AUC >= {cs.get('min_held_out_auc')}, "
        "NumPy = PyTorch, demo landscape levels |",
        "",
    ]
    if "held_out" in cs:
        lines += [
            "## Land-change signal vs Hansen loss, regions held out of training",
            "",
            "| Score | ROC-AUC | Avg. precision | Precision | Recall | F1 | n (pos) |",
            "|---|---|---|---|---|---|---|",
        ]
        for name, m in cs["held_out"].items():
            lines.append(
                f"| {name} | {m['roc_auc']} | {m['average_precision']} | {m['precision']} | {m['recall']} | "
                f"{m['f1']} | {m['n']} ({m['positives']}) |"
            )
        auc = cs["all_regions_auc"]
        lines += [
            "",
            f"Across all nine regions (training landscapes included) the LeJEPA score reaches ROC-AUC "
            f"{auc.get('lejepa')} against {auc.get('nbr_drop')} for the NBR index and {auc.get('ndvi_drop')} "
            "for NDVI: at demo scale it is a second signal that routes plots to review, not a classifier.",
        ]
        lines += [
            "",
            f"Operating threshold used by the API: {cs['api_threshold']} (cosine distance). "
            f"NumPy vs PyTorch max abs difference: {cs['numpy_vs_torch_max_abs']:.1e}."
            if cs["numpy_vs_torch_max_abs"] is not None
            else "",
            "",
            "Full report: `ml/artifacts/EVAL.md`.",
            "",
        ]
    failures = [f for k in ("geometry", "verdicts", "mass_balance") for f in r[k]["failures"]]
    if failures:
        lines += ["## Failures", "", "```", json.dumps(failures, indent=2), "```", ""]
    return "\n".join(lines)


def main() -> int:
    geometry = gate_geometry()
    verdicts, levels = gate_verdicts()
    report = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "geometry": geometry,
        "verdicts": verdicts,
        "reproducibility": gate_reproducibility(),
        "mass_balance": gate_massbalance(),
        "change_signal": gate_change_signal(levels),
    }
    report["pass"] = all(
        report[k]["pass"]
        for k in ("geometry", "verdicts", "reproducibility", "mass_balance", "change_signal")
    )
    out = ROOT / "eval" / "reports"
    out.mkdir(parents=True, exist_ok=True)
    (out / "latest.json").write_text(json.dumps(report, indent=2))
    md = _md(report)
    (ROOT / "eval" / "RESULTS.md").write_text(md)
    print(md)
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
