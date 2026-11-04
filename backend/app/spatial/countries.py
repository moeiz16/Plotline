"""Country lookup from bundled boundaries (Natural Earth 1:50m admin-0, public domain, simplified ~400 m).

Read-only data loaded once; used for the EUDR country plausibility check and for display names.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from shapely import STRtree, box, contains_xy
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from app.spatial.geometry import distance_m

DATA = Path(__file__).parent / "data" / "countries.geojson"

# Preferred English short names where the source differs (EU / ISO usage).
_NAME_OVERRIDES = {
    "CI": "Côte d'Ivoire",
    "CD": "Democratic Republic of the Congo",
    "CG": "Republic of the Congo",
    "KP": "North Korea",
    "KR": "South Korea",
    "LA": "Laos",
    "MM": "Myanmar",
    "RU": "Russia",
    "VN": "Vietnam",
    "CZ": "Czechia",
    "TR": "Türkiye",
    "SZ": "Eswatini",
    "MK": "North Macedonia",
    "BO": "Bolivia",
    "VE": "Venezuela",
    "TZ": "Tanzania",
    "SY": "Syria",
    "IR": "Iran",
    "GB": "United Kingdom",
    "US": "United States",
}


class _Index:
    def __init__(self) -> None:
        raw = json.loads(DATA.read_text(encoding="utf-8"))
        parts: dict[str, list[BaseGeometry]] = {}
        names: dict[str, str] = {}
        for f in raw["features"]:
            code = f["properties"]["code"]
            parts.setdefault(code, []).append(shape(f["geometry"]))
            names.setdefault(code, f["properties"]["name"])
        self.codes = sorted(parts)
        self.geoms = [unary_union(parts[c]) for c in self.codes]
        self.by_code = dict(zip(self.codes, self.geoms, strict=True))
        self.names = {c: _NAME_OVERRIDES.get(c, names[c]) for c in self.codes}
        self.tree = STRtree(self.geoms)


@lru_cache(maxsize=1)
def _index() -> _Index:
    return _Index()


def country_at(lon: float, lat: float) -> str | None:
    """ISO 3166-1 alpha-2 code of the country containing the point, or None (sea / unknown)."""
    idx = _index()
    for i in idx.tree.query(Point(lon, lat)):
        if contains_xy(idx.geoms[int(i)], lon, lat):
            return idx.codes[int(i)]
    return None


def country_name(code: str) -> str:
    code = (code or "").upper()
    return _index().names.get(code, _NAME_OVERRIDES.get(code, code))


def known_country(code: str) -> bool:
    return (code or "").upper() in _index().by_code


def all_countries() -> list[tuple[str, str]]:
    idx = _index()
    return sorted(((c, idx.names[c]) for c in idx.codes), key=lambda t: t[1])


def distance_to_country_m(lon: float, lat: float, code: str, search_deg: float = 0.1) -> float | None:
    """Metres from the point to the country's border (0 inside); None when farther than ~10 km."""
    geom = _index().by_code.get((code or "").upper())
    if geom is None:
        return None
    if contains_xy(geom, lon, lat):
        return 0.0
    near = geom.intersection(box(lon - search_deg, lat - search_deg, lon + search_deg, lat + search_deg))
    if near.is_empty:
        return None
    return distance_m(Point(lon, lat), near)
