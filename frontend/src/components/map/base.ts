"use client";

import type { StyleSpecification } from "maplibre-gl";
import type { Geometry, PlotFeatureCollection, Position } from "@/lib/api/types";

export type Basemap = "map" | "satellite";

export const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION =
  'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics and the GIS User Community';

type MaplibreModule = typeof import("maplibre-gl");

let libPromise: Promise<MaplibreModule> | null = null;
/** MapLibre is loaded on demand in the browser only (it needs WebGL and the DOM). */
export function loadMaplibre(): Promise<MaplibreModule> {
  libPromise ??= import("maplibre-gl").then((m) => ((m as unknown as { default?: MaplibreModule }).default ?? m) as MaplibreModule);
  return libPromise;
}

let stylePromise: Promise<StyleSpecification | null> | null = null;
/** The street basemap. Resolves to null when offline, so maps fall back to a plain background. */
export function fetchVectorStyle(): Promise<StyleSpecification | null> {
  stylePromise ??= (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(VECTOR_STYLE_URL, { signal: ctrl.signal });
      if (!res.ok) return null;
      return (await res.json()) as StyleSpecification;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  })().then((s) => {
    if (!s) stylePromise = null; // try again next time a map opens
    return s;
  });
  return stylePromise;
}

export function backgroundColor(dark: boolean) {
  return dark ? "#1f1e1a" : "#ece8df";
}

export function baseStyle(kind: Basemap, dark: boolean, vector: StyleSpecification | null): StyleSpecification {
  const bg = { id: "pl-background", type: "background" as const, paint: { "background-color": backgroundColor(dark) } };
  if (kind === "satellite") {
    return {
      version: 8,
      sources: {
        satellite: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION },
      },
      layers: [bg, { id: "satellite", type: "raster", source: "satellite" }],
    };
  }
  if (vector) return JSON.parse(JSON.stringify(vector)) as StyleSpecification;
  return { version: 8, sources: {}, layers: [bg] };
}

/* ── Geometry helpers ───────────────────────────────────────────────────── */
export function eachPosition(g: Geometry, fn: (p: Position) => void) {
  if (g.type === "Point") fn(g.coordinates);
  else if (g.type === "Polygon") g.coordinates.forEach((r) => r.forEach(fn));
  else g.coordinates.forEach((poly) => poly.forEach((r) => r.forEach(fn)));
}

export type Bounds = [[number, number], [number, number]];

export function boundsOf(geoms: Geometry[]): Bounds | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const g of geoms) {
    if (!g) continue;
    eachPosition(g, ([x, y]) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
  }
  if (!Number.isFinite(minX)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

export function centroidOf(g: Geometry): Position {
  let sx = 0,
    sy = 0,
    n = 0;
  const ring = g.type === "Point" ? [g.coordinates] : g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0]?.[0] ?? [];
  for (const [x, y] of ring) {
    sx += x;
    sy += y;
    n++;
  }
  return n ? [sx / n, sy / n] : [0, 0];
}

/** Point features at each plot's centre, so plots stay visible when zoomed out to country level. */
export function centroids(fc: PlotFeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: centroidOf(f.geometry) },
      properties: { ...f.properties },
    })),
  };
}

export const EMPTY_FC: PlotFeatureCollection = { type: "FeatureCollection", features: [] };
