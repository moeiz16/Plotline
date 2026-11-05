"""Plot assessment: official forest metrics + land-change signal -> verdict, reasons, versions, hashes.

Deterministic: the same plot input with the same dataset versions always yields the same result (and the
same ``inputs_hash`` / ``result_hash``). No database access, no global state besides read-only data.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections import OrderedDict
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Literal

import numpy as np

from app.eo import render as eo_render
from app.eo.rasters import CUTOFF_LOSSYEAR, EvidenceUnavailable, PlotRasters
from app.eo.synthetic import bundled_rasters
from app.ml.change import change_signal, load_encoder
from app.ml.similarity import similar_plots
from app.rules.verdict import RULES_VERSION, Evidence, decide, pending_decision
from app.spatial.geometry import normalise

log = logging.getLogger(__name__)
Source = Literal["bundled", "live"]


@dataclass
class PlotInput:
    id: str
    reference: str
    geometry: dict
    commodity: str
    country: str
    area_ha: float


@dataclass
class AssessmentResult:
    verdict: Literal["compliant", "needs_review", "non_compliant", "pending"]
    headline: str
    reasons: list[dict]
    metrics: dict
    review_required: bool
    datasets: dict
    inputs_hash: str
    result_hash: str
    source: Source
    embedding: list[float] | None = field(default=None, repr=False)

    def as_dict(self) -> dict:
        return {
            "verdict": self.verdict,
            "headline": self.headline,
            "reasons": self.reasons,
            "metrics": self.metrics,
            "reviewRequired": self.review_required,
            "datasets": self.datasets,
            "inputsHash": self.inputs_hash,
            "resultHash": self.result_hash,
            "source": self.source,
        }


def _source() -> Source:
    from app.core.config import get_settings

    return get_settings().eo_source


def _canonical(obj: object) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _sha(obj: object) -> str:
    return hashlib.sha256(_canonical(obj)).hexdigest()


def _normalised(geometry: dict) -> dict:
    try:
        return normalise(geometry)
    except (KeyError, TypeError, ValueError, IndexError):
        return geometry


# ── evidence (small LRU so the four imagery kinds of one plot reuse the rasters) ──

_CACHE: OrderedDict[str, PlotRasters] = OrderedDict()
_CACHE_LOCK = Lock()
_CACHE_SIZE = 24


def load_evidence(plot: PlotInput, source: Source | None = None) -> PlotRasters:
    source = source or _source()
    geometry = _normalised(plot.geometry)
    key = _sha([source, plot.reference, geometry, plot.commodity, round(float(plot.area_ha or 0), 4)])
    with _CACHE_LOCK:
        if key in _CACHE:
            _CACHE.move_to_end(key)
            return _CACHE[key]
    if source == "live":
        from app.eo.live import live_rasters

        rasters = live_rasters(geometry, plot.area_ha)
    else:
        rasters = bundled_rasters(plot.reference, geometry, plot.commodity, plot.area_ha)
    with _CACHE_LOCK:
        _CACHE[key] = rasters
        while len(_CACHE) > _CACHE_SIZE:
            _CACHE.popitem(last=False)
    return rasters


def _metrics(r: PlotRasters) -> tuple[dict[str, Any], Evidence]:
    m = r.mask
    px = r.grid.pixel_ha
    n = max(int(m.sum()), 1)
    forest = r.forest2020 & m
    after = forest & (r.lossyear >= CUTOFF_LOSSYEAR)
    by_year: dict[str, float] = {}
    for code in np.unique(r.lossyear[after]):
        by_year[str(2000 + int(code))] = round(float((after & (r.lossyear == code)).sum() * px), 2)
    before = m & (r.lossyear >= 1) & (r.lossyear < CUTOFF_LOSSYEAR)
    before_years = sorted({2000 + int(c) for c in np.unique(r.lossyear[before])})
    ev = Evidence(
        forest2020_ha=round(float(forest.sum() * px), 2),
        forest2020_share=round(float(forest.sum() / n), 4),
        loss_after_ha=round(float(after.sum() * px), 2),
        loss_by_year=by_year,
        loss_before_ha=round(float(before.sum() * px), 2),
        loss_before_years=before_years,
    )
    metrics: dict[str, Any] = {
        "forest2020Ha": ev.forest2020_ha,
        "forest2020Share": ev.forest2020_share,
        "lossAfter2020Ha": ev.loss_after_ha,
        "lossByYear": by_year,
        "lossBefore2021Ha": ev.loss_before_ha,
        "treeCover2000Pct": round(float(r.treecover2000[m].mean()), 1) if m.any() else None,
    }
    return metrics, ev


def assess_plot(plot: PlotInput, source: Source | None = None) -> AssessmentResult:
    source = source or _source()
    geometry = _normalised(plot.geometry)
    weights = load_encoder()
    model = (
        f"{weights.meta.get('version', 'encoder')} (sha256 {weights.sha256[:12]})"
        if weights
        else "not installed"
    )
    try:
        rasters = load_evidence(plot, source)
    except EvidenceUnavailable as exc:
        log.info("evidence unavailable for %s: %s", plot.reference, exc)
        from app.eo.rasters import LIVE_VERSIONS

        datasets = {**LIVE_VERSIONS, "changeModel": model, "rules": RULES_VERSION}
        d = pending_decision(
            "Satellite evidence could not be retrieved for this plot right now. The assessment "
            "will be repeated when the data is reachable."
        )
        metrics: dict[str, Any] = {
            "forest2020Ha": None,
            "forest2020Share": None,
            "lossAfter2020Ha": None,
            "lossByYear": {},
            "lossBefore2021Ha": None,
            "treeCover2000Pct": None,
            "cloudFreeShare": None,
            "changeScore": None,
            "changeLevel": None,
            "signalsAgree": None,
        }
        return _result(
            plot,
            geometry,
            source,
            d.verdict,
            d.headline,
            d.reasons,
            metrics,
            d.review_required,
            datasets,
            None,
        )

    metrics, ev = _metrics(rasters)
    signal = change_signal(rasters, weights)
    ev.change_score = signal.score
    ev.change_level = signal.level
    ev.change_available = weights is not None
    d = decide(ev)
    metrics.update(
        cloudFreeShare=signal.cloud_free_share,
        changeScore=signal.score,
        changeLevel=signal.level,
        signalsAgree=d.signals_agree,
    )
    datasets = {**rasters.versions, "changeModel": model, "rules": RULES_VERSION}
    return _result(
        plot,
        geometry,
        rasters.source,
        d.verdict,
        d.headline,
        d.reasons,
        metrics,
        d.review_required,
        datasets,
        signal.embedding,
    )


def _result(
    plot: PlotInput,
    geometry: dict,
    source: str,
    verdict: str,
    headline: str,
    reasons: list[dict],
    metrics: dict,
    review: bool,
    datasets: dict,
    embedding: list[float] | None,
) -> AssessmentResult:
    inputs_hash = _sha(
        {
            "geometry": geometry,
            "commodity": plot.commodity,
            "areaHa": round(float(plot.area_ha or 0), 4),
            "datasets": datasets,
            "source": source,
        }
    )
    result_hash = _sha(
        {
            "verdict": verdict,
            "headline": headline,
            "reasons": reasons,
            "metrics": metrics,
            "reviewRequired": review,
        }
    )
    return AssessmentResult(
        verdict=verdict,  # type: ignore[arg-type]
        headline=headline,
        reasons=reasons,
        metrics=metrics,
        review_required=review,
        datasets=datasets,
        inputs_hash=inputs_hash,
        result_hash=result_hash,
        source=source,  # type: ignore[arg-type]
        embedding=embedding,
    )


def render_imagery(plot: PlotInput, kind: Literal["baseline", "current", "forest", "loss"]) -> bytes:
    """PNG of the plot: 2020 / current true colour, the 2020 forest map, or loss since 2021 (and before)."""
    if kind not in eo_render.KINDS:
        raise ValueError(f"unknown imagery kind {kind!r}")
    try:
        return eo_render.render(load_evidence(plot), kind)
    except EvidenceUnavailable:
        return eo_render.placeholder()


__all__ = ["AssessmentResult", "PlotInput", "assess_plot", "load_evidence", "render_imagery", "similar_plots"]
