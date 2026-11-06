"""Bundled country boundaries and the EU country benchmarking table."""

from __future__ import annotations

import pytest

from app.rules.risk import list_countries, risk_tier, source
from app.spatial.countries import country_at, country_name


@pytest.mark.parametrize(
    "lon,lat,code",
    [
        (-6.61, 5.78, "CI"),
        (-2.49, 6.21, "GH"),
        (-45.43, -21.55, "BR"),
        (96.85, 4.62, "ID"),
        (-76.97, -6.03, "PE"),
        (10.0, 53.55, "DE"),
        (-5.0, 3.0, None),
    ],
)
def test_country_at(lon: float, lat: float, code: str | None) -> None:
    assert country_at(lon, lat) == code


def test_country_names() -> None:
    assert country_name("CI") == "Côte d'Ivoire"
    assert country_name("gh") == "Ghana"
    assert country_name("ZZ") == "ZZ"


@pytest.mark.parametrize(
    "code,tier",
    [
        ("GH", "low"),
        ("VN", "low"),
        ("IN", "low"),
        ("CN", "low"),
        ("US", "low"),
        ("DE", "low"),
        ("BR", "standard"),
        ("CI", "standard"),
        ("ID", "standard"),
        ("PE", "standard"),
        ("MY", "standard"),
        ("BY", "high"),
        ("MM", "high"),
        ("KP", "high"),
        ("RU", "high"),
        ("ru", "high"),
        ("", "standard"),
    ],
)
def test_risk_tiers(code: str, tier: str) -> None:
    assert risk_tier(code) == tier


def test_list_countries_shape() -> None:
    rows = list_countries()
    assert len(rows) > 200
    by = {r["code"]: r for r in rows}
    assert by["CI"] == {
        "code": "CI",
        "name": "Côte d'Ivoire",
        "riskTier": "standard",
        "commodities": ["cocoa", "coffee", "oil_palm", "rubber", "wood"],
    }
    assert [r["name"] for r in rows] == sorted(r["name"] for r in rows)


def test_benchmarking_source_is_cited() -> None:
    s = source()
    assert "2025/1093" in s["source"]
    assert "verify" in s["note"].lower()
