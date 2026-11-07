"""Live evidence reads for one plot (``EO_SOURCE=live``; needs the optional ``[eo]`` extra and network).

- Sentinel-2 L2A from Microsoft Planetary Computer (anonymous SAS signing): least-cloudy scenes of one MGRS
  tile for 2020 and for the current window, clear-sky minimum-blue composite (same method as ``ml/fetch.py``);
- Hansen Global Forest Change ``lossyear`` and ``treecover2000`` (public Google Cloud Storage);
- EU JRC Global Forest Cover 2020 (single COG, JRC open data).

All layers are warped onto the plot's 10 m UTM grid and cached as a small ``.npz`` under
``DATA_DIR/rasters/``. Any failure raises ``EvidenceUnavailable`` (the assessment is then ``pending``).
"""

from __future__ import annotations

import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from app.eo.grid import Grid, build_grid
from app.eo.rasters import HANSEN_VERSION, LIVE_VERSIONS, EvidenceUnavailable, PlotRasters

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
HANSEN_BASE = f"https://storage.googleapis.com/earthenginepartners-hansen/{HANSEN_VERSION}"
JRC_COG = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/FOREST/GFC2020/LATEST/single-cog/JRC_GFC2020_V4_COG.tif"
)
BASELINE_WINDOW = "2020-01-01/2020-12-31"
CURRENT_WINDOW = "2026-01-01/2026-10-31"
BANDS = ("B02", "B03", "B04", "B08", "B11")
CLEAR_SCL = (4, 5, 6)
CLOUD_BLUE = 0.13
SCENES = 5
CACHE_VERSION = "live-v2"
_GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
}


def _cache_dir() -> Path:
    from app.core.config import get_settings

    return Path(get_settings().data_dir) / "rasters"


def hansen_tile(lat: float, lon: float) -> str:
    top = math.ceil(lat / 10) * 10
    left = math.floor(lon / 10) * 10
    return f"{abs(top):02d}{'N' if top >= 0 else 'S'}_{abs(left):03d}{'E' if left >= 0 else 'W'}"


