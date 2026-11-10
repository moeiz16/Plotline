# ADR 0003: Shapely + pyproj for geometry rules, DuckDB spatial for set queries, H3 for lookups

Status: accepted

## Context
EUDR geometry rules need exact validity checks and geodesic areas; overlap detection and area queries need
set operations over many plots. PostGIS would need a database server we cannot run locally.

## Decision
Per-plot validation, geodesic area, point footprints (a geodesic circle of the declared area) and bounding-box
selection use Shapely 2 and pyproj (no server). Overlap detection computes intersection areas in an in-process
DuckDB with the spatial extension, falling back to Shapely if the extension cannot be loaded offline. Every plot
stores an H3 cell (res 9) and its parent (res 5); candidates for the overlap check are pre-filtered to plots in
the same res-5 parent, so a new plot is compared with its neighbours, not the whole tenant.

## Consequences
No spatial database server; the same code runs in tests and CI. The stored H3 keys are ready for regional
aggregation, which the dashboard does not use yet (it aggregates by supplier, commodity and country).
Postgres + PostGIS remains an easy upgrade path for large tenants (the geometry is stored as GeoJSON alongside
the H3 keys).
