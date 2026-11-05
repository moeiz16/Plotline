"""Download demo-scale Earth-observation data for every study region (no account needed).

For each region and each epoch (2020 baseline, current) we:
1. search Sentinel-2 L2A on Microsoft Planetary Computer (anonymous SAS signing) for scenes on one
   MGRS tile, least cloudy first;
2. read a 1024 x 1024 window at 10 m for five bands plus the scene classification layer (SCL);
3. build a per-pixel median composite of clear observations (SCL vegetation / bare / water / unclassified);
and alongside it read, reprojected onto the same grid:
- Hansen Global Forest Change ``lossyear`` and ``treecover2000`` (public Google Cloud Storage);
- the EU JRC Global Forest Cover 2020 map (JRC open data COG).

Output: ``data/eo/regions/<key>.npz``. Re-running skips regions that already exist.

    python -m plotline_ml.fetch [--regions ci_cavally,gh_western_north] [--scenes 5]
"""

from __future__ import annotations

import argparse
import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds

from plotline_ml.regions import (
    BANDS,
    BASELINE_WINDOW,
    CURRENT_WINDOW,
    HANSEN_BASE,
    HANSEN_VERSION,
    JRC_GFC2020_COG,
    JRC_VERSION,
    REGIONS,
    STAC_URL,
    WINDOW_PX,
    Region,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "eo" / "regions"
CLEAR_SCL = (4, 5, 6)  # vegetation, not vegetated, water (unclassified pixels are often cloud edges)
CLOUD_BLUE = 0.13  # B02 reflectance above this is haze/cloud over tropical land cover

_GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MAX_RETRY": "4",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF",
    "GDAL_HTTP_MULTIRANGE": "YES",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
}


def hansen_tile(lat: float, lon: float) -> str:
    top = math.ceil(lat / 10) * 10
    left = math.floor(lon / 10) * 10
    return f"{abs(top):02d}{'N' if top >= 0 else 'S'}_{abs(left):03d}{'E' if left >= 0 else 'W'}"


def _bbox(region: Region, half_m: float) -> tuple[float, float, float, float]:
    dlat = half_m / 111_320
    dlon = half_m / (111_320 * math.cos(math.radians(region.lat)))
    return region.lon - dlon, region.lat - dlat, region.lon + dlon, region.lat + dlat


def _search(catalog: pystac_client.Client, region: Region, window: str, tile: str | None, n: int) -> list:
    lon0, lat0, lon1, lat1 = _bbox(region, WINDOW_PX * 10 / 2)
    search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=[lon0, lat0, lon1, lat1],
        datetime=window,
        query={"eo:cloud_cover": {"lt": 70}},
        max_items=300,
    )
    items = list(search.items())
    if tile is None:
        # the MGRS tile that fully contains the window and has the most clear scenes
        counts: dict[str, int] = {}
        for it in items:
            counts[it.properties["s2:mgrs_tile"]] = counts.get(it.properties["s2:mgrs_tile"], 0) + 1
        tile = max(counts, key=lambda k: counts[k])
    items = [it for it in items if it.properties["s2:mgrs_tile"] == tile]
    items.sort(key=lambda it: it.properties["eo:cloud_cover"])
    return items[:n]


def _target_grid(region: Region, crs: str) -> tuple[rasterio.Affine, tuple[float, float, float, float]]:
    from pyproj import Transformer

    x, y = Transformer.from_crs("EPSG:4326", crs, always_xy=True).transform(region.lon, region.lat)
    half = WINDOW_PX * 10 / 2
    x0 = round((x - half) / 10) * 10
    y1 = round((y + half) / 10) * 10
    transform = rasterio.Affine(10.0, 0.0, x0, 0.0, -10.0, y1)
    return transform, (x0, y1 - WINDOW_PX * 10, x0 + WINDOW_PX * 10, y1)


def _read_asset(href: str, bounds: tuple[float, float, float, float], resampling: Resampling) -> np.ndarray:
    with rasterio.Env(**_GDAL_ENV), rasterio.open(href) as src:
        window = from_bounds(*bounds, src.transform)
        return src.read(
            1, window=window, out_shape=(WINDOW_PX, WINDOW_PX), resampling=resampling, boundless=True, fill_value=0
        )


