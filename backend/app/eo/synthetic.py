"""Bundled synthetic landscape: deterministic sample evidence for any plot, fully offline.

For a plot it renders, on the 10 m grid around it, the same layers the live sources provide: a forest map for
31 Dec 2020 (JRC GFC2020 layout), loss years (Hansen layout), tree cover 2000, clear-sky masks and 2020 / 2026
Sentinel-2-like reflectance for bands B02, B03, B04, B08, B11. Class spectra are the medians measured on the
real study-region composites (``ml/``), with canopy / parcel texture, per-epoch illumination gain, haze and
noise so that the land-change signal sees realistic nuisance variation.

The landscape is driven by a *scenario* (see ``demo.py``): seeded demo plots use their own; any other plot
gets one from a hash of its geometry (mostly farmland). Same geometry + scenario + version => same rasters.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import numpy as np

from app.eo.demo import DEMO_BY_REFERENCE
from app.eo.grid import Grid, build_grid
from app.eo.rasters import BUNDLED_VERSIONS, SYNTHETIC_VERSION, PlotRasters

# classes
FOREST, TREECROP, PASTURE, BARE, REGROWTH = range(5)
# median surface reflectance (B02, B03, B04, B08, B11), measured on the study-region composites
SPECTRA = np.array(
    [
        [0.017, 0.037, 0.019, 0.280, 0.148],  # forest (JRC forest, no loss, tree cover > 70 %)
        [0.024, 0.047, 0.030, 0.300, 0.172],  # tree crops (cocoa, coffee, palm, rubber)
        [0.036, 0.062, 0.048, 0.270, 0.215],  # pasture / annual crops
        [0.060, 0.085, 0.100, 0.215, 0.285],  # bare soil, fresh clearing
        [0.020, 0.042, 0.023, 0.305, 0.160],  # regrowth canopy
    ],
    dtype=np.float32,
)
TEXTURE = np.array([0.13, 0.10, 0.07, 0.09, 0.08], dtype=np.float32)
CLOUD = np.array([0.30, 0.31, 0.32, 0.36, 0.28], dtype=np.float32)
HAZE_PROFILE = np.array([1.0, 0.8, 0.6, 0.3, 0.15], dtype=np.float32)
TREE_CROPS = {"cocoa", "coffee", "oil_palm", "rubber", "wood"}


@dataclass(frozen=True)
class Scenario:
    name: str
    forest_share: float = 0.0  # share of the plot that is forest on 31 Dec 2020
    surround_forest: float = 0.3
    loss_share: float = 0.0  # share of the plot's 2020 forest lost after 2020 ...
    loss_ha: float = 0.0  # ... or an absolute area (ha)
    loss_year: int = 22  # Hansen code (22 = 2022)
    regrowth: bool = False  # cleared pixels carry a regrown canopy in the current imagery
    old_clear_share: float = 0.0  # cleared before 2021 (not forest in 2020)
    change_share: float = 0.0  # non-forest land cleared after 2020 (no official loss)
    cloud_current: float = 0.0  # share of the plot under cloud in the current composite
    spill: float = 0.0  # the same clearing continues outside the plot (multiple of the in-plot area)


def scenario_params(name: str, seed: int) -> Scenario:
    u = (seed % 1000) / 1000.0  # deterministic variation in [0, 1)
    table = {
        "compliant_farmland": Scenario(name, 0.0, 0.2 + 0.2 * u),
        "compliant_point": Scenario(name, 0.0, 0.25),
        "compliant_low_precision": Scenario(name, 0.0, 0.3),
        "unassessed": Scenario(name, 0.0, 0.2 + 0.2 * u),
        "compliant_agroforest": Scenario(name, 0.35 + 0.2 * u, 0.5),
        "compliant_old_clearing": Scenario(
            name, 0.0, 0.45, old_clear_share=0.6 + 0.2 * u, loss_year=17 + int(u * 3)
        ),
        "compliant_cloudy": Scenario(name, 0.0, 0.3, cloud_current=0.55 + 0.2 * u),
        "review_small_loss": Scenario(name, 0.4, 0.5, loss_ha=0.15 + 0.25 * u, loss_year=22 + int(u * 2)),
        "review_land_change": Scenario(name, 0.0, 0.3, change_share=0.9, spill=1.5),
        "non_compliant": Scenario(
            name, 0.6, 0.55, loss_share=0.65 + 0.1 * u, loss_year=22 + int(u * 3), spill=1.0
        ),
        "non_compliant_regrowth": Scenario(name, 0.55, 0.55, loss_ha=1.2, loss_year=21, regrowth=True),
    }
    return table[name]


def _seed(*parts: object) -> int:
    h = hashlib.sha256(json.dumps(parts, sort_keys=True, separators=(",", ":")).encode()).digest()
    return int.from_bytes(h[:8], "big")


def scenario_for(reference: str, geometry: dict) -> str:
    """The demo plot's scenario when reference and location match; otherwise one derived from the geometry."""
    demo = DEMO_BY_REFERENCE.get(reference)
    if demo is not None and _close(demo.geometry, geometry):
        return demo.scenario
    r = _seed("scenario", SYNTHETIC_VERSION, geometry) % 100
    if r < 76:
        return "compliant_farmland"
    if r < 90:
        return "compliant_agroforest"
    if r < 96:
        return "review_small_loss"
    return "non_compliant"


