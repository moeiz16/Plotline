# ADR 0005: Offline-first evidence with a bundled synthetic landscape; live reads are optional

Status: accepted

## Context
The demo must run with no network and no signups, yet the product's credibility depends on real data paths.

## Decision
An `EvidenceSource` interface has two implementations. `bundled` (default) renders a deterministic synthetic
landscape (forest 2020, loss year, Sentinel-2-like reflectance with texture, clouds) for the seeded demo plots
and any new plot, versioned `synthetic-landscape-v1` and clearly labelled as sample data. `live` reads Sentinel-2
L2A from Microsoft Planetary Computer (anonymous SAS signing), Hansen GFC v1.13 from public Google Cloud
Storage and the EU JRC GFC2020 V4 COG, clipping and caching small rasters per plot under `data/rasters/`.
Each assessment records which source and versions it used.

## Consequences
`make seed` and the full demo work on a plane. Live mode is exercised by the training data fetch and an
optional per-plot path; it is slower and depends on third-party availability.