def _composite(items: list, bounds: tuple[float, float, float, float]) -> tuple[np.ndarray, np.ndarray, list]:
    stack = np.zeros((len(items), len(BANDS), WINDOW_PX, WINDOW_PX), dtype=np.float32)
    clear = np.zeros((len(items), WINDOW_PX, WINDOW_PX), dtype=bool)
    jobs = []
    for i, it in enumerate(items):
        for b, band in enumerate(BANDS):
            res = Resampling.bilinear if band == "B11" else Resampling.nearest
            jobs.append((i, b, it.assets[band].href, res))
        jobs.append((i, -1, it.assets["SCL"].href, Resampling.nearest))

    def run(job: tuple) -> tuple[int, int, np.ndarray]:
        i, b, href, res = job
        for attempt in range(3):
            try:
                return i, b, _read_asset(href, bounds, res)
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(3)
        raise RuntimeError("unreachable")

    with ThreadPoolExecutor(8) as ex:
        for i, b, arr in ex.map(run, jobs):
            if b == -1:
                clear[i] = np.isin(arr, CLEAR_SCL)
            else:
                stack[i, b] = arr.astype(np.float32)
    meta = []
    for i, it in enumerate(items):
        baseline = float(it.properties.get("s2:processing_baseline", "0") or 0)
        offset = 1000.0 if baseline >= 4.0 else 0.0  # BOA_ADD_OFFSET introduced with baseline 04.00
        stack[i] = np.clip((stack[i] - offset) / 10_000.0, 0, 1.5)
        meta.append({"id": it.id, "cloud": it.properties["eo:cloud_cover"], "baseline": baseline})
    # pixels at a swath edge (no data in any band) or with a bright blue band are not clear
    clear &= (stack > 0).all(axis=1) & (stack[:, 0] < CLOUD_BLUE)
    # drop hazy scenes: median blue over clear pixels well above the clearest scene's
    blue = np.array([np.median(stack[i, 0][clear[i]]) if clear[i].mean() > 0.05 else np.inf for i in range(len(items))])
    if np.isfinite(blue).any():
        ref = np.nanmin(blue[np.isfinite(blue)])
        for i in range(len(items)):
            if not np.isfinite(blue[i]) or blue[i] > ref * 1.6:
                clear[i] = False
    # Minimum-blue compositing: among clear observations take, per pixel, the one with the lowest blue
    # reflectance. Haze and cloud remnants raise blue, so this suppresses them (shadows are already
    # excluded by the scene classification).
    blue_masked = np.where(clear, stack[:, 0], np.inf)
    pick = np.argmin(blue_masked, axis=0)
    comp = np.take_along_axis(stack, pick[None, None], axis=0)[0]
    n_clear = clear.sum(axis=0).astype(np.uint8)
    comp[:, n_clear == 0] = 0.0
    return (comp * 10_000).astype(np.uint16), n_clear, meta


def _reproject_layer(href: str, region: Region, transform: rasterio.Affine, crs: str) -> np.ndarray:
    lon0, lat0, lon1, lat1 = _bbox(region, WINDOW_PX * 10 / 2 + 600)
    with rasterio.Env(**_GDAL_ENV), rasterio.open(href) as src:
        window = from_bounds(lon0, lat0, lon1, lat1, src.transform).round_offsets().round_lengths()
        data = src.read(1, window=window)
        src_transform = src.window_transform(window)
        src_crs = src.crs
    out = np.zeros((WINDOW_PX, WINDOW_PX), dtype=np.uint8)
    reproject(
        data,
        out,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=transform,
        dst_crs=crs,
        resampling=Resampling.nearest,
    )
    return out


def fetch_region(catalog: pystac_client.Client, region: Region, n_scenes: int) -> Path:
    out = OUT / f"{region.key}.npz"
    if out.exists():
        print(f"[skip] {region.key}")
        return out
    t0 = time.time()
    base_items = _search(catalog, region, BASELINE_WINDOW, None, n_scenes)
    if not base_items:
        raise RuntimeError(f"no baseline scenes for {region.key}")
    tile = base_items[0].properties["s2:mgrs_tile"]
    cur_items = _search(catalog, region, CURRENT_WINDOW, tile, n_scenes)
    with rasterio.open(base_items[0].assets["B04"].href) as src:
        crs = src.crs.to_string()
    transform, bounds = _target_grid(region, crs)
    s2_base, clear_base, meta_base = _composite(base_items, bounds)
    s2_cur, clear_cur, meta_cur = _composite(cur_items, bounds)
    tile_id = hansen_tile(region.lat, region.lon)
    lossyear = _reproject_layer(
        f"{HANSEN_BASE}/Hansen_{HANSEN_VERSION}_lossyear_{tile_id}.tif", region, transform, crs
    )
    treecover = _reproject_layer(
        f"{HANSEN_BASE}/Hansen_{HANSEN_VERSION}_treecover2000_{tile_id}.tif", region, transform, crs
    )
    jrc = _reproject_layer(JRC_GFC2020_COG, region, transform, crs)
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {
        "region": region.key,
        "country": region.country,
        "commodity": region.commodity,
        "crs": crs,
        "transform": list(transform)[:6],
        "bounds_4326": transform_bounds(crs, "EPSG:4326", *bounds),
        "mgrs_tile": tile,
        "bands": list(BANDS),
        "baseline_scenes": meta_base,
        "current_scenes": meta_cur,
        "hansen": HANSEN_VERSION,
        "jrc": JRC_VERSION,
    }
    np.savez_compressed(
        out,
        s2_baseline=s2_base,
        s2_current=s2_cur,
        clear_baseline=clear_base,
        clear_current=clear_cur,
        lossyear=lossyear,
        treecover2000=treecover,
        jrc_forest2020=jrc,
        meta=np.array(json.dumps(meta)),
    )
    print(
        f"[ok] {region.key} tile={tile} scenes={len(base_items)}/{len(cur_items)} "
        f"loss21+={(lossyear >= 21).mean():.3f} jrc={jrc.mean():.2f} in {time.time() - t0:.0f}s"
    )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--regions", default="", help="comma-separated region keys (default: all)")
    ap.add_argument("--scenes", type=int, default=8, help="scenes per epoch for the clear-sky composite")
    args = ap.parse_args()
    wanted = {k for k in args.regions.split(",") if k}
    catalog = pystac_client.Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    for region in REGIONS:
        if wanted and region.key not in wanted:
            continue
        try:
            fetch_region(catalog, region, args.scenes)
        except Exception as exc:  # keep going; a region can be retried later
            print(f"[fail] {region.key}: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