def _first_position(geometry: dict) -> list[float]:
    c = geometry["coordinates"]
    while isinstance(c[0], list):
        c = c[0]
    return c


def _close(a: dict, b: dict) -> bool:
    try:
        pa, pb = _first_position(a), _first_position(b)
    except (KeyError, IndexError, TypeError):
        return False
    return a.get("type") == b.get("type") and abs(pa[0] - pb[0]) < 1e-3 and abs(pa[1] - pb[1]) < 1e-3


def _smooth(rng: np.random.Generator, h: int, w: int, cell: float) -> np.ndarray:
    """Smooth value noise (bilinear upsampling of a coarse random grid), zero mean, unit std."""
    gh, gw = int(np.ceil(h / cell)) + 2, int(np.ceil(w / cell)) + 2
    coarse = rng.standard_normal((gh, gw)).astype(np.float32)
    ys = np.arange(h, dtype=np.float32) / cell
    xs = np.arange(w, dtype=np.float32) / cell
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    a = coarse[y0][:, x0]
    b = coarse[y0][:, x0 + 1]
    c = coarse[y0 + 1][:, x0]
    d = coarse[y0 + 1][:, x0 + 1]
    out = a * (1 - fy) * (1 - fx) + b * (1 - fy) * fx + c * fy * (1 - fx) + d * fy * fx
    return (out - out.mean()) / (out.std() + 1e-6)


def _grow(candidates: np.ndarray, count: int, field: np.ndarray) -> np.ndarray:
    """A compact patch of ``count`` candidate pixels around the candidate with the highest field value."""
    out = np.zeros_like(candidates)
    if count <= 0 or not candidates.any():
        return out
    ys, xs = np.nonzero(candidates)
    k = int(np.argmax(field[ys, xs]))
    dist = np.hypot(ys - ys[k], xs - xs[k]) - 1.0 * field[ys, xs]
    take = np.argsort(dist, kind="stable")[: min(count, len(ys))]
    out[ys[take], xs[take]] = True
    return out


def _grow_near(candidates: np.ndarray, count: int, around: np.ndarray, field: np.ndarray) -> np.ndarray:
    """``count`` candidate pixels closest to an existing patch (a clearing continuing past the plot edge)."""
    out = np.zeros_like(candidates)
    if count <= 0 or not candidates.any() or not around.any():
        return out
    ys, xs = np.nonzero(candidates)
    cy, cx = (float(v.mean()) for v in np.nonzero(around))
    dist = np.hypot(ys - cy, xs - cx) - 1.0 * field[ys, xs]
    take = np.argsort(dist, kind="stable")[: min(count, len(ys))]
    out[ys[take], xs[take]] = True
    return out


def _top(candidates: np.ndarray, count: int, field: np.ndarray) -> np.ndarray:
    out = np.zeros_like(candidates)
    if count <= 0 or not candidates.any():
        return out
    ys, xs = np.nonzero(candidates)
    take = np.argsort(-field[ys, xs], kind="stable")[: min(count, len(ys))]
    out[ys[take], xs[take]] = True
    return out


