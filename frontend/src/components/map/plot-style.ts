"use client";

import type { Map as MLMap } from "maplibre-gl";
import { MARKER_HEX, VERDICT_MAP_COLOR } from "@/components/domain/status";
import type { Geometry, PlotFeatureCollection, Verdict } from "@/lib/api/types";
import { boundsOf, centroidOf, type Bounds } from "./base";
import { ensureHatchPattern } from "./hatch";

/* ══════════════════════════════════════════════════════════════════════════
   Shared plot styling for every MapLibre map in Plotline (Atlas, mini maps).
   Status is shape first: compliant = solid fill, review = half fill,
   non-compliant = hatch, pending = dashed outline. Dots use the same glyphs.
   ══════════════════════════════════════════════════════════════════════════ */

export const FOREST_HEX = "#3f8f55";
/** Sentinel loss year for plots with no loss after the cut-off (keeps expressions numeric). */
export const NO_LOSS = 9999;
export const RULER_FIRST = 2018;
export const RULER_LAST = 2026;
export const CUTOFF_YEAR = 2020;

export const verdictColor = [
  "match",
  ["get", "verdict"],
  "compliant",
  VERDICT_MAP_COLOR.compliant,
  "needs_review",
  VERDICT_MAP_COLOR.needs_review,
  "non_compliant",
  VERDICT_MAP_COLOR.non_compliant,
  VERDICT_MAP_COLOR.pending,
] as unknown as string;

/** Properties the atlas adds to each map feature (`lossFirstYear` comes from /plots/map; the rest are derived). */
export interface AtlasProps {
  id: string;
  reference: string;
  verdict: Verdict;
  commodity: string;
  supplierName: string;
  areaHa: number;
  kind: string;
  lossFirstYear?: number | null;
  lossByYear?: Record<string, number>;
  /** Derived: first loss year or NO_LOSS. */
  lossYear: number;
  /** Derived: hectares lost after the cut-off (best known). */
  lossHa: number;
  country: string;
}

/**
 * Attach loss year / loss hectares to every feature. Uses the map endpoint's `lossFirstYear` and
 * `lossByYear` when present; otherwise falls back to the plot headline ("2.4 ha of forest cleared in 2022")
 * and, for non-compliant plots without a year, the first year after the cut-off.
 */
export function enrich(fc: PlotFeatureCollection | undefined, hints: Map<string, { headline?: string | null; country?: string }> = new Map()) {
  const features = (fc?.features ?? []).map((f) => {
    const p = f.properties;
    const hint = hints.get(p.id);
    let lossYear: number | null = typeof p.lossFirstYear === "number" ? p.lossFirstYear : null;
    let lossHa = p.lossByYear ? Object.values(p.lossByYear).reduce((s, v) => s + Number(v || 0), 0) : 0;
    const m = hint?.headline?.match(/([\d.]+)\s*ha of forest (?:cleared|lost) in (20\d\d)\b/i);
    if (lossYear === null && p.lossFirstYear === undefined && m) {
      lossYear = Number(m[2]);
      if (!lossHa) lossHa = Number(m[1]);
    }
    if (lossYear === null && p.lossFirstYear === undefined && p.verdict === "non_compliant") lossYear = CUTOFF_YEAR + 1;
    const byYear = p.lossByYear && Object.keys(p.lossByYear).length ? p.lossByYear : lossYear && lossHa ? { [String(lossYear)]: lossHa } : {};
    const props: AtlasProps = {
      ...p,
      lossYear: lossYear ?? NO_LOSS,
      lossHa,
      lossByYear: byYear,
      country: hint?.country ?? p.reference.slice(0, 2).toUpperCase(),
    };
    return { ...f, id: undefined, properties: props };
  });
  return { type: "FeatureCollection" as const, features };
}
export type AtlasCollection = ReturnType<typeof enrich>;

/** Outer rings as line strings (for the self-drawing outline layer, which needs line progress). */
export function rings(fc: AtlasCollection): GeoJSON.FeatureCollection {
  const out: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    const g = f.geometry as Geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) if (poly[0]?.length) out.push({ type: "Feature", geometry: { type: "LineString", coordinates: poly[0] }, properties: f.properties as unknown as GeoJSON.GeoJsonProperties });
  }
  return { type: "FeatureCollection", features: out };
}

export function points(fc: AtlasCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: centroidOf(f.geometry as Geometry) },
      properties: f.properties as unknown as GeoJSON.GeoJsonProperties,
    })),
  };
}

/* ── Glyph icons (the status squares, drawn for symbol layers) ──────────── */
const GLYPH_PX = 13;
function glyphCanvas(draw: (ctx: CanvasRenderingContext2D, s: number) => void, ratio = 2) {
  const s = GLYPH_PX * ratio;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  draw(ctx, s);
  return ctx.getImageData(0, 0, s, s);
}

