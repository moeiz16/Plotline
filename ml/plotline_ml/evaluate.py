"""Evaluate the change signal against Hansen forest-loss labels at plot level.

    python -m plotline_ml.evaluate

Plots are 32 x 32 patches (10.24 ha). A plot is *eligible* when the EU JRC GFC2020 map shows at least
30 % forest on 31 Dec 2020 and both composites are at least 90 % cloud-free. Among eligible plots:
- positive: >= 5 % of the plot (about 0.5 ha, the FAO minimum forest area) was forest in 2020 and has
  Hansen loss in 2021-2025;
- negative: no such loss at all;
- plots with 0-5 % loss are reported but left out of the binary metrics (ambiguous at 30 m).

Scores compared (higher = more change):
- ``lejepa``: cosine distance between the 2020 and current embeddings of the trained encoder;
- ``random_init``: the same architecture with random weights (what self-supervision adds);
- ``ndvi_drop``: mean NDVI 2020 minus mean NDVI now (the classic hand-made index);
- ``nbr_drop``: same with the normalised burn ratio (NIR vs SWIR), sensitive to clearing.

Thresholds are calibrated on one half of the plots (stratified, fixed seed) by maximising F1 and the
reported precision / recall / F1 come from the other half. Results go to ``ml/artifacts/eval.json`` and
``ml/artifacts/EVAL.md``. Similar-plot search is scored as precision@5 of nearest neighbours sharing the
plot's 2020 land cover class (forest vs non-forest).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score

from plotline_ml.model import TinyEncoder
from plotline_ml.npencoder import cosine_distance, embed, load_weights
from plotline_ml.patches import PatchSet, load_patches
from plotline_ml.train import ARTIFACTS, HELD_OUT, normalise

POS_LOSS = 0.05
MIN_FOREST = 0.30
MIN_CLEAR = 0.90


def _ndvi(x: np.ndarray) -> np.ndarray:
    nir, red = x[:, 3], x[:, 2]
    return ((nir - red) / (nir + red + 1e-6)).mean(axis=(1, 2))


def _nbr(x: np.ndarray) -> np.ndarray:
    nir, swir = x[:, 3], x[:, 4]
    return ((nir - swir) / (nir + swir + 1e-6)).mean(axis=(1, 2))


def _random_init_scores(ps: PatchSet, band_mean: np.ndarray, band_std: np.ndarray) -> np.ndarray:
    torch.manual_seed(123)
    enc = TinyEncoder(in_ch=ps.baseline.shape[1]).eval()
    m, s = torch.from_numpy(band_mean), torch.from_numpy(band_std)
    with torch.no_grad():
        a = enc(normalise(torch.from_numpy(ps.baseline), m, s)).numpy()
        b = enc(normalise(torch.from_numpy(ps.current), m, s)).numpy()
    return cosine_distance(a, b)


def _metrics(y: np.ndarray, score: np.ndarray, rng: np.random.Generator) -> dict:
    out: dict = {"n": int(len(y)), "positives": int(y.sum())}
    if y.min() == y.max():
        return out
    out["roc_auc"] = round(float(roc_auc_score(y, score)), 4)
    out["average_precision"] = round(float(average_precision_score(y, score)), 4)
    # stratified calibration / test split
    idx_pos, idx_neg = np.flatnonzero(y == 1), np.flatnonzero(y == 0)
    rng.shuffle(idx_pos)
    rng.shuffle(idx_neg)
    cal = np.concatenate([idx_pos[: len(idx_pos) // 2], idx_neg[: len(idx_neg) // 2]])
    test = np.concatenate([idx_pos[len(idx_pos) // 2 :], idx_neg[len(idx_neg) // 2 :]])
    p, r, t = precision_recall_curve(y[cal], score[cal])
    f1 = 2 * p[:-1] * r[:-1] / np.maximum(p[:-1] + r[:-1], 1e-9)
    thr = float(t[int(np.argmax(f1))])
    pred = score[test] >= thr
    tp = int((pred & (y[test] == 1)).sum())
    fp = int((pred & (y[test] == 0)).sum())
    fn = int((~pred & (y[test] == 1)).sum())
    prec = tp / max(tp + fp, 1)
    rec = tp / max(tp + fn, 1)
    out.update(
        threshold=round(thr, 5),
        precision=round(prec, 4),
        recall=round(rec, 4),
        f1=round(2 * prec * rec / max(prec + rec, 1e-9), 4),
        test_n=int(len(test)),
    )
    return out


def _similar_precision(emb: np.ndarray, forest: np.ndarray, k: int = 5, n_query: int = 1500) -> float:
    rng = np.random.default_rng(0)
    q = rng.choice(len(emb), size=min(n_query, len(emb)), replace=False)
    e = emb / (np.linalg.norm(emb, axis=1, keepdims=True) + 1e-8)
    sims = e[q] @ e.T
    sims[np.arange(len(q)), q] = -np.inf
    nn = np.argsort(-sims, axis=1)[:, :k]
    return float((forest[nn] == forest[q][:, None]).mean())


def main() -> None:
    weights = load_weights(ARTIFACTS / "encoder.npz")
    ps = load_patches()
    ok = (ps.clear_baseline >= MIN_CLEAR) & (ps.clear_current >= MIN_CLEAR)
    eligible = ok & (ps.forest2020 >= MIN_FOREST)
    pos = eligible & (ps.loss_after >= POS_LOSS)
    neg = eligible & (ps.loss_after == 0)
    use = pos | neg
    print(f"plots: {len(ps)}, cloud-free: {ok.sum()}, forest-2020 eligible: {eligible.sum()}, "
          f"positives: {pos.sum()}, negatives: {neg.sum()}, ambiguous: {(eligible & ~use).sum()}")

    e_base = embed(weights, ps.baseline)
    e_cur = embed(weights, ps.current)
    scores = {
        "lejepa": cosine_distance(e_base, e_cur),
        "random_init": _random_init_scores(ps, weights.band_mean, weights.band_std),
        "ndvi_drop": _ndvi(ps.baseline) - _ndvi(ps.current),
        "nbr_drop": _nbr(ps.baseline) - _nbr(ps.current),
    }
    y_all = pos.astype(int)
    report: dict = {
        "labels": {
            "source": "Hansen GFC-2025-v1.13 loss 2021-2025 within EU JRC GFC2020-V4 forest",
            "positive_rule": f"loss share >= {POS_LOSS:.0%} of a 10.24 ha plot",
            "eligibility": f"JRC forest share >= {MIN_FOREST:.0%}, both composites >= {MIN_CLEAR:.0%} clear",
        },
        "counts": {
            "plots": int(len(ps)),
            "eligible": int(eligible.sum()),
            "positives": int(pos.sum()),
            "negatives": int(neg.sum()),
            "ambiguous_excluded": int((eligible & ~use).sum()),
        },
        "encoder": weights.meta,
        "encoder_sha256": weights.sha256,
        "all_regions": {},
        "held_out_regions": {},
        "per_region_auc": {},
    }
    held = np.isin(ps.region, HELD_OUT)
    for name, s in scores.items():
        report["all_regions"][name] = _metrics(y_all[use], s[use], np.random.default_rng(42))
        report["held_out_regions"][name] = _metrics(y_all[use & held], s[use & held], np.random.default_rng(42))
    for region in sorted(set(ps.region)):
        m = use & (ps.region == region)
        if m.sum() and 0 < y_all[m].sum() < m.sum():
            report["per_region_auc"][region] = {
                name: round(float(roc_auc_score(y_all[m], s[m])), 3) for name, s in scores.items()
            } | {"n": int(m.sum()), "positives": int(y_all[m].sum())}
    forest_cls = (ps.forest2020 >= 0.5).astype(int)
    report["similar_plots_precision_at_5"] = {
        "lejepa": round(_similar_precision(e_base[ok], forest_cls[ok]), 4),
        "chance": round(float(max(forest_cls[ok].mean(), 1 - forest_cls[ok].mean())), 4),
    }
    # the operating point the API uses (calibrated on all regions)
    report["api_threshold"] = report["all_regions"]["lejepa"].get("threshold")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "eval.json").write_text(json.dumps(report, indent=2))
    (ARTIFACTS / "EVAL.md").write_text(_markdown(report))
    print(_markdown(report))


def _markdown(r: dict) -> str:
    lines = [
        "# Land-change signal vs Hansen forest loss (plot level)",
        "",
        f"Labels: {r['labels']['source']}; positive = {r['labels']['positive_rule']}; "
        f"eligible = {r['labels']['eligibility']}.",
        "",
        f"Plots: {r['counts']['plots']} · eligible: {r['counts']['eligible']} · positives: "
        f"{r['counts']['positives']} · negatives: {r['counts']['negatives']} · ambiguous (excluded): "
        f"{r['counts']['ambiguous_excluded']}",
        "",
    ]
    for scope, title in (("all_regions", "All regions"), ("held_out_regions", "Held-out regions (never seen in training)")):
        lines += [f"## {title}", "", "| Score | ROC-AUC | Avg. precision | Precision | Recall | F1 | n (pos) |", "|---|---|---|---|---|---|---|"]
        for name, m in r[scope].items():
            lines.append(
                f"| {name} | {m.get('roc_auc', '-')} | {m.get('average_precision', '-')} | {m.get('precision', '-')} | "
                f"{m.get('recall', '-')} | {m.get('f1', '-')} | {m['n']} ({m['positives']}) |"
            )
        lines.append("")
    lines += ["## ROC-AUC per region", "", "| Region | LeJEPA | Random init | NDVI drop | NBR drop | n (pos) |", "|---|---|---|---|---|---|"]
    for region, m in r["per_region_auc"].items():
        lines.append(
            f"| {region} | {m['lejepa']} | {m['random_init']} | {m['ndvi_drop']} | {m['nbr_drop']} | {m['n']} ({m['positives']}) |"
        )
    sp = r["similar_plots_precision_at_5"]
    lines += ["", f"Similar-plot search precision@5 (same 2020 land cover): {sp['lejepa']} (majority-class chance {sp['chance']}).", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
