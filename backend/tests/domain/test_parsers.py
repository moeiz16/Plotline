"""Upload parsing: GeoJSON, KML and CSV (points or WKT), with row-level issues instead of exceptions."""

from __future__ import annotations

import json

from app.spatial.parsers import parse_upload
from app.spatial.validate import validate_geometry

POLY = [
    [
        [-6.611873, 5.783412],
        [-6.609912, 5.783401],
        [-6.609735, 5.785322],
        [-6.611688, 5.785517],
        [-6.611873, 5.783412],
    ]
]


def issue_codes(rows, i=0) -> set[str]:
    return {x.code for x in rows[i].issues}


def test_geojson_feature_collection() -> None:
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"reference": "CI-001", "area_ha": 4.6},
                "geometry": {"type": "Polygon", "coordinates": POLY},
            },
            {
                "type": "Feature",
                "properties": {"Plot ID": "CI-002", "Area": "2.5"},
                "geometry": {"type": "Point", "coordinates": [-6.640531, 5.752968]},
            },
        ],
    }
    rows = parse_upload("plots.geojson", json.dumps(fc).encode())
    assert [r.row for r in rows] == [1, 2]
    assert [r.reference for r in rows] == ["CI-001", "CI-002"]
    assert rows[0].declared_area_ha == 4.6 and rows[1].declared_area_ha == 2.5
    assert all(not r.issues for r in rows)
    assert validate_geometry(rows[1].geometry, "CI", rows[1].declared_area_ha).valid


def test_geojson_bare_geometry_needs_a_reference() -> None:
    rows = parse_upload("one.json", json.dumps({"type": "Polygon", "coordinates": POLY}).encode())
    assert len(rows) == 1 and rows[0].geometry["type"] == "Polygon"
    assert "missing_reference" in issue_codes(rows)


def test_geojson_feature_id_is_used_as_reference() -> None:
    feat = {
        "type": "Feature",
        "id": "GH-77",
        "properties": None,
        "geometry": {"type": "Polygon", "coordinates": POLY},
    }
    rows = parse_upload("f.geojson", json.dumps(feat).encode())
    assert rows[0].reference == "GH-77" and not rows[0].issues


def test_geojson_invalid_json() -> None:
    rows = parse_upload("broken.geojson", b'{"type": "FeatureCollection", ')
    assert rows[0].row == 0 and "parse_error" in issue_codes(rows)


def test_geojson_single_multipoint_becomes_point_but_many_points_are_rejected() -> None:
    fc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"ref": "A"},
                "geometry": {"type": "MultiPoint", "coordinates": [[1.0, 6.0]]},
            },
            {
                "type": "Feature",
                "properties": {"ref": "B"},
                "geometry": {"type": "MultiPoint", "coordinates": [[1.0, 6.0], [1.1, 6.1]]},
            },
            {"type": "Feature", "properties": {"ref": "C"}, "geometry": None},
        ],
    }
    rows = parse_upload("x.geojson", json.dumps(fc).encode())
    assert rows[0].geometry == {"type": "Point", "coordinates": [1.0, 6.0]}
    assert "unsupported_geometry" in issue_codes(rows, 1)
    assert "missing_geometry" in issue_codes(rows, 2)


def test_geojson_invalid_area_value() -> None:
    feat = {
        "type": "Feature",
        "properties": {"reference": "A", "area_ha": "big"},
        "geometry": {"type": "Point", "coordinates": [1.0, 6.0]},
    }
    rows = parse_upload("x.geojson", json.dumps(feat).encode())
    assert "invalid_number" in issue_codes(rows)


KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>GH-WNR-0101</name>
    <ExtendedData><Data name="area_ha"><value>3.8</value></Data></ExtendedData>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>
      -2.486135,6.214877,0 -2.484001,6.214900,0 -2.484100,6.216800,0 -2.486135,6.214877,0
    </coordinates></LinearRing></outerBoundaryIs></Polygon>
  </Placemark>
  <Placemark><name>GH-WNR-0102</name>
    <ExtendedData><SchemaData><SimpleData name="area_ha">1,5</SimpleData></SchemaData></ExtendedData>
    <Point><coordinates>-2.611087,6.158240,0</coordinates></Point>
  </Placemark>
  <Placemark><name>GH-WNR-0103</name>
    <MultiGeometry>
      <Polygon><outerBoundaryIs><LinearRing>
        <coordinates>0,6 0.001,6 0.001,6.001 0,6</coordinates>
      </LinearRing></outerBoundaryIs></Polygon>
      <Polygon><outerBoundaryIs><LinearRing>
        <coordinates>0.01,6 0.011,6 0.011,6.001 0.01,6</coordinates>
      </LinearRing></outerBoundaryIs></Polygon>
    </MultiGeometry>
  </Placemark>
