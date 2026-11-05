"""Similar-plot search over land-cover embeddings (cosine similarity, brute force: tenants have few plots)."""

from __future__ import annotations

import numpy as np


def similar_plots(
    target: list[float], candidates: list[tuple[str, list[float]]], k: int = 6
) -> list[tuple[str, float]]:
    """Top-k (plot_id, similarity 0..1), most similar first; candidates without an embedding are skipped."""
    if not target or k <= 0:
        return []
    t = np.asarray(target, dtype=np.float64)
    tn = np.linalg.norm(t)
    valid = [(pid, e) for pid, e in candidates if e is not None and len(e) == len(t)]
    if tn == 0 or not valid:
        return []
    mat = np.asarray([e for _, e in valid], dtype=np.float64)
    norms = np.linalg.norm(mat, axis=1)
    cos = (mat @ t) / np.maximum(norms * tn, 1e-12)
    sim = np.clip((cos + 1.0) / 2.0, 0.0, 1.0)
    order = sorted(range(len(valid)), key=lambda i: (-sim[i], valid[i][0]))[:k]
    return [(valid[i][0], round(float(sim[i]), 4)) for i in order]
