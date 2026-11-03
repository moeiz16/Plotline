# ADR 0003: Shapely + pyproj for geometry rules, DuckDB spatial for set queries, H3 for lookups

Status: accepted

## Context
EUDR geometry rules need exact validity checks and geodesic areas; overlap detection and area queries need
set operations over many plots. PostGIS would need a database server we cannot run locally.

## Decision
Per-plot validation and geodesic area use Shapely 2 and pyproj (no server). Plot-set queries (overlaps,
bounding-box selection, aggregation) run in an in-process DuckDB with the spatial extension, falling back to
Shapely if the extension cannot load offline. Every plot stores an H3 cell (res 9) and parent (res 5): H3
pre-filters overlap candidates and powers regional aggregation and similar-plot scoping.

## Consequences
No spatial database server; the same code runs in tests and CI. Postgres + PostGIS remains an easy upgrade
path for large tenants (the geometry is stored as GeoJSON alongside the H3 keys).
