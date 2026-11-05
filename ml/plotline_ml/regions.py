"""Study regions for demo-scale training and evaluation.

Each region is a 10.24 km x 10.24 km window (1024 x 1024 Sentinel-2 pixels at 10 m) in a commodity
landscape with known forest loss since 2021. Centres were chosen by sampling the Hansen Global Forest
Change loss-year layer; see docs/adr/0004-lejepa-change-signal.md.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Region:
    key: str
    country: str  # ISO 3166-1 alpha-2
    commodity: str
    lat: float
    lon: float


REGIONS: tuple[Region, ...] = (
    Region("ci_cavally", "CI", "cocoa", 6.25, -7.85),
    Region("ci_soubre", "CI", "cocoa", 5.85, -6.55),
    Region("gh_western_north", "GH", "cocoa", 6.25, -2.75),
    Region("br_novo_progresso", "BR", "cattle", -7.05, -55.60),
    Region("br_porto_velho", "BR", "cattle", -9.35, -64.60),
    Region("id_riau", "ID", "oil_palm", 0.35, 101.85),
    Region("id_east_kalimantan", "ID", "oil_palm", 0.60, 116.40),
    Region("pe_san_martin", "PE", "coffee", -6.90, -76.60),
    Region("pe_madre_de_dios", "PE", "cocoa", -12.75, -69.90),
)

# Baseline imagery strictly before the EUDR cut-off (31 Dec 2020); current imagery after the last
# Hansen loss year in the release we use (GFC-2025-v1.13 maps loss up to and including 2025).
BASELINE_WINDOW = "2020-01-01/2020-12-31"
CURRENT_WINDOW = "2026-01-01/2026-10-31"

HANSEN_VERSION = "GFC-2025-v1.13"
HANSEN_BASE = f"https://storage.googleapis.com/earthenginepartners-hansen/{HANSEN_VERSION}"
JRC_GFC2020_COG = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/FOREST/GFC2020/LATEST/single-cog/JRC_GFC2020_V4_COG.tif"
)
JRC_VERSION = "GFC2020-V4"
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"

BANDS: tuple[str, ...] = ("B02", "B03", "B04", "B08", "B11")
WINDOW_PX = 1024
PATCH_PX = 32
