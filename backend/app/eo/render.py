"""Before / after imagery and forest-map overlays for a plot, as PNG (Pillow, no GIS server)."""

from __future__ import annotations

import io
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw

from app.eo.rasters import CUTOFF_LOSSYEAR, PlotRasters

ImageryKind = Literal["baseline", "current", "forest", "loss"]
KINDS: tuple[str, ...] = ("baseline", "current", "forest", "loss")
TARGET_PX = 384
FOREST_RGB = (46, 125, 72)
LOSS_RGB = (214, 69, 44)
OLD_LOSS_RGB = (226, 178, 62)
CLOUD_RGB = (236, 238, 240)


def true_colour(refl: np.ndarray) -> np.ndarray:
    """(5, H, W) reflectance -> (H, W, 3) uint8 with a fixed stretch so 2020 and now are comparable."""
    rgb = np.stack([refl[2], refl[1], refl[0]], axis=-1)
    rgb = np.clip(rgb / 0.16, 0, 1) ** 0.6
    return (rgb * 255).astype(np.uint8)


def _muted(rgb: np.ndarray, amount: float = 0.55) -> np.ndarray:
    grey = rgb.mean(axis=-1, keepdims=True)
    out = rgb * (1 - amount) + grey * amount
    return (out * 0.85 + 255 * 0.15).astype(np.uint8)


def _overlay(rgb: np.ndarray, mask: np.ndarray, colour: tuple[int, int, int], alpha: float) -> np.ndarray:
    out = rgb.astype(np.float32)
    out[mask] = out[mask] * (1 - alpha) + np.array(colour, np.float32) * alpha
    return out.astype(np.uint8)


def _outline(img: Image.Image, r: PlotRasters, scale: float) -> None:
    g = r.grid
    draw = ImageDraw.Draw(img)
    geoms = getattr(g.plot_m, "geoms", [g.plot_m])
    for poly in geoms:
        rings = [poly.exterior, *poly.interiors]
        for ring in rings:
            xs, ys = g.to_pixel(np.asarray(ring.xy[0]), np.asarray(ring.xy[1]))
            pts = [(float(x * scale), float(y * scale)) for x, y in zip(xs, ys, strict=True)]
            draw.line(pts, fill=(20, 24, 22), width=5, joint="curve")
            draw.line(pts, fill=(255, 255, 255), width=2, joint="curve")


def render(r: PlotRasters, kind: ImageryKind) -> bytes:
    if kind not in KINDS:
        raise ValueError(f"unknown imagery kind {kind!r}")
    if kind == "baseline":
        rgb = true_colour(r.baseline)
        rgb[~r.clear_baseline] = CLOUD_RGB
    elif kind == "current":
        rgb = true_colour(r.current)
        rgb[~r.clear_current] = CLOUD_RGB
    elif kind == "forest":
        rgb = _overlay(_muted(true_colour(r.baseline)), r.forest2020, FOREST_RGB, 0.55)
    else:
        rgb = _muted(true_colour(r.current))
        old = (r.lossyear >= 1) & (r.lossyear < CUTOFF_LOSSYEAR)
        rgb = _overlay(rgb, old, OLD_LOSS_RGB, 0.45)
        rgb = _overlay(rgb, (r.lossyear >= CUTOFF_LOSSYEAR) & r.forest2020, LOSS_RGB, 0.7)
    h, w = rgb.shape[:2]
    scale = max(1.0, TARGET_PX / max(h, w))
    size = (round(w * scale), round(h * scale))
    img = Image.fromarray(rgb, "RGB").resize(
        size, Image.Resampling.NEAREST if kind in ("forest", "loss") else Image.Resampling.BILINEAR
    )
    _outline(img, r, scale)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def placeholder(size: int = TARGET_PX) -> bytes:
    """Neutral tile shown while satellite imagery for a plot is not available."""
    img = Image.new("RGB", (size, size), (226, 229, 224))
    draw = ImageDraw.Draw(img)
    for x in range(-size, size, 24):
        draw.line([(x, size), (x + size, 0)], fill=(212, 216, 210), width=6)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
