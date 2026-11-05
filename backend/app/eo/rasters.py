"""Evidence rasters for one plot, independent of where they come from (bundled landscape or live reads)."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.eo.grid import Grid

BANDS = ("B02", "B03", "B04", "B08", "B11")
CUTOFF_LOSSYEAR = 21  # Hansen loss year code 21 = 2021 (first year after the EUDR cut-off, 31 Dec 2020)

HANSEN_VERSION = "GFC-2025-v1.13"
JRC_VERSION = "GFC2020-V4"
SYNTHETIC_VERSION = "synthetic-landscape-v1"

LIVE_VERSIONS = {
    "forest2020": f"EU JRC Global Forest Cover 2020 ({JRC_VERSION})",
    "forestLoss": f"Hansen Global Forest Change ({HANSEN_VERSION}), loss 2021-2025",
    "imagery": "Sentinel-2 L2A, Microsoft Planetary Computer: 2020 and 2026 clear-sky composites",
}
BUNDLED_VERSIONS = {
    "forest2020": f"{SYNTHETIC_VERSION}: sample forest map in the EU JRC GFC2020 layout",
    "forestLoss": f"{SYNTHETIC_VERSION}: sample loss years in the Hansen {HANSEN_VERSION} layout",
    "imagery": f"{SYNTHETIC_VERSION}: sample Sentinel-2 L2A reflectance, 2020 and 2026",
}


class EvidenceUnavailable(Exception):
    """Satellite evidence for the plot could not be obtained (e.g. live mode without network)."""


@dataclass
class PlotRasters:
    source: str  # "bundled" | "live"
    grid: Grid
    baseline: np.ndarray  # (5, H, W) float32 surface reflectance (0-1), 2020 composite
    current: np.ndarray  # (5, H, W) float32, current composite
    clear_baseline: np.ndarray  # (H, W) bool, pixel has a clear observation
    clear_current: np.ndarray  # (H, W) bool
    forest2020: np.ndarray  # (H, W) bool, forest on 31 Dec 2020
    lossyear: np.ndarray  # (H, W) uint8, 0 none, 1..25 = 2001..2025
    treecover2000: np.ndarray  # (H, W) uint8 percent
    versions: dict = field(default_factory=dict)

    @property
    def mask(self) -> np.ndarray:
        return self.grid.mask
