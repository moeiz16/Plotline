"""EUDR geometry rules: precision, points vs polygons, topology, area limits and country plausibility."""

from __future__ import annotations

import pytest
from shapely.geometry import Point, shape
from shapely.ops import nearest_points

from app.spatial import countries
from app.spatial.geometry import geodesic_area_ha
from app.spatial.validate import validate_geometry

# ~4.6 ha cocoa field near Soubré, Côte d'Ivoire (6-decimal coordinates)
FIELD = {
    "type": "Polygon",
    "coordinates": [
        [
            [-6.611873, 5.783412],
            [-6.609912, 5.783401],
            [-6.609735, 5.785322],
            [-6.611688, 5.785517],
            [-6.611873, 5.783412],
        ]
    ],
}


def codes(result) -> set[str]:
    return {i.code for i in result.issues}


def test_valid_polygon_is_normalised_and_indexed() -> None:
    r = validate_geometry(FIELD, "CI")
    assert r.valid and r.issues == []
    assert r.kind == "polygon"
    assert 4.0 < r.area_ha < 5.0
    assert r.country_detected == "CI"
    assert r.h3_cell is not None and len(r.h3_cell) == 15
    ring = r.normalized["coordinates"][0]
    assert ring[0] == ring[-1]
    assert shape(r.normalized).exterior.is_ccw
    lon, lat = r.centroid
    assert -6.612 < lon < -6.609 and 5.783 < lat < 5.786


def test_clockwise_ring_is_reoriented() -> None:
    cw = {"type": "Polygon", "coordinates": [list(reversed(FIELD["coordinates"][0]))]}
    r = validate_geometry(cw, "CI")
    assert r.valid
    assert shape(r.normalized).exterior.is_ccw


def test_feature_wrapper_is_accepted() -> None:
    r = validate_geometry({"type": "Feature", "properties": {}, "geometry": FIELD}, "CI")
    assert r.valid


def test_point_needs_declared_area() -> None:
    r = validate_geometry({"type": "Point", "coordinates": [-6.640531, 5.752968]}, "CI")
    assert not r.valid
    assert "point_needs_area" in codes(r)


@pytest.mark.parametrize("area,valid", [(0.5, True), (3.99, True), (4.0, True), (4.01, False), (12.0, False)])
def test_point_allowed_only_up_to_four_hectares(area: float, valid: bool) -> None:
    r = validate_geometry({"type": "Point", "coordinates": [-6.640531, 5.752968]}, "CI", area)
    assert r.valid is valid
    assert r.kind == "point"
    if not valid:
        assert "polygon_required" in codes(r)
    else:
        assert r.area_ha == area


def test_negative_declared_area_is_rejected() -> None:
    r = validate_geometry({"type": "Point", "coordinates": [-6.640531, 5.752968]}, "CI", -2)
    assert "invalid_area" in codes(r)
    assert not r.valid


def test_low_precision_is_a_warning_not_an_error() -> None:
    coarse = {
        "type": "Polygon",
        "coordinates": [
            [[-6.6119, 5.7834], [-6.6099, 5.7834], [-6.6097, 5.7853], [-6.6117, 5.7855], [-6.6119, 5.7834]]
        ],
    }
    r = validate_geometry(coarse, "CI")
    assert r.valid
    assert [i.code for i in r.issues] == ["low_precision"]
    assert r.issues[0].severity == "warning"


def test_occasional_trailing_zero_is_not_flagged() -> None:
    # 5.785320 serialises as 5.78532: one short value among many must not raise a warning
    poly = {
        "type": "Polygon",
        "coordinates": [
            [
                [-6.611873, 5.783412],
                [-6.609912, 5.783401],
                [-6.609735, 5.78532],
                [-6.611688, 5.785517],
                [-6.611873, 5.783412],
            ]
        ],
    }
    assert "low_precision" not in codes(validate_geometry(poly, "CI"))


def test_point_with_low_precision_warns() -> None:
    r = validate_geometry({"type": "Point", "coordinates": [-6.64, 5.75]}, "CI", 2)
    assert r.valid and "low_precision" in codes(r)


def test_self_intersection_is_an_error() -> None:
    bowtie = {
        "type": "Polygon",
        "coordinates": [
            [
                [-6.611873, 5.783412],
                [-6.609735, 5.785322],
                [-6.609912, 5.783401],
                [-6.611688, 5.785517],
                [-6.611873, 5.783412],
            ]
        ],
    }
    r = validate_geometry(bowtie, "CI")
    assert not r.valid
    assert "self_intersection" in codes(r)


def test_unclosed_ring_is_closed_with_a_warning() -> None:
    open_ring = {"type": "Polygon", "coordinates": [FIELD["coordinates"][0][:-1]]}
    r = validate_geometry(open_ring, "CI")
    assert r.valid
    assert "ring_not_closed" in codes(r)
    ring = r.normalized["coordinates"][0]
    assert ring[0] == ring[-1]


def test_too_few_positions() -> None:
    r = validate_geometry(
        {"type": "Polygon", "coordinates": [[[-6.61, 5.78], [-6.60, 5.78], [-6.61, 5.78]]]}, "CI"
    )
    assert not r.valid and "too_few_positions" in codes(r)


