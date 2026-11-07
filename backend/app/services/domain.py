"""Gateway to the domain core (spatial rules, country benchmarking, mass balance, assessment engine).

The domain core is plain, deterministic Python (see docs/API_CONTRACT.md Part 3). Every call from the
platform goes through this module so imports stay lazy (the API boots even while a domain module is being
rebuilt) and tests can substitute a single seam.
"""

from __future__ import annotations

import dataclasses
from typing import Any


def as_dict(obj: Any) -> Any:
    """Dataclass / object / dict → plain dict (recursively for lists)."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj
    if isinstance(obj, list | tuple):
        return [as_dict(o) for o in obj]
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    if hasattr(obj, "__dict__"):
        return dict(vars(obj))
    return obj


def issue_out(issue: Any) -> dict:
    d = as_dict(issue) or {}
    return {
        "code": d.get("code", "invalid"),
        "severity": d.get("severity", "error"),
        "message": d.get("message", ""),
        "field": d.get("field"),
    }


# ── Spatial ──────────────────────────────────────────────────────────────────
def validate_geometry(geometry: dict, country: str, declared_area_ha: float | None = None) -> Any:
    from app.spatial.validate import validate_geometry as _validate

    return _validate(geometry, country, declared_area_ha)


def parse_upload(filename: str, content: bytes) -> list[Any]:
    from app.spatial.parsers import parse_upload as _parse

    return _parse(filename, content)


def find_overlaps(
    geometry: dict, others: list[tuple[str, dict]], min_overlap_ha: float = 0.01
) -> list[tuple[str, float]]:
    if not others:
        return []
    from app.spatial.overlaps import find_overlaps as _overlaps

    return _overlaps(geometry, others, min_overlap_ha)


def country_name(code: str) -> str:
    try:
        from app.spatial.countries import country_name as _name

        return _name(code)
    except Exception:
        return code


# ── Rules ────────────────────────────────────────────────────────────────────
def risk_tier(country: str) -> str:
    try:
        from app.rules.risk import risk_tier as _tier

        return _tier(country)
    except Exception:
        return "standard"


def list_countries() -> list[dict]:
    from app.rules.risk import list_countries as _list

    return _list()


def plot_capacity_kg(commodity: str, area_ha: float) -> float:
    from app.rules.massbalance import plot_capacity_kg as _cap

    return _cap(commodity, area_ha)


def make_allocation(**fields: Any) -> Any:
    """Build the domain `AllocationIn`, passing only the fields it declares (it may grow new ones)."""
    from app.rules.massbalance import AllocationIn

    if dataclasses.is_dataclass(AllocationIn):
        names = {f.name for f in dataclasses.fields(AllocationIn)}
        return AllocationIn(**{k: v for k, v in fields.items() if k in names})
    return AllocationIn(**fields)  # pragma: no cover - non-dataclass variant


def check_shipment(allocations: list[Any], shipment_qty_kg: float, harvest_year: int) -> Any:
    from app.rules.massbalance import check_shipment as _check

    return _check(allocations, shipment_qty_kg, harvest_year)


# ── Assessment engine ────────────────────────────────────────────────────────
def plot_input(**fields: Any) -> Any:
    from app.assessment.engine import PlotInput

    return PlotInput(**fields)


def assess_plot(plot: Any) -> Any:
    from app.assessment.engine import assess_plot as _assess

    return _assess(plot)


def render_imagery(plot: Any, kind: str) -> bytes:
    from app.assessment.engine import render_imagery as _render

    return _render(plot, kind)  # type: ignore[arg-type]


def similar_plots(
    target: list[float], candidates: list[tuple[str, list[float]]], k: int = 6
) -> list[tuple[str, float]]:
    if not candidates:
        return []
    from app.assessment.engine import similar_plots as _similar

    return _similar(target, candidates, k)


def demo_plots() -> list[Any]:
    from app.eo.demo import DEMO_PLOTS

    return list(DEMO_PLOTS)
