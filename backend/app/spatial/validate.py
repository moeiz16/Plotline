"""EUDR plot geometry validation (Regulation (EU) 2023/1115, Art. 2(28) and Art. 9(1)(d)).

Rules
- WGS84 longitude/latitude, at least six decimal places of precision (fewer -> warning).
- A single point is allowed only for plots of up to 4 ha and needs a declared area; larger plots need a
  polygon.
- Polygons / multipolygons: closed rings of at least four positions, no self-intersections, holes inside
  their shell, area above zero and at most 10,000 ha.
- Country plausibility: the centroid must lie in the declared country (1 km tolerance for border plots).

Messages are plain language because they are shown to suppliers and compliance teams.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

from shapely.geometry import shape
from shapely.validation import explain_validity

from app.spatial import countries
from app.spatial.geometry import PRECISION, centroid, geodesic_area_ha, h3_cells, normalise

POINT_MAX_HA = 4.0
MAX_PLOT_HA = 10_000.0
MIN_AREA_HA = 0.0001  # 1 m2: anything smaller is a line or a point drawn as a polygon
COUNTRY_TOLERANCE_M = 1_000.0
AREA_MISMATCH_SHARE = 0.2
SUPPORTED = ("Point", "Polygon", "MultiPolygon")


@dataclass
class Issue:
    code: str
    severity: Literal["error", "warning"]
    message: str
    field: str | None = None

    def as_dict(self) -> dict:
        return {"code": self.code, "severity": self.severity, "message": self.message, "field": self.field}


@dataclass
class ValidationResult:
    valid: bool
    issues: list[Issue] = field(default_factory=list)
    kind: Literal["point", "polygon"] | None = None
    area_ha: float | None = None
    normalized: dict | None = None
    centroid: tuple[float, float] | None = None
    h3_cell: str | None = None
    country_detected: str | None = None

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity == "warning"]


class _Invalid(Exception):
    pass


def _err(code: str, message: str, fld: str | None = "geometry") -> Issue:
    return Issue(code, "error", message, fld)


def _warn(code: str, message: str, fld: str | None = "geometry") -> Issue:
    return Issue(code, "warning", message, fld)


def _decimals(value: float) -> int:
    text = repr(float(value))
    if "e" in text or "E" in text:
        mantissa, exp = text.lower().split("e")
        frac = mantissa.split(".")[1] if "." in mantissa else ""
        return max(len(frac.rstrip("0")) - int(exp), 0)
    frac = text.split(".")[1] if "." in text else ""
    return len(frac.rstrip("0"))


def _positions(geometry: dict) -> list[list]:
    gtype = geometry["type"]
    c = geometry["coordinates"]
    if gtype == "Point":
        return [c]
    if gtype == "Polygon":
        return [p for ring in c for p in ring]
    return [p for poly in c for ring in poly for p in ring]


def _check_structure(geometry: object) -> dict:
    if not isinstance(geometry, dict):
        raise _Invalid("The geometry must be a GeoJSON object.")
    if geometry.get("type") == "Feature":
        geometry = geometry.get("geometry")
        if not isinstance(geometry, dict):
            raise _Invalid("The feature has no geometry.")
    gtype = geometry.get("type")
    if gtype not in SUPPORTED:
        raise _Invalid(
            f"Unsupported geometry type “{gtype}”. Use a point (plots up to 4 ha) or a polygon."
            if gtype
            else "The geometry has no type. Use a GeoJSON point or polygon."
        )
    coords = geometry.get("coordinates")

    def is_pos(p: object) -> bool:
        return (
            isinstance(p, (list, tuple))
            and len(p) >= 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in p)
            and all(math.isfinite(float(v)) for v in p)
        )

    def rings_ok(rings: object) -> bool:
        return (
            isinstance(rings, (list, tuple))
            and len(rings) > 0
            and all(isinstance(r, (list, tuple)) and all(is_pos(p) for p in r) for r in rings)
        )

    ok = (
        is_pos(coords)
        if gtype == "Point"
        else rings_ok(coords)
        if gtype == "Polygon"
        else isinstance(coords, (list, tuple)) and len(coords) > 0 and all(rings_ok(p) for p in coords)
    )
    if not ok:
        raise _Invalid("The coordinates are missing or are not numbers in [longitude, latitude] order.")
    return {"type": gtype, "coordinates": coords}


def validate_geometry(
    geometry: dict, country: str, declared_area_ha: float | None = None
) -> ValidationResult:
    issues: list[Issue] = []
    try:
        geom_in = _check_structure(geometry)
    except _Invalid as exc:
        return ValidationResult(valid=False, issues=[_err("invalid_geometry", str(exc))])

    positions = _positions(geom_in)
    if any(len(p) > 2 for p in positions):
        issues.append(
            _warn("altitude_ignored", "Altitude values were removed; only longitude and latitude are kept.")
        )

    # 1. WGS84 ranges
    bad = [p for p in positions if not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90)]
    if bad:
        swapped = all(-90 <= p[0] <= 90 and -180 <= p[1] <= 180 for p in bad)
        hint = " Longitude and latitude look swapped: GeoJSON uses [longitude, latitude]." if swapped else ""
        issues.append(
            _err(
                "coordinates_out_of_range",
                f"Coordinates must be WGS84 longitude (-180 to 180) and latitude (-90 to 90).{hint}",
            )
        )
        return ValidationResult(valid=False, issues=issues)

    # 2. precision (EUDR asks for six decimal places)
    # (a value like 5.123450 arrives as 5.12345, so warn only when most values are short, not any one)
    low = sum(1 for p in positions for v in p[:2] if _decimals(v) < PRECISION)
    if low > len(positions):  # more than half of the 2 * n values
        issues.append(
            _warn(
                "low_precision",
                "Coordinates have fewer than six decimal places. EUDR asks for at least six "
                "(about 10 cm); please re-export from the GPS or mapping tool at full precision.",
            )
        )

    gtype = geom_in["type"]
    declared = declared_area_ha
    if declared is not None and (
        not isinstance(declared, (int, float)) or not math.isfinite(declared) or declared <= 0
    ):
        issues.append(
            _err("invalid_area", "The declared area must be a positive number of hectares.", "declaredAreaHa")
        )
        declared = None

    # 3. rings
    if gtype in ("Polygon", "MultiPolygon"):
        polys = [geom_in["coordinates"]] if gtype == "Polygon" else geom_in["coordinates"]
        for poly in polys:
            for ring in poly:
                pts = [list(p[:2]) for p in ring]
                if pts and pts[0] != pts[-1]:
                    issues.append(
                        _warn(
                            "ring_not_closed",
                            "The boundary was not closed; the last point was joined back to the first.",
                        )
                    )
                    pts = [*pts, pts[0]]
                distinct = {tuple(p) for p in pts}
                if len(pts) < 4 or len(distinct) < 3:
                    issues.append(
                        _err(
                            "too_few_positions",
                            "A plot boundary needs at least three distinct "
                            "corners (four positions with the closing point).",
                        )
                    )
                    return ValidationResult(valid=False, issues=_dedupe(issues))

    normalized = normalise(geom_in)
    geom = shape(normalized)
    kind: Literal["point", "polygon"] = "point" if gtype == "Point" else "polygon"

    # 4. topology and area
    if kind == "polygon":
        if not geom.is_valid:
            reason = explain_validity(geom)
            if "Self-intersection" in reason:
                issues.append(
                    _err(
                        "self_intersection",
                        "The boundary crosses itself. Redraw the plot so the "
                        "edges do not cross (and parts of a multi-part plot do not overlap).",
                    )
                )
            elif "Hole lies outside shell" in reason or "Holes are nested" in reason:
                issues.append(
                    _err(
                        "hole_outside_shell",
                        "An excluded area (hole) lies outside or over the plot boundary.",
                    )
                )
            else:
                issues.append(
                    _err(
                        "invalid_geometry",
                        "The boundary is not a valid shape. Redraw the plot as a simple closed outline.",
                    )
                )
            return ValidationResult(valid=False, issues=_dedupe(issues), kind=kind, normalized=normalized)
        area = geodesic_area_ha(geom)
        if area < MIN_AREA_HA:
            issues.append(
                _err("zero_area", "The plot has no area. Check that the corners are not all on one line.")
            )
        elif area > MAX_PLOT_HA:
            issues.append(
                _err(
                    "plot_too_large",
                    f"The plot covers {area:,.0f} ha, which is not plausible for a "
                    "single production plot (limit 10,000 ha). Split it into its actual plots.",
                )
            )
        if declared is not None and area > 0:
            gap = abs(area - declared) / max(area, declared)
            if gap > AREA_MISMATCH_SHARE and abs(area - declared) > 0.1:
                issues.append(
                    _warn(
                        "area_mismatch",
                        f"The declared area ({declared:.2f} ha) differs from the "
                        f"mapped area ({area:.2f} ha).",
                        "declaredAreaHa",
                    )
                )
    else:
        if declared is None:
            if not any(i.code == "invalid_area" for i in issues):
                issues.append(
                    _err(
                        "point_needs_area",
                        "A single point needs the plot's area in hectares "
                        "(points are only allowed for plots of up to 4 ha).",
                        "declaredAreaHa",
                    )
                )
            area = None
        elif declared > POINT_MAX_HA:
            issues.append(
                _err(
                    "polygon_required",
                    f"Plots larger than 4 ha must be mapped as a polygon, not a "
                    f"single point (declared {declared:.2f} ha).",
                )
            )
            area = declared
        else:
            area = declared

    # 5. country plausibility
    lon, lat = centroid(geom)
    detected = countries.country_at(lon, lat)
    code = (country or "").upper()
    if not countries.known_country(code):
        issues.append(
            _err("unknown_country", "Choose the country of production (ISO country code).", "country")
        )
    elif detected != code:
        dist = countries.distance_to_country_m(lon, lat, code)
        if dist is None or dist > COUNTRY_TOLERANCE_M:
            where = countries.country_name(detected) if detected else "outside any country (at sea)"
            issues.append(
                _err(
                    "country_mismatch",
                    f"The plot lies in {where}, not in {countries.country_name(code)} as declared.",
                    "country",
                )
            )

    cell, _parent = h3_cells(lon, lat)
    issues = _dedupe(issues)
    return ValidationResult(
        valid=not any(i.severity == "error" for i in issues),
        issues=issues,
        kind=kind,
        area_ha=round(area, 4) if area is not None else None,
        normalized=normalized,
        centroid=(lon, lat),
        h3_cell=cell,
        country_detected=detected,
    )


def _dedupe(issues: list[Issue]) -> list[Issue]:
    seen: set[str] = set()
    out = []
    for i in issues:
        if i.code not in seen:
            seen.add(i.code)
            out.append(i)
    return out
