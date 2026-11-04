"""Spatial core: EUDR geometry rules, upload parsing, overlaps, countries and H3 indexing."""

from app.spatial.countries import country_at, country_name
from app.spatial.geometry import as_polygon, circle, geodesic_area_ha, h3_cells
from app.spatial.overlaps import find_overlaps, plots_in_bbox
from app.spatial.parsers import ParsedPlot, parse_upload
from app.spatial.validate import Issue, ValidationResult, validate_geometry

__all__ = [
    "Issue",
    "ParsedPlot",
    "ValidationResult",
    "as_polygon",
    "circle",
    "country_at",
    "country_name",
    "find_overlaps",
    "geodesic_area_ha",
    "h3_cells",
    "parse_upload",
    "plots_in_bbox",
    "validate_geometry",
]
