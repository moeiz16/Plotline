"""Shipment checks: traceability, mass balance per harvest year, verdicts, reviews, mixing, high risk."""

from __future__ import annotations

import pytest

from app.rules.massbalance import AllocationIn, check_shipment, plot_capacity_kg

CODES = [
    "allocations_present",
    "quantities_match",
    "mass_balance",
    "plots_assessed",
    "no_non_compliant",
    "reviews_complete",
    "mixing",
    "geometry_valid",
    "high_risk_review",
]


def alloc(
    ref: str = "CI-1",
    qty: float = 3_000,
    verdict: str = "compliant",
    area: float = 4.0,
    other: float = 0,
    country: str = "CI",
    commodity: str = "cocoa",
    **kw,
) -> AllocationIn:
    return AllocationIn(ref, ref, commodity, area, verdict, qty, other, country, **kw)


def status(ev, code: str) -> str:
    return next(c.status for c in ev.checks if c.code == code)


def test_clean_shipment_is_ready_with_all_checks() -> None:
    ev = check_shipment([alloc("A", 3_000), alloc("B", 2_000)], 5_000, 2026)
    assert ev.status == "ready"
    assert [c.code for c in ev.checks] == CODES
    assert all(c.status == "pass" for c in ev.checks)
    assert ev.mixing == {"mixed": False, "verifiedKg": 5_000.0, "unverifiedKg": 0.0}
    assert ev.mass_balance[0] == {
        "plotId": "A",
        "reference": "A",
        "allocatedKg": 3_000.0,
        "capacityKg": 6_000.0,
        "utilisationPct": 50.0,
        "ok": True,
    }
    assert ev.issues == 0


def test_no_allocations_blocks() -> None:
    ev = check_shipment([], 5_000, 2026)
    assert ev.status == "blocked"
    assert status(ev, "allocations_present") == "fail"
    assert status(ev, "quantities_match") == "fail"


@pytest.mark.parametrize("allocated,expected", [(4_990, "pass"), (4_000, "fail"), (5_600, "fail")])
def test_quantities_must_match(allocated: float, expected: str) -> None:
    ev = check_shipment([alloc("A", allocated, area=10)], 5_000, 2026)
    assert status(ev, "quantities_match") == expected


def test_mass_balance_overrun_blocks() -> None:
    # 4 ha of cocoa cannot produce 9 t in one year (plausible max 1.5 t/ha)
    ev = check_shipment([alloc("A", 9_000, area=4)], 9_000, 2026)
    assert ev.status == "blocked"
    assert status(ev, "mass_balance") == "fail"
    assert ev.mass_balance[0]["ok"] is False
    assert ev.mass_balance[0]["utilisationPct"] == 150.0


def test_other_shipments_of_the_same_year_count() -> None:
    ev = check_shipment([alloc("A", 2_000, area=4, other=4_500)], 2_000, 2026)
    assert status(ev, "mass_balance") == "fail"
    assert ev.mass_balance[0]["allocatedKg"] == 6_500.0


def test_near_capacity_warns_but_stays_ready() -> None:
    ev = check_shipment([alloc("A", 5_700, area=4)], 5_700, 2026)
    assert status(ev, "mass_balance") == "warn"
    assert ev.status == "ready"


def test_non_compliant_plot_blocks() -> None:
    ev = check_shipment([alloc("A", 3_000), alloc("B", 1_000, verdict="non_compliant")], 4_000, 2026)
    assert ev.status == "blocked"
    assert status(ev, "no_non_compliant") == "fail"
    assert "B" in next(c.detail for c in ev.checks if c.code == "no_non_compliant")
    assert ev.mixing["mixed"] is True


def test_pending_plot_blocks() -> None:
    ev = check_shipment([alloc("A", 1_000, verdict="pending")], 1_000, 2026)
    assert status(ev, "plots_assessed") == "fail"
    assert status(ev, "mixing") == "fail"  # nothing verified


def test_unreviewed_plot_and_mixing_block() -> None:
    ev = check_shipment([alloc("A", 3_000), alloc("B", 1_500, verdict="needs_review")], 4_500, 2026)
    assert status(ev, "reviews_complete") == "fail"
    assert status(ev, "mixing") == "fail"
    assert ev.mixing == {"mixed": True, "verifiedKg": 3_000.0, "unverifiedKg": 1_500.0}


def test_invalid_geometry_blocks() -> None:
    ev = check_shipment([alloc("A", 1_000, geometry_valid=False)], 1_000, 2026)
    assert status(ev, "geometry_valid") == "fail"


def test_high_risk_origin_needs_review() -> None:
    ev = check_shipment([alloc("RU-1", 1_000, country="RU", commodity="wood", area=1)], 1_000, 2026)
    assert status(ev, "high_risk_review") == "fail"
    ok = check_shipment(
        [alloc("RU-1", 1_000, country="RU", commodity="wood", area=1, reviewed=True)], 1_000, 2026
    )
    assert status(ok, "high_risk_review") == "pass"
    assert ok.status == "ready"


def test_low_risk_origins_mention_simplified_due_diligence() -> None:
    ev = check_shipment([alloc("GH-1", 1_000, country="GH")], 1_000, 2026)
    assert "simplified" in next(c.detail for c in ev.checks if c.code == "high_risk_review")


@pytest.mark.parametrize(
    "commodity,area,expected",
    [
        ("cocoa", 2.0, 3_000.0),
        ("coffee", 10.0, 30_000.0),
        ("oil_palm", 1.0, 30_000.0),
        ("soy", 0.0, 0.0),
        ("unknown", 5.0, 0.0),
    ],
)
def test_plot_capacity(commodity: str, area: float, expected: float) -> None:
    assert plot_capacity_kg(commodity, area) == expected


def test_zero_quantity_allocations_are_ignored_and_as_dict_is_camel_case() -> None:
    ev = check_shipment([alloc("A", 1_000), alloc("B", 0)], 1_000, 2026)
    assert [r["plotId"] for r in ev.mass_balance] == ["A"]
    d = ev.as_dict()
    assert set(d) == {"status", "checks", "massBalance", "mixing"}
    assert set(d["checks"][0]) == {"code", "status", "label", "detail"}
