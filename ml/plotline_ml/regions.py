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

# Full-scale set for GPU training (Kaggle notebook): more commodity frontiers. Centres are approximate
# deforestation hotspots; check the printed loss share after fetching and drop windows without forest.
EXTRA_REGIONS: tuple[Region, ...] = (
    Region("br_sao_felix_xingu", "BR", "cattle", -6.60, -51.90),
    Region("br_colniza", "BR", "soy", -9.20, -59.00),
    Region("br_acre", "BR", "cattle", -9.90, -67.50),
    Region("br_labrea", "BR", "cattle", -7.90, -64.80),
    Region("bo_chiquitania", "BO", "soy", -16.50, -61.50),
    Region("py_boqueron", "PY", "cattle", -21.50, -60.50),
    Region("co_caqueta", "CO", "cattle", 1.00, -74.50),
    Region("pe_ucayali", "PE", "cocoa", -8.40, -74.60),
    Region("ci_mont_peko", "CI", "cocoa", 7.00, -7.30),
    Region("gh_ashanti", "GH", "cocoa", 6.60, -1.30),
    Region("lr_nimba", "LR", "rubber", 6.00, -9.30),
    Region("cm_east", "CM", "cocoa", 3.50, 13.50),
    Region("ng_cross_river", "NG", "cocoa", 6.00, 8.70),
    Region("cd_tshopo", "CD", "wood", 0.50, 25.00),
    Region("id_ketapang", "ID", "oil_palm", -1.80, 110.20),
    Region("id_jambi", "ID", "oil_palm", -1.60, 103.40),
    Region("id_central_kalimantan", "ID", "oil_palm", -2.20, 113.00),
    Region("id_merauke", "ID", "oil_palm", -7.90, 140.30),
    Region("my_sarawak", "MY", "oil_palm", 2.90, 113.00),
    Region("pg_madang", "PG", "oil_palm", -5.50, 145.50),
    Region("vn_central_highlands", "VN", "coffee", 12.70, 108.00),
    Region("la_bolaven", "LA", "coffee", 15.00, 106.00),
    Region("et_jimma", "ET", "coffee", 7.70, 36.80),
)
ALL_REGIONS: tuple[Region, ...] = REGIONS + EXTRA_REGIONS


def regions_for(name: str) -> tuple[Region, ...]:
    """``demo`` (9 regions, CPU in minutes) or ``full`` (all regions, GPU)."""
    return ALL_REGIONS if name == "full" else REGIONS


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