def test_collinear_ring_is_rejected() -> None:
    line = {
        "type": "Polygon",
        "coordinates": [[[-6.611, 5.781], [-6.610, 5.782], [-6.609, 5.783], [-6.611, 5.781]]],
    }
    r = validate_geometry(line, "CI")
    assert not r.valid
    assert codes(r) & {"zero_area", "invalid_geometry", "self_intersection"}


def test_coordinates_out_of_range_with_swap_hint() -> None:
    swapped = {"type": "Point", "coordinates": [5.752968, -96.640531]}
    r = validate_geometry(swapped, "CI", 2)
    assert not r.valid and "coordinates_out_of_range" in codes(r)
    assert "swapped" in r.issues[0].message


@pytest.mark.parametrize(
    "bad",
    [
        {"type": "LineString", "coordinates": [[0, 0], [1, 1]]},
        {"type": "Polygon", "coordinates": [[["a", "b"], [1, 1], [1, 0], ["a", "b"]]]},
        {"type": "Point", "coordinates": [float("nan"), 5.0]},
        {"type": "Point"},
        {"coordinates": [1, 2]},
        "not a geometry",
    ],
)
def test_malformed_input_is_invalid(bad) -> None:
    r = validate_geometry(bad, "CI", 1)
    assert not r.valid
    assert "invalid_geometry" in codes(r)


def test_altitude_is_dropped_with_a_warning() -> None:
    r = validate_geometry({"type": "Point", "coordinates": [-6.640531, 5.752968, 210.0]}, "CI", 2)
    assert r.valid and "altitude_ignored" in codes(r)
    assert r.normalized["coordinates"] == [-6.640531, 5.752968]


def test_plot_larger_than_ten_thousand_hectares() -> None:
    big = {
        "type": "Polygon",
        "coordinates": [[[-6.9, 5.6], [-6.5, 5.6], [-6.5, 6.0], [-6.9, 6.0], [-6.9, 5.6]]],
    }
    r = validate_geometry(big, "CI")
    assert not r.valid and "plot_too_large" in codes(r)


def test_declared_area_mismatch_is_a_warning() -> None:
    r = validate_geometry(FIELD, "CI", declared_area_ha=12.0)
    assert r.valid and "area_mismatch" in codes(r)
    assert "area_mismatch" not in codes(validate_geometry(FIELD, "CI", declared_area_ha=4.7))


def test_multipolygon_parts_must_not_overlap() -> None:
    a = FIELD["coordinates"]
    shifted = [[[x + 0.0005, y] for x, y in a[0]]]
    r = validate_geometry({"type": "MultiPolygon", "coordinates": [a, shifted]}, "CI")
    assert not r.valid and "self_intersection" in codes(r)
    far = [[[x + 0.01, y] for x, y in a[0]]]
    ok = validate_geometry({"type": "MultiPolygon", "coordinates": [a, far]}, "CI")
    assert ok.valid and ok.area_ha == pytest.approx(2 * validate_geometry(FIELD, "CI").area_ha, rel=0.01)


def test_hole_outside_shell() -> None:
    hole = [[-6.600, 5.790], [-6.600, 5.791], [-6.599, 5.791], [-6.599, 5.790], [-6.600, 5.790]]
    r = validate_geometry({"type": "Polygon", "coordinates": [FIELD["coordinates"][0], hole]}, "CI")
    assert not r.valid and "hole_outside_shell" in codes(r)


def test_hole_reduces_area() -> None:
    hole = [[-6.6110, 5.7840], [-6.6105, 5.7840], [-6.6105, 5.7845], [-6.6110, 5.7845], [-6.6110, 5.7840]]
    r = validate_geometry({"type": "Polygon", "coordinates": [FIELD["coordinates"][0], hole]}, "CI")
    assert r.valid
    assert r.area_ha < validate_geometry(FIELD, "CI").area_ha


def test_country_mismatch() -> None:
    r = validate_geometry(FIELD, "GH")
    assert not r.valid and "country_mismatch" in codes(r)
    assert "Côte d'Ivoire" in next(i.message for i in r.issues if i.code == "country_mismatch")


def test_plot_at_sea() -> None:
    r = validate_geometry({"type": "Point", "coordinates": [-5.0, 3.0]}, "CI", 2)
    assert "country_mismatch" in codes(r)


def test_unknown_country_code() -> None:
    r = validate_geometry(FIELD, "XX")
    assert not r.valid and "unknown_country" in codes(r)


def test_border_tolerance_of_one_kilometre() -> None:
    ci = countries._index().by_code["CI"]
    border = nearest_points(ci.boundary, Point(-2.9, 7.6))[0]
    # just east of the border (inside Ghana) by ~450 m: plausible for either country
    near = {"type": "Point", "coordinates": [round(border.x + 0.004, 6), round(border.y, 6)]}
    assert validate_geometry(near, "CI", 2).valid
    assert validate_geometry(near, "GH", 2).valid
    # ~3 km inside Ghana: no longer plausible for Côte d'Ivoire
    far = {"type": "Point", "coordinates": [round(border.x + 0.03, 6), round(border.y, 6)]}
    assert "country_mismatch" in codes(validate_geometry(far, "CI", 2))


def test_geodesic_area_matches_known_square() -> None:
    # 0.001 deg x 0.001 deg at the equator is ~111.3 m x 110.6 m = ~1.23 ha
    sq = shape({"type": "Polygon", "coordinates": [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]]})
    assert geodesic_area_ha(sq) == pytest.approx(1.2308, rel=0.01)
