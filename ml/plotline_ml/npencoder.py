"""NumPy-only forward pass of the exported encoder (batch norm folded into the convolutions).

This exact file is vendored as ``backend/app/ml/encoder.py`` so the API computes embeddings without a
deep-learning runtime. ``tests/test_export.py`` checks it against the PyTorch model.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


@dataclass(frozen=True)
class EncoderWeights:
    convs: tuple[tuple[np.ndarray, np.ndarray, int], ...]  # (weight (O,C,3,3), bias (O,), stride)
    head_w: np.ndarray  # (D, C)
    head_b: np.ndarray  # (D,)
    band_mean: np.ndarray  # (C_in,)
    band_std: np.ndarray  # (C_in,)
    meta: dict
    sha256: str

    @property
    def embed_dim(self) -> int:
        return int(self.head_w.shape[0])


def load_weights(path: str | Path) -> EncoderWeights:
    path = Path(path)
    raw = path.read_bytes()
    d = np.load(path, allow_pickle=False)
    n = int(d["n_convs"])
    convs = tuple(
        (d[f"conv{i}_w"].astype(np.float32), d[f"conv{i}_b"].astype(np.float32), int(d[f"conv{i}_stride"]))
        for i in range(n)
    )
    return EncoderWeights(
        convs=convs,
        head_w=d["head_w"].astype(np.float32),
        head_b=d["head_b"].astype(np.float32),
        band_mean=d["band_mean"].astype(np.float32),
        band_std=d["band_std"].astype(np.float32),
        meta=json.loads(str(d["meta"])),
        sha256=hashlib.sha256(raw).hexdigest(),
    )


def _conv3x3(x: np.ndarray, w: np.ndarray, b: np.ndarray, stride: int) -> np.ndarray:
    xp = np.pad(x, ((0, 0), (0, 0), (1, 1), (1, 1)))
    win = sliding_window_view(xp, (3, 3), axis=(2, 3))[:, :, ::stride, ::stride]  # (N,C,Ho,Wo,3,3)
    n, c, ho, wo = win.shape[:4]
    cols = win.transpose(0, 2, 3, 1, 4, 5).reshape(n * ho * wo, c * 9)
    out = cols @ w.reshape(w.shape[0], -1).T + b
    return out.reshape(n, ho, wo, -1).transpose(0, 3, 1, 2)


def embed(weights: EncoderWeights, patches: np.ndarray, batch: int = 64) -> np.ndarray:
    """patches: (N, C, 32, 32) surface reflectance (0-1). Returns (N, D) float32 embeddings."""
    x_all = np.asarray(patches, dtype=np.float32)
    if x_all.ndim == 3:
        x_all = x_all[None]
    outs = []
    for start in range(0, len(x_all), batch):
        x = (x_all[start : start + batch] - weights.band_mean[None, :, None, None]) / weights.band_std[
            None, :, None, None
        ]
        for w, b, stride in weights.convs:
            x = np.maximum(_conv3x3(x, w, b, stride), 0.0)
        outs.append(x.mean(axis=(2, 3)) @ weights.head_w.T + weights.head_b)
    return np.concatenate(outs).astype(np.float32) if outs else np.zeros((0, weights.embed_dim), np.float32)


def cosine_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Row-wise 1 - cosine similarity, in [0, 2]."""
    a = a / (np.linalg.norm(a, axis=-1, keepdims=True) + 1e-8)
    b = b / (np.linalg.norm(b, axis=-1, keepdims=True) + 1e-8)
    return 1.0 - np.sum(a * b, axis=-1)