def _read_warped(href: str, grid: Grid, resampling: str = "nearest") -> np.ndarray:
    """Read the source window covering the grid (plus a margin) and reproject it onto the plot grid."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import reproject, transform_bounds
    from rasterio.windows import from_bounds

    dst_transform = rasterio.Affine(grid.pixel_m, 0, grid.x0, 0, -grid.pixel_m, grid.y1)
    x0, y0, x1, y1 = grid.bounds
    pad = 4 * grid.pixel_m
    with rasterio.Env(**_GDAL_ENV), rasterio.open(href) as src:
        left, bottom, right, top = transform_bounds(grid.crs, src.crs, x0 - pad, y0 - pad, x1 + pad, y1 + pad)
        window = from_bounds(left, bottom, right, top, src.transform).round_offsets().round_lengths()
        data = src.read(1, window=window, boundless=True, fill_value=0)
        src_transform = src.window_transform(window)
        src_crs = src.crs
    out = np.zeros((grid.height, grid.width), dtype=data.dtype)
    reproject(
        data,
        out,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=grid.crs,
        resampling=getattr(Resampling, resampling),
    )
    return out


def _lonlat_bbox(grid: Grid) -> tuple[float, float, float, float]:
    from pyproj import Transformer

    t = Transformer.from_crs(grid.crs, "EPSG:4326", always_xy=True)
    x0, y0, x1, y1 = grid.bounds
    xs, ys = t.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
    return min(xs), min(ys), max(xs), max(ys)


def _scenes(catalog: object, bbox: tuple[float, float, float, float], window: str, tile: str | None) -> list:
    items = list(
        catalog.search(  # type: ignore[attr-defined]
            collections=["sentinel-2-l2a"],
            bbox=list(bbox),
            datetime=window,
            query={"eo:cloud_cover": {"lt": 70}},
            max_items=120,
        ).items()
    )
    if not items:
        return []
    if tile is None:
        counts: dict[str, int] = {}
        for it in items:
            counts[it.properties["s2:mgrs_tile"]] = counts.get(it.properties["s2:mgrs_tile"], 0) + 1
        tile = max(counts, key=lambda k: counts[k])
    items = [it for it in items if it.properties["s2:mgrs_tile"] == tile]
    items.sort(key=lambda it: it.properties["eo:cloud_cover"])
    return items[:SCENES]


def _composite(items: list, grid: Grid) -> tuple[np.ndarray, np.ndarray]:
    n, h, w = len(items), grid.height, grid.width
    stack = np.zeros((n, len(BANDS), h, w), np.float32)
    clear = np.zeros((n, h, w), bool)
    jobs = [
        (i, b, it.assets[band].href, "bilinear" if band == "B11" else "nearest")
        for i, it in enumerate(items)
        for b, band in enumerate(BANDS)
    ]
    jobs += [(i, -1, it.assets["SCL"].href, "nearest") for i, it in enumerate(items)]
    with ThreadPoolExecutor(6) as ex:
        for i, b, arr in ex.map(lambda j: (j[0], j[1], _read_warped(j[2], grid, j[3])), jobs):
            if b == -1:
                clear[i] = np.isin(arr, CLEAR_SCL)
            else:
                stack[i, b] = arr.astype(np.float32)
    for i, it in enumerate(items):
        baseline = float(it.properties.get("s2:processing_baseline", "0") or 0)
        offset = 1000.0 if baseline >= 4.0 else 0.0
        stack[i] = np.clip((stack[i] - offset) / 10_000.0, 0, 1.5)
    clear &= (stack > 0).all(axis=1) & (stack[:, 0] < CLOUD_BLUE)
    blue = np.where(clear, stack[:, 0], np.inf)
    pick = np.argmin(blue, axis=0)
    comp = np.take_along_axis(stack, pick[None, None], axis=0)[0]
    any_clear = clear.any(axis=0)
    comp[:, ~any_clear] = 0.0
    return comp.astype(np.float32), any_clear


def _key(geometry: dict, area_ha: float | None) -> str:
    raw = json.dumps([CACHE_VERSION, geometry, round(float(area_ha or 0), 4)], sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def live_rasters(geometry: dict, area_ha: float | None) -> PlotRasters:
    grid = build_grid(geometry, area_ha)
    path = _cache_dir() / f"{_key(geometry, area_ha)}.npz"
    if path.exists():
        d = np.load(path, allow_pickle=False)
        return PlotRasters(
            "live",
            grid,
            d["baseline"],
            d["current"],
            d["clear_baseline"],
            d["clear_current"],
            d["forest2020"],
            d["lossyear"],
            d["treecover2000"],
            json.loads(str(d["versions"])),
        )
    try:
        import planetary_computer
        import pystac_client
    except ImportError as exc:
        raise EvidenceUnavailable(
            "live evidence needs the optional [eo] extra (rasterio, pystac-client)"
        ) from exc
    try:
        bbox = _lonlat_bbox(grid)
        lat, lon = (bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2
        catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
        base_items = _scenes(catalog, bbox, BASELINE_WINDOW, None)
        if not base_items:
            raise EvidenceUnavailable("no 2020 Sentinel-2 scenes")
        tile = base_items[0].properties["s2:mgrs_tile"]
        cur_items = _scenes(catalog, bbox, CURRENT_WINDOW, tile)
        if not cur_items:
            raise EvidenceUnavailable("no current Sentinel-2 scenes")
        baseline, clear_b = _composite(base_items, grid)
        current, clear_c = _composite(cur_items, grid)
        ht = hansen_tile(lat, lon)
        lossyear = _read_warped(f"{HANSEN_BASE}/Hansen_{HANSEN_VERSION}_lossyear_{ht}.tif", grid).astype(
            np.uint8
        )
        treecover = _read_warped(
            f"{HANSEN_BASE}/Hansen_{HANSEN_VERSION}_treecover2000_{ht}.tif", grid
        ).astype(np.uint8)
        forest = _read_warped(JRC_COG, grid) == 1
    except EvidenceUnavailable:
        raise
    except Exception as exc:  # network, signing, missing assets
        raise EvidenceUnavailable(f"{type(exc).__name__}: {exc}") from exc
    versions = dict(LIVE_VERSIONS)
    versions["imagery"] += (
        f" (scenes {', '.join(it.id for it in base_items[:2])} ... / {cur_items[0].id} ...)"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        path,
        baseline=baseline,
        current=current,
        clear_baseline=clear_b,
        clear_current=clear_c,
        forest2020=forest,
        lossyear=lossyear,
        treecover2000=treecover,
        versions=np.array(json.dumps(versions)),
    )
    return PlotRasters(
        "live", grid, baseline, current, clear_b, clear_c, forest, lossyear, treecover, versions
    )
