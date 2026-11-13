"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, MapMouseEvent } from "maplibre-gl";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { VERDICT_MAP_COLOR, VERDICT_META, VerdictDot } from "@/components/domain/status";
import type { Geometry, Verdict } from "@/lib/api/types";
import { ha } from "@/lib/format";
import { cn } from "@/lib/utils";
import { baseStyle, boundsOf, fetchVectorStyle, loadMaplibre, type Basemap, type Bounds } from "./base";
import {
  FOREST_HEX,
  NO_LOSS,
  ensureGlyphs,
  glyphFor,
  lineColorFor,
  lossOpacity,
  points,
  rings,
  tween,
  verdictColor,
  type AtlasCollection,
  type AtlasProps,
} from "./plot-style";
import { SurveyOverlay } from "./survey-overlay";

export interface FrameCommand {
  key: string;
  bounds: Bounds | null;
  maxZoom?: number;
  instant?: boolean;
}

export interface MapView {
  lng: number;
  lat: number;
  zoom: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const OUTLINE_MIN_ZOOM = 9;
const VERDICTS: Verdict[] = ["compliant", "needs_review", "non_compliant", "pending"];
const HIT_LAYERS = ["plots-hit", "plots-dot"];
const EMPTY: AtlasCollection = { type: "FeatureCollection", features: [] };

/**
 * The Atlas canvas: every plot on a full-bleed map. Plots show as glyph dots below zoom 9 and as
 * outlines above it (outlines draw themselves the first time they come into view). The `year`
 * from the time ruler decides which plots show their post-cut-off loss (hatched) and which still
 * show as the 2020 forest. Selecting a plot flies to it and surveys its boundary in marker orange.
 */
export function AtlasMap({
  data,
  year,
  hidden,
  selectedId,
  onSelect,
  frame,
  padding,
  basemap,
  onView,
  onMap,
  className,
}: {
  data: AtlasCollection | undefined;
  year: number;
  hidden: Verdict[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  frame: FrameCommand | null;
  padding: Padding;
  basemap: Basemap;
  onView?: (v: MapView) => void;
  onMap?: (m: MLMap | null) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MLMap | null>(null);
  const [styled, setStyled] = useState(0); // bumps on every style load
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; p: AtlasProps } | null>(null);
  const [surveyKey, setSurveyKey] = useState<string | null>(null);
  const reduce = !!useReducedMotion();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  // Latest values for map callbacks.
  const live = useRef({ data: data ?? EMPTY, year, hidden, selectedId, onSelect, onView, padding, reduce, dark, basemap });
  live.current = { data: data ?? EMPTY, year, hidden, selectedId, onSelect, onView, padding, reduce, dark, basemap };
  const yearShown = useRef(year);
  const drawn = useRef(false);
  const applied = useRef("");

  /* ── Create once ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let m: MLMap | null = null;
    let ro: ResizeObserver | null = null;
    (async () => {
      let lib: Awaited<ReturnType<typeof loadMaplibre>>;
      try {
        lib = await loadMaplibre();
      } catch {
        setFailed(true);
        return;
      }
      if (cancelled || !el.current) return;
      try {
        m = new lib.Map({
          container: el.current,
          style: baseStyle(live.current.basemap, live.current.dark, null),
          center: [10, 5],
          zoom: 2.4,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          fadeDuration: 0,
        });
      } catch {
        setFailed(true);
        return;
      }
      const mm = m;
      mm.touchZoomRotate.disableRotation();
      mm.keyboard.disable(); // arrow keys belong to the time ruler on this page
      applied.current = `${live.current.basemap}|${live.current.dark}|-`;
      mm.getCanvas().setAttribute("aria-label", "Atlas of every supplier plot. Use the plot ledger for a list.");
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => mm.resize());
        ro.observe(el.current);
      }
      mm.on("error", (e) => {
        const src = (e as unknown as { sourceId?: string }).sourceId;
        if (src && !src.startsWith("plot")) setNotice("Background map unavailable right now. Plots are still shown.");
      });
      mm.on("style.load", () => {
        addOverlays(mm);
        setStyled((n) => n + 1);
      });
      let raf = 0;
      const report = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const c = mm.getCenter();
          live.current.onView?.({ lng: c.lng, lat: c.lat, zoom: mm.getZoom() });
        });
      };
      mm.on("move", report);
      mm.on("zoomend", () => maybeDraw(mm));
      mm.on("mousemove", (e: MapMouseEvent) => {
        const f = layersReady(mm) ? mm.queryRenderedFeatures(e.point, { layers: HIT_LAYERS })[0] : undefined;
        mm.getCanvas().style.cursor = f ? "pointer" : "";
        setHover(f ? { x: e.point.x, y: e.point.y, p: f.properties as unknown as AtlasProps } : null);
      });
      mm.on("mouseout", () => setHover(null));
      mm.on("click", (e) => {
        const f = layersReady(mm) ? mm.queryRenderedFeatures(e.point, { layers: HIT_LAYERS })[0] : undefined;
        live.current.onSelect((f?.properties?.id as string | undefined) ?? null);
      });
      setMap(mm);
      onMap?.(mm);
      report();
      void syncStyle(mm);
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      onMap?.(null);
      m?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function layersReady(mm: MLMap) {
    return !!mm.getLayer("plots-hit") && !!mm.getLayer("plots-dot");
  }

  async function syncStyle(mm: MLMap) {
    const { basemap: b, dark: d } = live.current;
    const vector = b === "map" ? await fetchVectorStyle() : null;
    if (live.current.basemap !== b || live.current.dark !== d) return;
    setNotice(b === "map" && !vector ? "Background map unavailable right now. Plots are still shown." : null);
    const key = `${b}|${d}|${vector ? "v" : "-"}`;
    if (applied.current === key) return;
    applied.current = key;
    drawn.current = false;
    mm.setStyle(baseStyle(b, d, vector), { diff: false });
  }

  useEffect(() => {
    if (map) void syncStyle(map);
     
  }, [basemap, dark, map]);

  /* ── Layers ──────────────────────────────────────────────────────────── */
  function addOverlays(mm: MLMap) {
    if (mm.getSource("plots")) return;
    const { data: fc, dark: d } = live.current;
    const sat = live.current.basemap === "satellite";
    ensureGlyphs(mm, d);
    mm.addSource("plots", { type: "geojson", data: fc as unknown as GeoJSON.FeatureCollection });
    mm.addSource("plot-rings", { type: "geojson", data: rings(fc), lineMetrics: true });
    mm.addSource("plot-points", { type: "geojson", data: points(fc) });
    const z = OUTLINE_MIN_ZOOM;
    mm.addLayer({ id: "plots-hit", type: "fill", source: "plots", minzoom: z, paint: { "fill-color": "#000", "fill-opacity": 0 } });
    mm.addLayer({ id: "plots-forest", type: "fill", source: "plots", minzoom: z, paint: { "fill-color": FOREST_HEX, "fill-opacity": 0 } });
    mm.addLayer({ id: "plots-fill", type: "fill", source: "plots", minzoom: z, paint: { "fill-color": verdictColor, "fill-opacity": 0 } });
    mm.addLayer({ id: "plots-loss", type: "fill", source: "plots", minzoom: z, paint: { "fill-pattern": "pl-hatch", "fill-opacity": 0 } });
    const width = ["interpolate", ["linear"], ["zoom"], z, sat ? 1.6 : 1.2, 15, sat ? 2.6 : 2.2] as unknown as number;
    mm.addLayer({ id: "plots-line", type: "line", source: "plots", minzoom: z, paint: { "line-color": verdictColor, "line-width": width, "line-opacity": 0 } });
    mm.addLayer({
      id: "plots-line-pending",
      type: "line",
      source: "plots",
      minzoom: z,
      paint: { "line-color": VERDICT_MAP_COLOR.pending, "line-width": width, "line-dasharray": [2, 1.5], "line-opacity": 0 },
    });
    for (const v of VERDICTS)
      mm.addLayer({
        id: `plots-draw-${v}`,
        type: "line",
        source: "plot-rings",
        minzoom: z,
        filter: ["==", ["get", "verdict"], v],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-width": width, "line-gradient": drawGradient(v, 0), "line-opacity": 0 },
      });
    mm.addLayer({
      id: "plots-dot",
      type: "symbol",
      source: "plot-points",
      maxzoom: z + 0.5,
      layout: {
        "icon-image": glyphFor(live.current.year),
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.85, 8, 1.15] as unknown as number,
        "symbol-sort-key": ["match", ["get", "verdict"], "non_compliant", 4, "needs_review", 3, "pending", 2, 1] as unknown as number,
      },
      paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], z - 0.25, 1, z + 0.5, 0] as unknown as number },
    });
    mm.addLayer({
      id: "plots-dot-selected",
      type: "symbol",
      source: "plot-points",
      maxzoom: z + 0.5,
      filter: ["==", ["get", "id"], "__none__"],
      layout: { "icon-image": "pl-glyph-selected", "icon-allow-overlap": true, "icon-ignore-placement": true, "icon-size": 1.9 },
    });
    yearShown.current = live.current.year;
    applyYear(mm, yearShown.current, yearShown.current, 1);
    applyFilters(mm);
    applySelection(mm);
    // Outlines already in view draw themselves; otherwise they draw when the camera reaches them.
    maybeDraw(mm, true);
  }

  function drawGradient(v: Verdict, t: number) {
    return ["step", ["line-progress"], VERDICT_MAP_COLOR[v], Math.max(t, 0.0001), "rgba(0,0,0,0)"] as unknown as import("maplibre-gl").ExpressionSpecification;
  }

  /** Paint for the time ruler; `t` tweens the plots whose loss year sits between `from` and `to`. */
  function applyYear(mm: MLMap, from: number, to: number, t: number, k = drawn.current ? 1 : 0) {
    if (!mm.getLayer("plots-fill")) return;
    const loss = lossOpacity(from, to, t) as unknown as unknown[];
    const fillBase = ["match", ["get", "verdict"], "compliant", 0.26, "needs_review", 0.14, 0] as unknown[];
    mm.setPaintProperty("plots-loss", "fill-opacity", ["*", k * 0.95, loss]);
    mm.setPaintProperty("plots-forest", "fill-opacity", ["case", ["==", ["get", "lossYear"], NO_LOSS], 0, ["*", k * 0.24, ["-", 1, loss]]]);
    mm.setPaintProperty("plots-fill", "fill-opacity", ["*", k, ["case", ["==", ["get", "lossYear"], NO_LOSS], fillBase, ["*", fillBase, loss]]]);
    if (t >= 1 || t === 0) {
      mm.setPaintProperty("plots-line", "line-color", lineColorFor(to));
      mm.setLayoutProperty("plots-dot", "icon-image", glyphFor(to));
    }
  }

  function applyFilters(mm: MLMap) {
    if (!mm.getLayer("plots-fill")) return;
    const hide = live.current.hidden;
    const visible = ["!", ["in", ["get", "verdict"], ["literal", hide]]];
    const f = (extra?: unknown[]) => (extra ? ["all", visible, extra] : visible) as never;
    mm.setFilter("plots-hit", f());
    mm.setFilter("plots-fill", f());
    mm.setFilter("plots-forest", f(["!=", ["get", "lossYear"], NO_LOSS]));
    mm.setFilter("plots-loss", f(["!=", ["get", "lossYear"], NO_LOSS]));
    mm.setFilter("plots-line", f(["!=", ["get", "verdict"], "pending"]));
    mm.setFilter("plots-line-pending", f(["==", ["get", "verdict"], "pending"]));
    mm.setFilter("plots-dot", f());
    for (const v of VERDICTS) mm.setFilter(`plots-draw-${v}`, f(["==", ["get", "verdict"], v]));
  }

  function applySelection(mm: MLMap) {
    if (!mm.getLayer("plots-dot-selected")) return;
    mm.setFilter("plots-dot-selected", ["==", ["get", "id"], live.current.selectedId ?? "__none__"]);
  }

  /** The survey sweep: every outline in view draws itself once, then the fills ink in. */
  const stopDraw = useRef<() => void>(() => {});
  function maybeDraw(mm: MLMap, first = false) {
    if (drawn.current || !mm.getLayer("plots-line")) return;
    if (mm.getZoom() < OUTLINE_MIN_ZOOM) {
      if (first) {
        // Dots only for now; keep the outline layers ready but hidden.
        mm.setPaintProperty("plots-line", "line-opacity", 0);
        mm.setPaintProperty("plots-line-pending", "line-opacity", 0);
      }
      return;
    }
    drawn.current = true;
    stopDraw.current();
    const y = yearShown.current;
    for (const v of VERDICTS) mm.setPaintProperty(`plots-draw-${v}`, "line-opacity", 1);
    stopDraw.current = tween(
      1100,
      (t) => {
        if (!mm.getLayer("plots-line")) return;
        for (const v of VERDICTS) mm.setPaintProperty(`plots-draw-${v}`, "line-gradient", drawGradient(v, t));
        applyYear(mm, y, y, 1, Math.max(0, (t - 0.6) / 0.4));
        if (t >= 1) {
          mm.setPaintProperty("plots-line", "line-opacity", 1);
          mm.setPaintProperty("plots-line-pending", "line-opacity", 1);
          for (const v of VERDICTS) mm.setPaintProperty(`plots-draw-${v}`, "line-opacity", 0);
        }
      },
      live.current.reduce,
    );
  }

  /* ── Data ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!map || !styled || !map.getSource("plots")) return;
    const fc = data ?? EMPTY;
    (map.getSource("plots") as GeoJSONSource).setData(fc as unknown as GeoJSON.FeatureCollection);
    (map.getSource("plot-rings") as GeoJSONSource).setData(rings(fc));
    (map.getSource("plot-points") as GeoJSONSource).setData(points(fc));
  }, [data, map, styled]);

  /* ── Year (time ruler) ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!map || !styled) return;
    const from = yearShown.current;
    if (from === year) return;
    yearShown.current = year;
    applyYear(map, from, year, 0);
    return tween(300, (t) => applyYear(map, from, year, t), reduce);
     
  }, [year, map, styled, reduce]);

  useEffect(() => {
    if (map && styled) applyFilters(map);
     
  }, [hidden, map, styled]);

  /* ── Framing ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!map || !frame?.bounds) return;
    map.fitBounds(frame.bounds, {
      padding: live.current.padding,
      maxZoom: frame.maxZoom ?? 12,
      duration: frame.instant || reduce ? 0 : 1400,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.key, map]);

  /* ── Selection: fly, then survey the boundary ────────────────────────── */
  const selected = selectedId ? data?.features.find((f) => f.properties.id === selectedId) : undefined;
  const selectedGeom = selected?.geometry as Geometry | undefined;
  const geomRef = useRef(selectedGeom);
  geomRef.current = selectedGeom;
  const hasGeom = !!selectedGeom;
  useEffect(() => {
    const selectedGeom = geomRef.current;
    if (!map || !styled) return;
    applySelection(map);
    if (!selectedId || !selectedGeom) {
      setSurveyKey(null);
      return;
    }
    const b = boundsOf([selectedGeom]);
    if (!b) return;
    const pad = live.current.padding;
    const room = map.getContainer().clientHeight - pad.top - pad.bottom;
    const extra = room > 320 ? 70 : 16;
    const cam = map.cameraForBounds(b, { padding: { top: pad.top + extra, bottom: pad.bottom + extra, left: pad.left + extra, right: pad.right + extra }, maxZoom: 15.6 });
    if (!cam) return;
    setSurveyKey(null);
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      setSurveyKey(`${selectedId}-${Date.now()}`);
    };
    const target = { center: cam.center, zoom: Math.min(cam.zoom ?? 15, 15.6) };
    if (reduce) {
      map.jumpTo(target);
      land();
      return;
    }
    // Flight time grows with distance (1.1 s next door, 2.6 s across a region); MapLibre's own
    // `maxDuration` would turn a long flight into a jump, so the duration is set explicitly.
    const km = distanceKm(map.getCenter(), target.center as { lng: number; lat: number });
    const FLIGHT_MS = Math.round(Math.min(2600, 1100 + 70 * Math.sqrt(km)));
    map.flyTo({ ...target, curve: 1.4, duration: FLIGHT_MS, essential: true });
    // Survey only once the camera has come to rest (a stopped earlier move also emits moveend).
    let raf = 0;
    const settle = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!map.isMoving() && Math.abs(map.getZoom() - target.zoom) < 0.05) land();
      });
    };
    map.on("moveend", settle);
    const t = setTimeout(land, FLIGHT_MS + 900);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      map.off("moveend", settle);
    };
  }, [selectedId, hasGeom, map, styled, reduce]);

  return (
    <div className={cn("relative isolate min-h-0 overflow-hidden bg-paper", className)}>
      <div className="absolute inset-0">
        <div ref={el} className="h-full w-full" />
      </div>
      {surveyKey && selectedGeom ? (
        <SurveyOverlay map={map} geometry={selectedGeom} drawKey={surveyKey} pegs={selected?.properties.kind !== "point"} />
      ) : null}
      {hover ? <FieldTag x={hover.x} y={hover.y} p={hover.p} year={year} /> : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[15px] italic text-ink-muted">
          The map can’t be shown in this browser. The plot ledger has every detail.
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="panel-float absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-sm px-3 py-1.5 text-[13px] italic text-ink-muted">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function distanceKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Hover card for a plot: a small attribute record pinned next to the cursor. */
function FieldTag({ x, y, p, year }: { x: number; y: number; p: AtlasProps; year: number }) {
  const before = p.lossYear !== NO_LOSS && p.lossYear > year;
  return (
    <div
      className="pointer-events-none absolute z-20 w-max max-w-[240px] border border-ink/70 bg-sheet px-2.5 py-2 shadow-pop"
      style={{ left: x + 14, top: y + 14 }}
    >
      <p className="numerals text-[12.5px] font-medium text-ink">{p.reference}</p>
      <p className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
        <VerdictDot verdict={p.verdict} size={9} />
        {VERDICT_META[p.verdict]?.label ?? "Pending"} · {ha(Number(p.areaHa))}
      </p>
      <p className="mt-0.5 truncate text-[13px] text-ink-muted">{p.supplierName}</p>
      {before ? <p className="mt-1 text-[12.5px] italic text-ink-muted">Still forest in {year}. Cleared in {p.lossYear}.</p> : null}
    </div>
  );
}