</Document></kml>"""


def test_kml_polygons_points_and_multigeometry() -> None:
    rows = parse_upload("farms.KML", KML.encode())
    assert [r.reference for r in rows] == ["GH-WNR-0101", "GH-WNR-0102", "GH-WNR-0103"]
    assert rows[0].geometry["type"] == "Polygon" and rows[0].declared_area_ha == 3.8
    assert rows[0].geometry["coordinates"][0][0] == [-2.486135, 6.214877]
    assert rows[1].geometry == {"type": "Point", "coordinates": [-2.611087, 6.15824]}
    assert "invalid_number" in issue_codes(rows, 1)  # "1,5" is not a valid number in KML
    assert rows[2].geometry["type"] == "MultiPolygon" and len(rows[2].geometry["coordinates"]) == 2


def test_kml_with_entities_is_rejected() -> None:
    evil = (
        '<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY x "boom">]>'
        "<kml><Placemark><name>&x;</name></Placemark></kml>"
    )
    rows = parse_upload("evil.kml", evil.encode())
    assert rows[0].row == 0 and "parse_error" in issue_codes(rows)


def test_kml_malformed() -> None:
    assert "parse_error" in issue_codes(parse_upload("bad.kml", b"<kml><Placemark>"))


def test_csv_points_with_area() -> None:
    text = "reference,latitude,longitude,area_ha\nCI-1,5.752968,-6.640531,3.2\nCI-2,5.783412,-6.611873,\n"
    rows = parse_upload("plots.csv", text.encode())
    assert [r.row for r in rows] == [2, 3]
    assert rows[0].geometry == {"type": "Point", "coordinates": [-6.640531, 5.752968]}
    assert rows[0].declared_area_ha == 3.2 and rows[1].declared_area_ha is None
    assert not rows[0].issues


def test_csv_semicolon_with_decimal_commas_and_bom() -> None:
    text = "﻿Reference;Lat;Lon;Area ha\nPE-1;-6,031584;-76,972407;3,7\n"
    rows = parse_upload("plots.csv", text.encode("utf-8"))
    assert rows[0].reference == "PE-1"
    assert rows[0].geometry["coordinates"] == [-76.972407, -6.031584]
    assert rows[0].declared_area_ha == 3.7


def test_csv_wkt() -> None:
    text = "reference,wkt,area_ha\n"
    text += 'BR-1,"POLYGON ((-45.43 -21.55, -45.42 -21.55, -45.42 -21.54, -45.43 -21.55))",\n'
    text += "BR-2,POLYGON broken,\n"
    rows = parse_upload("plots.csv", text.encode())
    assert rows[0].geometry["type"] == "Polygon"
    assert isinstance(rows[0].geometry["coordinates"][0][0], list)
    assert "invalid_wkt" in issue_codes(rows, 1)


def test_csv_row_level_issues() -> None:
    text = "reference,latitude,longitude\n,5.75,-6.64\nX,north,-6.64\nY,,\n"
    rows = parse_upload("p.csv", text.encode())
    assert "missing_reference" in issue_codes(rows, 0)
    assert "invalid_number" in issue_codes(rows, 1)
    assert "missing_coordinates" in issue_codes(rows, 2)


def test_csv_without_coordinate_columns() -> None:
    rows = parse_upload("p.csv", b"name,owner\nA,B\n")
    assert rows[0].row == 0 and "missing_columns" in issue_codes(rows)


def test_unsupported_and_empty_files() -> None:
    assert "unsupported_file_type" in issue_codes(parse_upload("plots.xlsx", b"PK..."))
    assert "empty_file" in issue_codes(parse_upload("plots.csv", b"  \n"))
    assert "no_plots" in issue_codes(parse_upload("p.geojson", b'{"type":"FeatureCollection","features":[]}'))
