"""Parse plot uploads: GeoJSON (.geojson/.json), KML (.kml) and CSV (.csv).

CSV layouts (header row required, comma or semicolon separated):
- ``reference,latitude,longitude[,area_ha]`` (one point per row; ``lat``/``lon``/``lng`` also accepted)
- ``reference,wkt[,area_ha]`` (WKT point, polygon or multipolygon in lon/lat order)

Parsing only extracts geometries; EUDR rules are applied afterwards by ``validate_geometry``. ``row`` is the
1-based feature / placemark number, or the line number in a CSV file (the header is line 1).
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

from shapely import wkt as shapely_wkt
from shapely.errors import ShapelyError
from shapely.geometry import mapping

from app.spatial.validate import Issue

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ROWS = 5_000
_REF_KEYS = ("reference", "ref", "plot_reference", "plotreference", "plot_id", "plotid", "id", "name", "code")
_AREA_KEYS = ("area_ha", "areaha", "declared_area_ha", "declaredareaha", "area", "hectares", "ha")
_LAT_KEYS = ("latitude", "lat", "y")
_LON_KEYS = ("longitude", "lon", "lng", "long", "x")


@dataclass
class ParsedPlot:
    row: int
    reference: str | None
    geometry: dict | None
    declared_area_ha: float | None
    issues: list[Issue] = field(default_factory=list)


def _file_issue(code: str, message: str) -> list[ParsedPlot]:
    return [
        ParsedPlot(
            row=0,
            reference=None,
            geometry=None,
            declared_area_ha=None,
            issues=[Issue(code, "error", message, "file")],
        )
    ]


def parse_upload(filename: str, content: bytes) -> list[ParsedPlot]:
    name = (filename or "").lower()
    if len(content) > MAX_UPLOAD_BYTES:
        return _file_issue("file_too_large", "The file is larger than 10 MB. Split it into smaller files.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:  # pragma: no cover - latin-1 decodes any byte string
            return _file_issue("unreadable_file", "The file could not be read as text.")
    if not text.strip():
        return _file_issue("empty_file", "The file is empty.")
    if name.endswith((".geojson", ".json")):
        rows = _parse_geojson(text)
    elif name.endswith(".kml"):
        rows = _parse_kml(text)
    elif name.endswith(".csv"):
        rows = _parse_csv(text)
    else:
        return _file_issue(
            "unsupported_file_type", "Upload a GeoJSON (.geojson), KML (.kml) or CSV (.csv) file."
        )
    if len(rows) > MAX_ROWS:
        return _file_issue(
            "too_many_plots", f"The file has {len(rows):,} plots; the limit per upload is {MAX_ROWS:,}."
        )
    if not rows:
        return _file_issue("no_plots", "No plots were found in the file.")
    return rows


# ── helpers ────────────────────────────────────────────────────────────────


def _norm_key(key: str) -> str:
    return re.sub(r"[\s\-]", "_", str(key).strip().lower()).replace("__", "_")


def _pick(props: dict, keys: tuple[str, ...]) -> object:
    lowered = {_norm_key(k).replace("_", ""): v for k, v in props.items()}
    for k in keys:
        v = lowered.get(k.replace("_", ""))
        if v not in (None, ""):
            return v
    return None


def _to_float(value: object, decimal_comma: bool = False) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        f = float(value)
    else:
        s = str(value).strip().replace(" ", "").replace(" ", "")
        if decimal_comma:
            s = s.replace(",", ".")
        try:
            f = float(s)
        except ValueError:
            return None
    return f if math.isfinite(f) else None


def _ref(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s[:64] or None


def _area(props: dict, decimal_comma: bool = False) -> tuple[float | None, list[Issue]]:
    raw = _pick(props, _AREA_KEYS)
    if raw is None:
        return None, []
    val = _to_float(raw, decimal_comma)
    if val is None:
        return None, [
            Issue("invalid_number", "error", f"The area “{raw}” is not a number of hectares.", "area_ha")
        ]
    return val, []


# ── GeoJSON ────────────────────────────────────────────────────────────────


def _parse_geojson(text: str) -> list[ParsedPlot]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return _file_issue("parse_error", f"The file is not valid GeoJSON (line {exc.lineno}).")
    if not isinstance(data, dict):
        return _file_issue("parse_error", "The file is not a GeoJSON object.")
    if data.get("type") == "FeatureCollection":
        feats = data.get("features")
        if not isinstance(feats, list):
            return _file_issue("parse_error", "The feature collection has no features list.")
    elif data.get("type") == "Feature":
        feats = [data]
    elif "coordinates" in data or data.get("type") == "GeometryCollection":
        feats = [{"type": "Feature", "properties": {}, "geometry": data}]
    else:
        return _file_issue(
            "parse_error", "The file is not a GeoJSON feature collection, feature or geometry."
        )
    out = []
    for i, feat in enumerate(feats, start=1):
        if not isinstance(feat, dict):
            out.append(
                ParsedPlot(
                    i, None, None, None, [Issue("parse_error", "error", "This entry is not a feature.")]
                )
            )
            continue
        props = feat.get("properties") or {}
        if not isinstance(props, dict):
            props = {}
        issues: list[Issue] = []
        area, area_issues = _area(props)
        issues += area_issues
        geom = feat.get("geometry")
        if not isinstance(geom, dict):
            issues.append(Issue("missing_geometry", "error", "This feature has no geometry.", "geometry"))
            geom = None
        elif geom.get("type") == "GeometryCollection":
            issues.append(
                Issue(
                    "unsupported_geometry",
                    "error",
                    "Geometry collections are not supported; use one point or polygon per plot.",
                    "geometry",
                )
            )
            geom = None
        elif geom.get("type") == "MultiPoint":
            pts = geom.get("coordinates") or []
            if len(pts) == 1:
                geom = {"type": "Point", "coordinates": pts[0]}
            else:
                issues.append(
                    Issue(
                        "unsupported_geometry",
                        "error",
                        "Several points for one plot are not allowed; map the plot as a polygon.",
                        "geometry",
                    )
                )
                geom = None
        ref = _ref(_pick(props, _REF_KEYS)) or _ref(feat.get("id"))
        if ref is None:
            issues.append(
                Issue(
                    "missing_reference",
                    "error",
                    "The plot has no reference (add a “reference” property).",
                    "reference",
                )
            )
        out.append(ParsedPlot(i, ref, geom, area, issues))
    return out


# ── KML ────────────────────────────────────────────────────────────────────


def _strip_ns(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _kml_coords(text: str | None) -> list[list[float]]:
    pts = []
    for tok in (text or "").split():
        parts = tok.split(",")
        if len(parts) < 2:
            raise ValueError(tok)
        pts.append([float(parts[0]), float(parts[1])])
    return pts


def _kml_polygon(el: ET.Element) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    for boundary in el:
        tag = _strip_ns(boundary.tag)
        if tag not in ("outerBoundaryIs", "innerBoundaryIs"):
            continue
        for coords in boundary.iter():
            if _strip_ns(coords.tag) == "coordinates":
                ring = _kml_coords(coords.text)
                if tag == "outerBoundaryIs":
                    rings.insert(0, ring)
                else:
                    rings.append(ring)
    return rings


def _kml_geometry(pm: ET.Element) -> dict | None:
    polys, points = [], []
    for el in pm.iter():
        tag = _strip_ns(el.tag)
        if tag == "Polygon":
            polys.append(_kml_polygon(el))
        elif tag == "Point":
            for c in el.iter():
                if _strip_ns(c.tag) == "coordinates":
                    points.extend(_kml_coords(c.text))
    if polys:
        return (
            {"type": "Polygon", "coordinates": polys[0]}
            if len(polys) == 1
            else {"type": "MultiPolygon", "coordinates": polys}
        )
    if len(points) == 1:
        return {"type": "Point", "coordinates": points[0]}
    return None


def _parse_kml(text: str) -> list[ParsedPlot]:
    if re.search(r"<!(DOCTYPE|ENTITY)", text, re.IGNORECASE):
        return _file_issue("parse_error", "KML files with document type declarations are not accepted.")
    try:
        root = ET.fromstring(text)  # noqa: S314  (no DTD/entities, see check above)
    except ET.ParseError:
        return _file_issue("parse_error", "The file is not valid KML.")
    out = []
    placemarks = [el for el in root.iter() if _strip_ns(el.tag) == "Placemark"]
    for i, pm in enumerate(placemarks, start=1):
        props: dict[str, object] = {}
        for el in pm:
            if _strip_ns(el.tag) == "name" and el.text:
                props["name"] = el.text.strip()
        for el in pm.iter():
            tag = _strip_ns(el.tag)
            if tag == "Data" and el.get("name"):
                val = next((c.text for c in el if _strip_ns(c.tag) == "value"), None)
                props[el.get("name") or ""] = (val or "").strip()
            elif tag == "SimpleData" and el.get("name"):
                props[el.get("name") or ""] = (el.text or "").strip()
        issues: list[Issue] = []
        area, area_issues = _area(props)
        issues += area_issues
        try:
            geom = _kml_geometry(pm)
        except ValueError:
            geom = None
            issues.append(
                Issue(
                    "invalid_number",
                    "error",
                    "The placemark has coordinates that are not numbers.",
                    "geometry",
                )
            )
        else:
            if geom is None:
                issues.append(
                    Issue(
                        "missing_geometry",
                        "error",
                        "The placemark has no single point or polygon.",
                        "geometry",
                    )
                )
        ref = _ref(_pick(props, _REF_KEYS))
        if ref is None:
            issues.append(
                Issue("missing_reference", "error", "The placemark has no name or reference.", "reference")
            )
        out.append(ParsedPlot(i, ref, geom, area, issues))
    return out


# ── CSV ────────────────────────────────────────────────────────────────────


def _parse_csv(text: str) -> list[ParsedPlot]:
    first = text.splitlines()[0] if text.splitlines() else ""
    delimiter = ";" if first.count(";") > first.count(",") else ("\t" if "\t" in first else ",")
    decimal_comma = delimiter == ";"
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    fields = [_norm_key(f) for f in (reader.fieldnames or [])]
    has_wkt = "wkt" in fields or "geometry" in fields
    has_latlon = any(k in fields for k in _LAT_KEYS) and any(k in fields for k in _LON_KEYS)
    if not (has_wkt or has_latlon):
        return _file_issue(
            "missing_columns",
            "The CSV needs a header with reference, latitude and longitude "
            "(and optionally area_ha), or reference and wkt.",
        )
    out = []
    for line_no, raw in enumerate(reader, start=2):
        row = {_norm_key(k): (v or "").strip() for k, v in raw.items() if k is not None}
        if not any(row.values()):
            continue
        issues: list[Issue] = []
        ref = _ref(_pick(row, _REF_KEYS))
        if ref is None:
            issues.append(Issue("missing_reference", "error", "The row has no plot reference.", "reference"))
        area, area_issues = _area(row, decimal_comma)
        issues += area_issues
        geom: dict | None = None
        wkt_text = row.get("wkt") or row.get("geometry")
        if has_wkt and wkt_text:
            try:
                geom = dict(mapping(shapely_wkt.loads(wkt_text)))
                geom["coordinates"] = json.loads(json.dumps(geom["coordinates"]))  # tuples -> lists
            except (ShapelyError, ValueError, TypeError):
                issues.append(Issue("invalid_wkt", "error", "The WKT geometry could not be read.", "wkt"))
        else:
            lat_raw, lon_raw = _pick(row, _LAT_KEYS), _pick(row, _LON_KEYS)
            lat, lon = _to_float(lat_raw, decimal_comma), _to_float(lon_raw, decimal_comma)
            if lat_raw is None or lon_raw is None:
                issues.append(
                    Issue("missing_coordinates", "error", "The row has no latitude or longitude.", "geometry")
                )
            elif lat is None or lon is None:
                issues.append(
                    Issue(
                        "invalid_number",
                        "error",
                        "Latitude and longitude must be decimal numbers.",
                        "geometry",
                    )
                )
            else:
                geom = {"type": "Point", "coordinates": [lon, lat]}
        out.append(ParsedPlot(line_no, ref, geom, area, issues))
    return out
