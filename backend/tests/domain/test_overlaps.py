"""Overlap detection (DuckDB spatial and the Shapely fallback agree) and point footprints."""

from __future__ import annotations

import pytest
from shapely.geometry import shape

from app.spatial.geometry import as_polygon, circle, geodesic_area_ha, h3_cells
from app.spatial.overlaps import find_overlaps, plots_in_bbox, spatial_extension_available


def square(lon: float, lat: float, d: float = 0.002) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]],
    }


A = square(-6.612, 5.783)
HALF = square(-6.611, 5.783)  # shares half of A
TOUCH = square(-6.610, 5.783)  # shares only an edge
FAR = square(-6.5, 5.9)


@pytest.mark.parametrize("engine", ["shapely", "duckdb"])
def test_overlap_areas(engine: str) -> None:
    if engine == "duckdb" and not spatial_extension_available():
        pytest.skip("DuckDB spatial extension not available offline")
    res = find_overlaps(A, [("half", HALF), ("touch", TOUCH), ("far", FAR)], engine=engine)
    assert [pid for pid, _ in res] == ["half"]
    expected = geodesic_area_ha(shape(A)) / 2
    assert res[0][1] == pytest.approx(expected, rel=0.01)


def test_engines_agree() -> None:
    if not spatial_extension_available():
        pytest.skip("DuckDB spatial extension not available offline")
    others = [(f"p{i}", square(-6.6125 + i * 0.0007, 5.7825 + i * 0.0003)) for i in range(8)]
    a = find_overlaps(A, others, engine="duckdb")
    b = find_overlaps(A, others, engine="shapely")
    assert [p for p, _ in a] == [p for p, _ in b]
    for (_, x), (_, y) in zip(a, b, strict=True):
        assert x == pytest.approx(y, abs=1e-3)


def test_min_overlap_threshold_and_ordering() -> None:
    sliver = square(-6.6101, 5.783)  # ~0.0001 deg overlap strip (~2 ha * 5 %)
    res = find_overlaps(A, [("sliver", sliver), ("half", HALF)], min_overlap_ha=0.5)
    assert [p for p, _ in res] == ["half"]
    res_all = find_overlaps(A, [("sliver", sliver), ("half", HALF)], min_overlap_ha=0.0001)
    assert [p for p, _ in res_all] == ["half", "sliver"]


def test_points_and_invalid_candidates_are_ignored() -> None:
    assert find_overlaps({"type": "Point", "coordinates": [-6.611, 5.784]}, [("half", HALF)]) == []
    bowtie = {
        "type": "Polygon",
        "coordinates": [
            [[-6.612, 5.783], [-6.610, 5.785], [-6.610, 5.783], [-6.612, 5.785], [-6.612, 5.783]]
        ],
    }
    assert find_overlaps(A, [("bad", bowtie), ("junk", {"type": "Nope"})]) == []
    assert find_overlaps(A, []) == []


def test_point_footprint_is_a_circle_of_the_declared_area() -> None:
    c = circle(-6.640531, 5.752968, 3.2)
    assert geodesic_area_ha(shape(c)) == pytest.approx(3.2, rel=0.01)
    pt = {"type": "Point", "coordinates": [-6.640531, 5.752968]}
    assert as_polygon(pt, 3.2)["type"] == "Polygon"
    assert as_polygon(A, None) is A
    overlapping_point = as_polygon({"type": "Point", "coordinates": [-6.611, 5.784]}, 1.0)
    assert find_overlaps(overlapping_point, [("a", A)])[0][0] == "a"


def test_h3_cells_and_bbox() -> None:
    cell, parent = h3_cells(-6.611, 5.784)
    assert cell.startswith("89") and parent.startswith("85")
    assert plots_in_bbox((-6.62, 5.78, -6.60, 5.79), [("a", A), ("far", FAR)]) == ["a"]
