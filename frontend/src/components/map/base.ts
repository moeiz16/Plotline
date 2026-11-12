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
  return dark ? "#0b1014" : "#e6e0d2";
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
  if (vector) return earthTone(JSON.parse(JSON.stringify(vector)) as StyleSpecification, dark);
  return { version: 8, sources: {}, layers: [bg] };
}

/** Field Atlas basemap tints: "map paper" (light) and "night satellite" (dark). */
const EARTH = {
  light: {
    bg: "#e6e0d2",
    land: "#e9e3d6",
    green: "#dde1cc",
    water: "#c3cfcd",
    waterLine: "#adbdbb",
    building: "#ddd6c6",
    road: "#f4efe4",
    roadCasing: "#d2c9b6",
    rail: "#c9c0ad",
    boundary: "#8f8673",
    text: "#4a5560",
    waterText: "#4f6a70",
    halo: "#efe9dd",
  },
  dark: {
    bg: "#0b1014",
    land: "#0e1419",
    green: "#101a16",
    water: "#07141c",
    waterLine: "#10222c",
    building: "#151d24",
    road: "#1a242d",
    roadCasing: "#141c23",
    rail: "#202b35",
    boundary: "#3d4b58",
    text: "#8e979d",
    waterText: "#4f7280",
    halo: "#0b1014",
  },
};

const LATIN_NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

function earthTone(style: StyleSpecification, dark: boolean): StyleSpecification {
  const c = dark ? EARTH.dark : EARTH.light;
  style.layers = style.layers
    .filter((l) => !/shield/.test(l.id))
    .map((layer) => {
      const l = layer as unknown as { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> };
      const id = l.id;
      const paint = (l.paint ??= {});
      if (l.type === "background") paint["background-color"] = c.bg;
      else if (l.type === "fill") {
        if (/water/.test(id)) paint["fill-color"] = c.water;
        else if (/park|wood|grass|glacier|ice/.test(id)) paint["fill-color"] = c.green;
        else if (/building/.test(id)) {
          paint["fill-color"] = c.building;
          paint["fill-outline-color"] = c.roadCasing;
        } else if (/road|aeroway|pier/.test(id)) paint["fill-color"] = c.road;
        else paint["fill-color"] = c.land;
      } else if (l.type === "line") {
        if (/water/.test(id)) paint["line-color"] = c.waterLine;
        else if (/boundary/.test(id)) paint["line-color"] = c.boundary;
        else if (/rail/.test(id)) paint["line-color"] = c.rail;
        else if (/casing/.test(id)) paint["line-color"] = c.roadCasing;
        else if (/highway|road|tunnel|bridge|aeroway|pier/.test(id)) paint["line-color"] = c.road;
      } else if (l.type === "symbol" && l.layout?.["text-field"] !== undefined) {
        const water = /water/.test(id);
        paint["text-color"] = water ? c.waterText : c.text;
        paint["text-halo-color"] = c.halo;
        paint["text-halo-width"] = 1.2;
        if (/^label_|water_name|airport/.test(id)) l.layout["text-field"] = LATIN_NAME;
      }
      return layer;
    });
  return style;
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
