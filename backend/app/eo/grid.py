"""The raster grid around a plot: a local UTM frame at 10 m (Sentinel-2 resolution) with the plot mask."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from shapely import contains_xy
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from app.spatial.geometry import as_polygon, to_metric, utm_crs

PIXEL_M = 10.0
MIN_PX = 48  # >= one 32 x 32 encoder patch plus context for the imagery
MAX_PX = 256
MARGIN_M = 80.0


@dataclass(frozen=True)
class Grid:
    crs: str  # e.g. "EPSG:32630"
    x0: float  # left edge (m)
    y1: float  # top edge (m)
    pixel_m: float
    width: int
    height: int
    plot_m: BaseGeometry  # plot footprint in the grid CRS
    mask: np.ndarray  # (H, W) bool, pixel centre inside the plot

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return self.x0, self.y1 - self.height * self.pixel_m, self.x0 + self.width * self.pixel_m, self.y1

    @property
    def pixel_ha(self) -> float:
        return self.pixel_m * self.pixel_m / 10_000.0

    def to_pixel(self, x: np.ndarray | float, y: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
        return (np.asarray(x) - self.x0) / self.pixel_m, (self.y1 - np.asarray(y)) / self.pixel_m

    def pixel_centres(self) -> tuple[np.ndarray, np.ndarray]:
        cols = self.x0 + (np.arange(self.width) + 0.5) * self.pixel_m
        rows = self.y1 - (np.arange(self.height) + 0.5) * self.pixel_m
        return np.meshgrid(cols, rows)


def build_grid(geometry: dict, area_ha: float | None = None) -> Grid:
    footprint = shape(as_polygon(geometry, area_ha))
    c = footprint.centroid
    crs = utm_crs(c.x, c.y)
    poly = to_metric(footprint, crs)
    minx, miny, maxx, maxy = poly.bounds
    side = max(maxx - minx, maxy - miny)
    margin = max(MARGIN_M, 0.35 * side)
    size_m = max(side + 2 * margin, MIN_PX * PIXEL_M)
    pixel = PIXEL_M
    if size_m / pixel > MAX_PX:  # very large plots: coarser pixels keep the grid small
        pixel = math.ceil(size_m / MAX_PX / PIXEL_M) * PIXEL_M
    n = math.ceil(size_m / pixel)
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    x0 = math.floor((cx - n * pixel / 2) / pixel) * pixel
    y1 = math.ceil((cy + n * pixel / 2) / pixel) * pixel
    grid = Grid(f"EPSG:{crs.to_epsg()}", x0, y1, pixel, n, n, poly, np.zeros((n, n), bool))
    xs, ys = grid.pixel_centres()
    mask = contains_xy(poly, xs, ys)
    if not mask.any():  # tiny plot between pixel centres: take the nearest pixel
        px, py = grid.to_pixel(poly.centroid.x, poly.centroid.y)
        mask[min(int(py), n - 1), min(int(px), n - 1)] = True
    return Grid(grid.crs, x0, y1, pixel, n, n, poly, mask)