/** Registers `pl-glyph-<verdict>`, `pl-glyph-forest` and `pl-glyph-selected` images (call after each style load). */
export function ensureGlyphs(map: MLMap, dark: boolean) {
  const ratio = 2;
  const paper = dark ? "#0b1014" : "#f6f2e9";
  const inset = 2.5 * ratio;
  const box = (ctx: CanvasRenderingContext2D, s: number, fill: string | null, stroke: string, dash?: number[]) => {
    ctx.fillStyle = paper;
    ctx.fillRect(inset - ratio, inset - ratio, s - 2 * (inset - ratio), s - 2 * (inset - ratio));
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(inset, inset, s - 2 * inset, s - 2 * inset);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4 * ratio;
    if (dash) ctx.setLineDash(dash.map((d) => d * ratio));
    ctx.strokeRect(inset, inset, s - 2 * inset, s - 2 * inset);
    ctx.setLineDash([]);
  };
  const add = (id: string, draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
    if (map.hasImage(id)) map.removeImage(id);
    const img = glyphCanvas(draw, ratio);
    if (img) map.addImage(id, img, { pixelRatio: ratio });
  };
  add("pl-glyph-compliant", (ctx, s) => box(ctx, s, VERDICT_MAP_COLOR.compliant, VERDICT_MAP_COLOR.compliant));
  add("pl-glyph-forest", (ctx, s) => box(ctx, s, `${FOREST_HEX}55`, FOREST_HEX));
  add("pl-glyph-needs_review", (ctx, s) => {
    box(ctx, s, null, VERDICT_MAP_COLOR.needs_review);
    ctx.fillStyle = VERDICT_MAP_COLOR.needs_review;
    ctx.beginPath();
    ctx.moveTo(inset, s - inset);
    ctx.lineTo(s - inset, inset);
    ctx.lineTo(s - inset, s - inset);
    ctx.closePath();
    ctx.fill();
  });
  add("pl-glyph-non_compliant", (ctx, s) => {
    box(ctx, s, null, VERDICT_MAP_COLOR.non_compliant);
    ctx.save();
    ctx.beginPath();
    ctx.rect(inset, inset, s - 2 * inset, s - 2 * inset);
    ctx.clip();
    ctx.strokeStyle = VERDICT_MAP_COLOR.non_compliant;
    ctx.lineWidth = 1.2 * ratio;
    for (let o = -s; o < s * 2; o += 3.2 * ratio) {
      ctx.beginPath();
      ctx.moveTo(o, s);
      ctx.lineTo(o + s, 0);
      ctx.stroke();
    }
    ctx.restore();
  });
  add("pl-glyph-pending", (ctx, s) => box(ctx, s, null, VERDICT_MAP_COLOR.pending, [2, 1.5]));
  add("pl-glyph-selected", (ctx, s) => {
    ctx.strokeStyle = MARKER_HEX;
    ctx.lineWidth = 2 * ratio;
    ctx.beginPath();
    ctx.moveTo(s / 2, ratio);
    ctx.lineTo(s - ratio, s / 2);
    ctx.lineTo(s / 2, s - ratio);
    ctx.lineTo(ratio, s / 2);
    ctx.closePath();
    ctx.stroke();
  });
  ensureHatchPattern(map, "pl-hatch", VERDICT_MAP_COLOR.non_compliant);
}

/* ── Year-dependent expressions (time ruler) ────────────────────────────── */
/** Loss visible at `year`? Tweened between two years with `t` for the plots that change state. */
export function lossOpacity(from: number, to: number, t: number) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const v = to >= from ? t : 1 - t;
  return ["case", ["<=", ["get", "lossYear"], lo], 1, ["<=", ["get", "lossYear"], hi], v, 0] as unknown as number;
}

/** A plot that lost forest after the cut-off, but later than `year`: it still shows as the 2020 forest. */
const stillForest = (year: number) => ["all", ["!=", ["get", "lossYear"], NO_LOSS], [">", ["get", "lossYear"], year]];

/** Icon for the dot layer: before the plot's loss year it shows as the 2020 forest. */
export function glyphFor(year: number) {
  return ["case", stillForest(year), "pl-glyph-forest", ["concat", "pl-glyph-", ["get", "verdict"]]] as unknown as string;
}
export function lineColorFor(year: number) {
  return ["case", stillForest(year), FOREST_HEX, verdictColor] as unknown as string;
}

/* ── Regions (quick jumps) ──────────────────────────────────────────────── */
export interface Region {
  key: string;
  label: string;
  countries: string[];
}
export const REGIONS: Region[] = [
  { key: "west-africa", label: "West Africa", countries: ["CI", "GH", "NG", "CM", "LR", "SL", "TG", "GN", "BJ"] },
  { key: "brazil", label: "Brazil", countries: ["BR"] },
  { key: "peru", label: "Peru", countries: ["PE", "CO", "EC", "BO"] },
  { key: "indonesia", label: "Indonesia", countries: ["ID", "MY", "PG"] },
];

export function regionOf(country: string) {
  return REGIONS.find((r) => r.countries.includes(country.toUpperCase()))?.key ?? "other";
}

export function regionBounds(fc: AtlasCollection, key: string | null): Bounds | null {
  const feats = key ? fc.features.filter((f) => regionOf(f.properties.country) === key) : fc.features;
  return boundsOf(feats.map((f) => f.geometry as Geometry));
}

/** Regions that hold plots, largest first. */
export function regionsWithPlots(fc: AtlasCollection) {
  const n = new Map<string, number>();
  for (const f of fc.features) n.set(regionOf(f.properties.country), (n.get(regionOf(f.properties.country)) ?? 0) + 1);
  return REGIONS.filter((r) => n.get(r.key)).map((r) => ({ ...r, plots: n.get(r.key) ?? 0 }));
}

/* ── Small tween for paint properties (MapLibre can't transition data-driven paint) ── */
export function tween(ms: number, onFrame: (t: number) => void, reduce = false) {
  if (reduce || ms <= 0) {
    onFrame(1);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    onFrame(ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/** Metres covered by `px` screen pixels at this latitude and zoom (512 px tiles). */
export function metresPerPixel(lat: number, zoom: number) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
}

/** A round scale-bar length (1, 2, 5 × 10ⁿ metres) that fits in `maxPx`. */
export function niceScale(lat: number, zoom: number, maxPx = 96) {
  const mpp = metresPerPixel(lat, zoom);
  const maxM = mpp * maxPx;
  const pow = Math.pow(10, Math.floor(Math.log10(maxM)));
  const nice = [5, 2, 1].map((k) => k * pow).find((v) => v <= maxM) ?? pow;
  return { px: nice / mpp, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` };
}
