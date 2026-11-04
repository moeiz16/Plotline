"""Geometry helpers shared by validation, overlaps and the assessment: geodesic area, normalisation, circles.

All geometries are GeoJSON dicts in WGS84 (EPSG:4326) with ``[lon, lat]`` positions.
"""

from __future__ import annotations

import math
from itertools import pairwise
from typing import Any

import h3
from pyproj import CRS, Geod, Transformer
from shapely import geometry as sg
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shp_transform

GEOD = Geod(ellps="WGS84")
PRECISION = 6  # EUDR: at least six decimal places (about 0.1 m)
H3_RES = 9
H3_PARENT_RES = 5
M2_PER_HA = 10_000.0


def geodesic_area_ha(geom: BaseGeometry) -> float:
    """Area on the WGS84 ellipsoid in hectares (0 for points and lines)."""
    if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
        return 0.0
    area, _ = GEOD.geometry_area_perimeter(geom)
    return abs(area) / M2_PER_HA


def to_shape(geometry: dict) -> BaseGeometry:
    return sg.shape(geometry)


def round_coords(coords: Any, ndigits: int = PRECISION) -> Any:
    if isinstance(coords, (int, float)):
        return round(float(coords), ndigits)
    return [round_coords(c, ndigits) for c in coords]


def _ring(coords: list, ccw: bool) -> list:
    ring = sg.LinearRing(coords)
    if ring.is_ccw != ccw:
        coords = list(reversed(coords))
    return coords


def orient_polygon_coords(rings: list[list[list[float]]]) -> list[list[list[float]]]:
    """RFC 7946 winding: exterior ring counter-clockwise, holes clockwise."""
    return [_ring(r, ccw=(i == 0)) for i, r in enumerate(rings)]


def normalise(geometry: dict) -> dict:
    """Round to 6 decimals, drop altitude, close rings and fix winding. Input must be structurally valid."""
    gtype = geometry["type"]
    if gtype == "Point":
        return {"type": "Point", "coordinates": round_coords(list(geometry["coordinates"][:2]))}

    def poly(rings: list) -> list:
        out = []
        for ring in rings:
            pts = [round_coords(list(p[:2])) for p in ring]
            dedup = [pts[0]] + [p for prev, p in pairwise(pts) if p != prev]
            if dedup[0] != dedup[-1]:
                dedup.append(dedup[0])
            out.append(dedup)
        return orient_polygon_coords(out)

    if gtype == "Polygon":
        return {"type": "Polygon", "coordinates": poly(geometry["coordinates"])}
    if gtype == "MultiPolygon":
        return {"type": "MultiPolygon", "coordinates": [poly(p) for p in geometry["coordinates"]]}
    raise ValueError(f"unsupported geometry type {gtype}")


def centroid(geom: BaseGeometry) -> tuple[float, float]:
    c = geom.centroid if geom.geom_type != "Point" else geom
    return round(c.x, PRECISION), round(c.y, PRECISION)


def h3_cells(lon: float, lat: float) -> tuple[str, str]:
    """(res-9 cell, res-5 parent) of a point; the parent pre-filters overlap candidates."""
    cell = h3.latlng_to_cell(lat, lon, H3_RES)
    return cell, h3.cell_to_parent(cell, H3_PARENT_RES)


def circle(lon: float, lat: float, area_ha: float, n: int = 48) -> dict:
    """A geodesic circle of the given area centred on a point (how points are mapped and assessed)."""
    radius = math.sqrt(max(area_ha, 0.0) * M2_PER_HA / math.pi)
    lons, lats, _ = GEOD.fwd([lon] * n, [lat] * n, [i * 360.0 / n for i in range(n)], [radius] * n)
    ring = [[round(x, PRECISION), round(y, PRECISION)] for x, y in zip(lons, lats, strict=True)]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": orient_polygon_coords([ring])}


def as_polygon(geometry: dict, area_ha: float | None) -> dict:
    """Polygon footprint of a plot: polygons unchanged, points as a circle of the declared area."""
    if geometry["type"] == "Point":
        lon, lat = geometry["coordinates"][:2]
        return circle(lon, lat, area_ha or 0.0)
    return geometry


def utm_crs(lon: float, lat: float) -> CRS:
    zone = int((lon + 180) // 6) + 1
    return CRS.from_epsg((32600 if lat >= 0 else 32700) + min(max(zone, 1), 60))


def to_metric(geom: BaseGeometry, crs: CRS) -> BaseGeometry:
    fwd = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    return shp_transform(fwd.transform, geom)


def distance_m(geom_a: BaseGeometry, geom_b: BaseGeometry) -> float:
    """Approximate metric distance between two lon/lat geometries (local UTM projection)."""
    c = geom_a.centroid if not geom_a.is_empty else geom_b.centroid
    crs = utm_crs(c.x, c.y)
    return float(to_metric(geom_a, crs).distance(to_metric(geom_b, crs)))
