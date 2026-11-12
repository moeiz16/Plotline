"use client";

import type { Map as MaplibreMap } from "maplibre-gl";
import { VERDICT_MAP_COLOR } from "@/components/domain/status";

/**
 * Registers a diagonal hatch image on a MapLibre map so non-compliant plots (and forest
 * lost after the cut-off) can be drawn with `fill-pattern`, matching the CSS `hatch-*`
 * utilities. Call after the style loads (and again after a style swap).
 *
 *   ensureHatchPattern(map);                       // "pl-hatch" in crimson
 *   map.addLayer({ type: "fill", paint: { "fill-pattern": "pl-hatch" }, ... });
 */
export function ensureHatchPattern(map: MaplibreMap, id = "pl-hatch", color = VERDICT_MAP_COLOR.non_compliant, size = 8, ratio = 2) {
  if (map.hasImage(id)) return;
  const px = size * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4 * ratio;
  ctx.lineCap = "square";
  ctx.beginPath();
  // three strokes so the 45° lines tile seamlessly
  for (const o of [-px, 0, px]) {
    ctx.moveTo(o, px);
    ctx.lineTo(o + px, 0);
  }
  ctx.stroke();
  map.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio: ratio });
}
