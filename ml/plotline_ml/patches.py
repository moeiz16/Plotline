"""Cut each region window into 32 x 32 patches (10.24 ha "plots") and attach plot-level labels.

Labels come only from the official/public forest datasets and are used for evaluation, never training:
- ``forest2020``: share of the plot that the EU JRC GFC2020 map marks as forest on 31 Dec 2020;
- ``loss_after``: share of the plot that was forest in 2020 (JRC) *and* has Hansen loss in 2021-2025;
- ``loss_before``: share with Hansen loss in 2001-2020 (context only).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from plotline_ml.regions import PATCH_PX, REGIONS

ROOT = Path(__file__).resolve().parents[2]
REGION_DIR = ROOT / "data" / "eo" / "regions"


@dataclass
class PatchSet:
    baseline: np.ndarray  # (N, 5, 32, 32) float32 reflectance
    current: np.ndarray  # (N, 5, 32, 32)
    clear_baseline: np.ndarray  # (N,) share of pixels with at least one clear observation
    clear_current: np.ndarray
    forest2020: np.ndarray  # (N,)
    treecover2000: np.ndarray  # (N,) mean percent
    loss_after: np.ndarray  # (N,)
    loss_before: np.ndarray  # (N,)
    region: np.ndarray  # (N,) region key
    row: np.ndarray
    col: np.ndarray

    def __len__(self) -> int:
        return len(self.region)

    def subset(self, mask: np.ndarray) -> PatchSet:
        return PatchSet(**{k: getattr(self, k)[mask] for k in self.__dataclass_fields__})


def _tile(a: np.ndarray) -> np.ndarray:
    """(..., H, W) -> (n, ..., P, P) in row-major patch order."""
    p = PATCH_PX
    h, w = a.shape[-2:]
    lead = a.shape[:-2]
    a = a.reshape(*lead, h // p, p, w // p, p)
    a = np.moveaxis(a, (-4, -2), (0, 1))  # (H/p, W/p, ..., p, p)
    return a.reshape(-1, *lead, p, p)


def load_patches(region_keys: list[str] | None = None) -> PatchSet:
    parts: dict[str, list[np.ndarray]] = {k: [] for k in PatchSet.__dataclass_fields__}
    for region in REGIONS:
        if region_keys and region.key not in region_keys:
            continue
        path = REGION_DIR / f"{region.key}.npz"
        if not path.exists():
            continue
        d = np.load(path)
        base = _tile(d["s2_baseline"].astype(np.float32) / 10_000)
        cur = _tile(d["s2_current"].astype(np.float32) / 10_000)
        jrc = _tile(d["jrc_forest2020"] == 1)
        loss = d["lossyear"]
        after = _tile((loss >= 21) & (d["jrc_forest2020"] == 1))
        before = _tile((loss >= 1) & (loss <= 20))
        n = base.shape[0]
        grid = int(np.sqrt(n))
        parts["baseline"].append(base)
        parts["current"].append(cur)
        parts["clear_baseline"].append(_tile(d["clear_baseline"] > 0).mean(axis=(1, 2)))
        parts["clear_current"].append(_tile(d["clear_current"] > 0).mean(axis=(1, 2)))
        parts["forest2020"].append(jrc.mean(axis=(1, 2)))
        parts["treecover2000"].append(_tile(d["treecover2000"].astype(np.float32)).mean(axis=(1, 2)))
        parts["loss_after"].append(after.mean(axis=(1, 2)))
        parts["loss_before"].append(before.mean(axis=(1, 2)))
        parts["region"].append(np.array([region.key] * n))
        parts["row"].append(np.repeat(np.arange(grid), grid))
        parts["col"].append(np.tile(np.arange(grid), grid))
    if not parts["region"]:
        raise FileNotFoundError(f"No region files in {REGION_DIR}. Run `make ml-data` first.")
    return PatchSet(**{k: np.concatenate(v) for k, v in parts.items()})


def region_meta(key: str) -> dict:
    return json.loads(str(np.load(REGION_DIR / f"{key}.npz")["meta"]))