def render_landscape(grid: Grid, scenario_name: str, commodity: str, key: object) -> PlotRasters:
    seed = _seed(SYNTHETIC_VERSION, scenario_name, key)
    rng = np.random.default_rng(seed)
    sc = scenario_params(scenario_name, seed)
    h, w = grid.height, grid.width
    mask = grid.mask
    n_plot = int(mask.sum())
    px_ha = grid.pixel_ha

    f_forest = 0.7 * _smooth(rng, h, w, 14) + 0.3 * _smooth(rng, h, w, 5)
    f_events = _smooth(rng, h, w, 9)
    f_cloud = _smooth(rng, h, w, 12)
    f_parcel = _smooth(rng, h, w, 6)

    # forest on 31 Dec 2020
    forest = _top(mask, round(sc.forest_share * n_plot), f_forest)
    outside = ~mask
    if outside.any() and sc.surround_forest > 0:
        thr = np.quantile(f_forest[outside], 1 - sc.surround_forest)
        forest |= outside & (f_forest >= thr)

    lossyear = np.zeros((h, w), np.uint8)
    # clearing before the cut-off (context only): not forest in 2020, high tree cover in 2000
    old = _grow(mask & ~forest, round(sc.old_clear_share * n_plot), f_events)
    lossyear[old] = sc.loss_year if sc.loss_year < 21 else 18
    # clearing after the cut-off on 2020 forest
    n_loss = round(sc.loss_ha / px_ha) if sc.loss_ha else round(sc.loss_share * int((forest & mask).sum()))
    loss = _grow(forest & mask, n_loss, f_events)
    loss |= _grow_near(forest & ~mask, round(sc.spill * int(loss.sum())), loss, f_events)
    if sc.loss_year >= 21:
        lossyear[loss] = sc.loss_year
    # land change without recorded forest loss
    change = _grow(mask & ~forest & ~old, round(sc.change_share * n_plot), -f_events)
    change |= _grow_near(~mask & ~forest, round(sc.spill * int(change.sum())), change, -f_events)

    # land cover classes
    parcels = (
        np.floor((np.arange(w)[None, :] + 4 * f_parcel) / 11) * 7
        + np.floor((np.arange(h)[:, None] + 4 * f_parcel) / 11) * 13
    ).astype(np.int64)
    parcel_rand = ((parcels * 2654435761 + seed % 1_000_003) % 1000 / 1000.0).astype(np.float32)
    farm_class = TREECROP if commodity in TREE_CROPS else PASTURE
    base = np.where(parcel_rand < 0.55, TREECROP, PASTURE).astype(np.int8)
    base[mask] = farm_class
    base[old] = farm_class
    base[forest] = FOREST
    base[change] = REGROWTH  # woody fallow the 2020 forest map does not count as forest
    cur = base.copy()
    cur[loss] = REGROWTH if sc.regrowth else BARE
    cur[change] = BARE

    # tree cover 2000
    tc = np.where(
        base == FOREST,
        72 + 20 * np.clip(f_forest, -1, 1),
        np.where(base == TREECROP, 35 + 10 * f_parcel, 10 + 5 * f_parcel),
    )
    tc[old] = 80
    treecover = np.clip(tc, 0, 100).astype(np.uint8)

    # reflectance: class spectrum x shared texture (the land) + per-epoch gain, haze and noise (the sensor)
    tex = _smooth(rng, h, w, 1.3)
    brightness = 1 + 0.08 * (parcel_rand - 0.5)

    def reflectance(classes: np.ndarray) -> np.ndarray:
        spec = SPECTRA[classes]  # (H, W, 5)
        amp = TEXTURE[classes][..., None]
        img = spec * (1 + amp * tex[..., None]) * np.where(classes == FOREST, 1.0, brightness)[..., None]
        gain = rng.uniform(0.96, 1.04, 5).astype(np.float32)
        haze = rng.uniform(0.0, 0.006) * HAZE_PROFILE
        img = img * gain + haze + rng.normal(0, 0.003, img.shape).astype(np.float32) * spec
        return np.clip(img, 0.001, 1.0).astype(np.float32).transpose(2, 0, 1)

    baseline = reflectance(base)
    current = reflectance(cur)
    clear_b = np.ones((h, w), bool)
    clear_c = np.ones((h, w), bool)
    if sc.cloud_current > 0:
        cloud = _top(np.ones((h, w), bool), round(sc.cloud_current * h * w), f_cloud)
        clear_c = ~cloud
        current[:, cloud] = (CLOUD[:, None] * (1 + 0.05 * f_cloud[cloud])[None, :]).astype(np.float32)

    return PlotRasters(
        source="bundled",
        grid=grid,
        baseline=baseline,
        current=current,
        clear_baseline=clear_b,
        clear_current=clear_c,
        forest2020=forest,
        lossyear=lossyear,
        treecover2000=treecover,
        versions=dict(BUNDLED_VERSIONS),
    )


def bundled_rasters(reference: str, geometry: dict, commodity: str, area_ha: float | None) -> PlotRasters:
    grid = build_grid(geometry, area_ha)
    scenario = scenario_for(reference, geometry)
    return render_landscape(grid, scenario, commodity, geometry)
