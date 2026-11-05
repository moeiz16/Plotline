"""Land-change signal: cosine distance between the 2020 and current embeddings of the plot's 32 x 32 patches.

The encoder (``ml/artifacts/encoder.npz``) was trained self-supervised with LeJEPA and is run here with NumPy
only. Levels come from the threshold calibrated against Hansen loss labels (``api_threshold`` in
``ml/artifacts/eval.json``): ``high`` at or above it, ``elevated`` from half of it, ``low`` below.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np

from app.eo.rasters import PlotRasters
from app.ml.encoder import EncoderWeights, cosine_distance, embed, load_weights

log = logging.getLogger(__name__)

PATCH = 32
MIN_CLEAR = 0.9  # same eligibility rule as the evaluation
MIN_COVERAGE = 0.1
DEFAULT_THRESHOLD = 0.05
ELEVATED_FRACTION = 0.5
ChangeLevel = Literal["low", "elevated", "high"]
_WARNED: set[str] = set()


@dataclass(frozen=True)
class ChangeSignal:
    score: float | None
    level: ChangeLevel | None
    cloud_free_share: float
    embedding: list[float] | None
    patches: int
    model_version: str | None  # None when no encoder is installed


def _settings_paths() -> tuple[Path, Path]:
    from app.core.config import get_settings

    s = get_settings()
    return Path(s.change_encoder_path), Path(s.change_eval_path)


@lru_cache(maxsize=4)
def _load(path: str, mtime: float) -> EncoderWeights:
    return load_weights(path)


def load_encoder(path: Path | None = None) -> EncoderWeights | None:
    path = path or _settings_paths()[0]
    try:
        return _load(str(path), path.stat().st_mtime)
    except (OSError, KeyError, ValueError) as exc:
        if str(path) not in _WARNED:
            _WARNED.add(str(path))
            log.warning("land-change encoder unavailable at %s: %s", path, exc)
        return None


@lru_cache(maxsize=4)
def _threshold(path: str, mtime: float) -> float:
    data = json.loads(Path(path).read_text())
    thr = data.get("api_threshold")
    return float(thr) if thr else DEFAULT_THRESHOLD


def high_threshold(path: Path | None = None) -> float:
    path = path or _settings_paths()[1]
    try:
        return _threshold(str(path), path.stat().st_mtime)
    except (OSError, ValueError):
        return DEFAULT_THRESHOLD


def level_for(score: float | None, threshold: float) -> ChangeLevel | None:
    if score is None:
        return None
    if score >= threshold:
        return "high"
    if score >= threshold * ELEVATED_FRACTION:
        return "elevated"
    return "low"


def model_version(weights: EncoderWeights) -> str:
    return f"{weights.meta.get('version', 'encoder')} (sha256 {weights.sha256[:12]})"


def patch_windows(mask: np.ndarray) -> list[tuple[int, int, float]]:
    """(row, col, plot coverage) of the 32 x 32 windows that cover the plot."""
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    if len(ys) == 0 or h < PATCH or w < PATCH:
        return []
    r0, r1, c0, c1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    def starts(lo: int, hi: int, size: int) -> list[int]:
        if hi - lo <= PATCH:
            s = [round((lo + hi) / 2 - PATCH / 2)]
        else:
            n = int(np.ceil((hi - lo) / PATCH))
            s = [round(lo + i * (hi - lo - PATCH) / (n - 1)) for i in range(n)]
        return sorted({min(max(v, 0), size - PATCH) for v in s})

    out = []
    for r in starts(r0, r1, h):
        for c in starts(c0, c1, w):
            cov = float(mask[r : r + PATCH, c : c + PATCH].mean())
            out.append((r, c, cov))
    best = max(cov for _, _, cov in out)
    return [t for t in out if t[2] >= min(MIN_COVERAGE, best)]


def change_signal(
    r: PlotRasters, weights: EncoderWeights | None = None, threshold: float | None = None
) -> ChangeSignal:
    mask = r.mask
    cloud_free = (
        float(min(r.clear_baseline[mask].mean(), r.clear_current[mask].mean())) if mask.any() else 0.0
    )
    weights = weights if weights is not None else load_encoder()
    if weights is None:
        return ChangeSignal(None, None, round(cloud_free, 4), None, 0, None)
    thr = threshold if threshold is not None else high_threshold()
    windows = []
    for row, col, cov in patch_windows(mask):
        sl = (slice(row, row + PATCH), slice(col, col + PATCH))
        if r.clear_baseline[sl].mean() >= MIN_CLEAR and r.clear_current[sl].mean() >= MIN_CLEAR:
            windows.append((row, col, cov))
    version = model_version(weights)
    if not windows or cloud_free < MIN_CLEAR:
        return ChangeSignal(None, None, round(cloud_free, 4), None, 0, version)
    base = np.stack([r.baseline[:, a : a + PATCH, b : b + PATCH] for a, b, _ in windows])
    cur = np.stack([r.current[:, a : a + PATCH, b : b + PATCH] for a, b, _ in windows])
    e_base, e_cur = embed(weights, base), embed(weights, cur)
    dist = cosine_distance(e_base, e_cur)
    score = round(float(dist.max()), 4)
    main = int(np.argmax([cov for _, _, cov in windows]))
    emb = [round(float(v), 5) for v in e_cur[main]]
    return ChangeSignal(score, level_for(score, thr), round(cloud_free, 4), emb, len(windows), version)
