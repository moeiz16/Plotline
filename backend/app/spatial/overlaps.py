"""Plot overlap detection with DuckDB spatial (in-process), falling back to Shapely.

The caller pre-filters candidates by H3 res-5 parent cell; this module computes exact intersections and
reports overlap areas in hectares (geodesic). Points must be passed as their circle footprint
(``geometry.as_polygon``); bare points have no area and never overlap.
"""

from __future__ import annotations

import logging
import threading
from functools import lru_cache

import duckdb
from shapely import STRtree, wkb
from shapely.errors import ShapelyError
from shapely.geometry import box, shape
from shapely.geometry.base import BaseGeometry

from app.spatial.geometry import geodesic_area_ha

log = logging.getLogger(__name__)
_lock = threading.Lock()


@lru_cache(maxsize=1)
def spatial_extension_available() -> bool:
    try:
        con = duckdb.connect()
        try:
            con.execute("LOAD spatial")
        except duckdb.Error:
            con.execute("INSTALL spatial")
            con.execute("LOAD spatial")
        con.close()
        return True
    except Exception as exc:  # offline without the extension cached, or blocked
        log.warning("duckdb spatial extension unavailable, using shapely: %s", exc)
        return False


def _areal(geom: BaseGeometry) -> bool:
    return geom.geom_type in ("Polygon", "MultiPolygon") and not geom.is_empty


def _overlaps_duckdb(
    target: BaseGeometry, others: list[tuple[str, BaseGeometry]]
) -> list[tuple[str, BaseGeometry]]:
    with _lock:
        con = duckdb.connect()
        try:
            con.execute("LOAD spatial")
            con.execute("CREATE TABLE plots (id VARCHAR, wkb BLOB)")
            con.executemany("INSERT INTO plots VALUES (?, ?)", [(pid, g.wkb) for pid, g in others])
            rows = con.execute(
                """
                SELECT id, ST_AsWKB(ST_Intersection(ST_GeomFromWKB(wkb), ST_GeomFromWKB(?)))
                FROM plots
                WHERE ST_Intersects(ST_GeomFromWKB(wkb), ST_GeomFromWKB(?))
                """,
                [target.wkb, target.wkb],
            ).fetchall()
        finally:
            con.close()
    return [(pid, wkb.loads(bytes(blob))) for pid, blob in rows]


def _overlaps_shapely(
    target: BaseGeometry, others: list[tuple[str, BaseGeometry]]
) -> list[tuple[str, BaseGeometry]]:
    tree = STRtree([g for _, g in others])
    out = []
    for i in tree.query(target, predicate="intersects"):
        pid, g = others[int(i)]
        out.append((pid, g.intersection(target)))
    return out


def find_overlaps(
    geometry: dict, others: list[tuple[str, dict]], min_overlap_ha: float = 0.01, engine: str = "auto"
) -> list[tuple[str, float]]:
    """[(other_plot_id, overlap_ha)] for other plots sharing at least ``min_overlap_ha``, largest first."""
    try:
        target = shape(geometry)
    except (ShapelyError, ValueError, TypeError, AttributeError, KeyError):
        return []
    if not _areal(target) or not target.is_valid:
        return []
    cands = []
    for pid, g in others:
        try:
            geom = shape(g)
        except (ShapelyError, ValueError, TypeError, AttributeError, KeyError):
            continue
        if _areal(geom) and geom.is_valid:
            cands.append((pid, geom))
    if not cands:
        return []
    use_duckdb = engine == "duckdb" or (engine == "auto" and spatial_extension_available())
    pairs = _overlaps_duckdb(target, cands) if use_duckdb else _overlaps_shapely(target, cands)
    result = []
    for pid, inter in pairs:
        area = geodesic_area_ha(inter)
        if area >= min_overlap_ha:
            result.append((pid, round(area, 4)))
    return sorted(result, key=lambda t: (-t[1], t[0]))


def plots_in_bbox(bbox: tuple[float, float, float, float], plots: list[tuple[str, dict]]) -> list[str]:
    """Ids of plots intersecting a (min_lon, min_lat, max_lon, max_lat) box."""
    area = box(*bbox)
    return [pid for pid, g in plots if shape(g).intersects(area)]
