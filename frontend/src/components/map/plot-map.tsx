"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, MapGeoJSONFeature, Popup as MLPopup } from "maplibre-gl";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Segmented } from "@/components/ui/display";
import { MARKER_HEX, VERDICT_MAP_COLOR, VERDICT_META } from "@/components/domain/status";
import type { Geometry, PlotFeatureCollection, Verdict } from "@/lib/api/types";
import { ha } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EMPTY_FC, baseStyle, boundsOf, centroids, fetchVectorStyle, loadMaplibre, type Basemap } from "./base";
import { ensureGlyphs, verdictColor } from "./plot-style";
import { SurveyOverlay } from "./survey-overlay";

const HIT = ["plots-fill", "plots-dot"];

export interface PlotMapProps {
  data: PlotFeatureCollection | undefined;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Re-fit the view when this value changes (e.g. filters). Fits on first data by default. */
  fitKey?: string;
  initialBasemap?: Basemap;
  showBasemapToggle?: boolean;
  /** Compact maps don't capture scroll-wheel zoom, so the page keeps scrolling. */
  compact?: boolean;
  maxFitZoom?: number;
  className?: string;
  ariaLabel?: string;
  hoverCard?: boolean;
  /** Survey the selected plot's boundary (draws itself vertex by vertex, pegs at the corners). */
  survey?: boolean;
}

/**
 * A framed sheet map of a set of plots (supplier mini atlas, manifest "where it was grown",
 * statement geolocation, plot record). Same vocabulary as the Atlas: glyph dots when zoomed out,
 * outlines when zoomed in, hatched non-compliant, dashed pending, the selected plot in marker orange.
 */
export function PlotMap({
  data,
  selectedId,
  onSelect,
  fitKey = "",
  initialBasemap = "map",
  showBasemapToggle = true,
  compact = false,
  maxFitZoom = 14,
  className,
  ariaLabel = "Map of plots by verdict",
  hoverCard = true,
  survey = false,
}: PlotMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [mapObj, setMapObj] = useState<MLMap | null>(null);
  const dataRef = useRef<PlotFeatureCollection>(data ?? EMPTY_FC);
  const selectedRef = useRef<string | null>(selectedId ?? null);
  const onSelectRef = useRef(onSelect);
  const fittedKey = useRef<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>(initialBasemap);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [surveyKey, setSurveyKey] = useState<string | null>(null);
  const surveyedFor = useRef<string | null>(null);
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const want = useRef({ basemap, dark });
  want.current = { basemap, dark };
  const applied = useRef<string>("");

  onSelectRef.current = onSelect;

  async function syncStyle() {
    const map = mapRef.current;
    if (!map) return;
    const { basemap: b, dark: d } = want.current;
    const vector = b === "map" ? await fetchVectorStyle() : null;
    if (!mapRef.current) return;
    if (want.current.basemap !== b || want.current.dark !== d) return;
    const key = `${b}|${d}|${vector ? "v" : "-"}`;
    setNotice(b === "map" && !vector ? "Background map unavailable right now. Plots are still shown." : null);
    if (applied.current === key) return;
    applied.current = key;
    map.setStyle(baseStyle(b, d, vector), { diff: false });
  }

  useEffect(() => {
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    let popup: MLPopup | null = null;
    (async () => {
      let lib: Awaited<ReturnType<typeof loadMaplibre>>;
      try {
        lib = await loadMaplibre();
      } catch {
        setFailed(true);
        return;
      }
      if (cancelled || !el.current) return;
      let map: MLMap;
      try {
        map = new lib.Map({
          container: el.current,
          style: baseStyle(want.current.basemap, want.current.dark, null),
          center: [0, 8],
          zoom: 1.6,
          attributionControl: { compact: true },
          scrollZoom: !compact,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          fadeDuration: 0,
        });
      } catch {
        setFailed(true);
        return;
      }
      mapRef.current = map;
      setMapObj(map);
      applied.current = `${want.current.basemap}|${want.current.dark}|-`;
      map.touchZoomRotate.disableRotation();
      if (typeof ResizeObserver !== "undefined" && el.current) {
        resizeObs = new ResizeObserver(() => mapRef.current?.resize());
        resizeObs.observe(el.current);
      }
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      map.getCanvas().setAttribute("aria-label", ariaLabel);
      map.on("error", (e) => {
        const src = (e as unknown as { sourceId?: string }).sourceId;
        if (src && src !== "plots" && src !== "plot-points") setNotice("Background map unavailable right now. Plots are still shown.");
      });
      map.on("style.load", () => {
        addOverlays(map);
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });

      popup = hoverCard ? new lib.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "pl-popup" }) : null;
      map.on("mousemove", (e) => {
        const f = map.getLayer("plots-fill") ? (map.queryRenderedFeatures(e.point, { layers: HIT })[0] as MapGeoJSONFeature | undefined) : undefined;
        map.getCanvas().style.cursor = f && onSelectRef.current ? "pointer" : "";
        if (!popup) return;
        if (!f) return void popup.remove();
        const p = f.properties as { reference: string; verdict: Verdict; supplierName: string; areaHa: number };
        const node = document.createElement("div");
        const title = document.createElement("div");
        title.className = "pl-popup-title";
        title.textContent = p.reference;
        const sub = document.createElement("div");
        sub.className = "pl-popup-sub";
        sub.textContent = `${VERDICT_META[p.verdict]?.label ?? "Pending"} · ${ha(Number(p.areaHa))}`;
        const sup = document.createElement("div");
        sup.className = "pl-popup-sub";
        sup.textContent = p.supplierName;
        node.append(title, sub, sup);
        popup.setLngLat(e.lngLat).setDOMContent(node).addTo(map);
      });
      map.on("mouseout", () => popup?.remove());
      map.on("click", (e) => {
        const hits = map.getLayer("plots-fill") ? map.queryRenderedFeatures(e.point, { layers: HIT }) : [];
        onSelectRef.current?.((hits[0]?.properties?.id as string | undefined) ?? null);
      });
      if (!cancelled) void syncStyle();
    })();
    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      popup?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void syncStyle();
     
  }, [basemap, dark]);

  /* Data updates and first fit. */
  useEffect(() => {
    dataRef.current = data ?? EMPTY_FC;
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("plots") as GeoJSONSource | undefined)?.setData(dataRef.current as unknown as GeoJSON.FeatureCollection);
    (map.getSource("plot-points") as GeoJSONSource | undefined)?.setData(centroids(dataRef.current));
    if (data && fittedKey.current !== fitKey && data.features.length) {
      fittedKey.current = fitKey;
      const b = boundsOf(data.features.map((f) => f.geometry));
      if (b) {
        map.fitBounds(b, {
          padding: compact ? { top: 56, bottom: 44, left: 40, right: 56 } : { top: 72, bottom: 56, left: 56, right: 72 },
          maxZoom: maxFitZoom,
          duration: 0,
        });
        if (survey && selectedRef.current) setSurveyKey(`${selectedRef.current}-${Date.now()}`);
      }
    }
  }, [data, ready, fitKey, compact, maxFitZoom, survey]);

  /* Selection: highlight, frame it, then survey the boundary. */
  useEffect(() => {
    selectedRef.current = selectedId ?? null;
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("plots-selected")) return;
    map.setFilter("plots-selected", ["==", ["get", "id"], selectedRef.current ?? "__none__"]);
    if (!selectedId) return setSurveyKey(null);
    const f = dataRef.current.features.find((x) => x.properties.id === selectedId);
    const b = f ? boundsOf([f.geometry]) : null;
    if (!b) return;
    if (fittedKey.current === null || surveyedFor.current === null) {
      surveyedFor.current = selectedId; // the first fit frames and surveys it
      return;
    }
    if (surveyedFor.current === selectedId) return;
    surveyedFor.current = selectedId;
    map.fitBounds(b, { padding: 80, maxZoom: Math.max(maxFitZoom, 15), duration: reduce ? 0 : 900 });
    if (survey) {
      const land = () => setSurveyKey(`${selectedId}-${Date.now()}`);
      if (reduce) land();
      else map.once("moveend", land);
    }
  }, [selectedId, ready, maxFitZoom, survey, reduce]);

  function addOverlays(map: MLMap) {
    if (map.getSource("plots")) return;
    const sat = map.getStyle()?.sources?.satellite !== undefined;
    ensureGlyphs(map, want.current.dark);
    map.addSource("plots", { type: "geojson", data: dataRef.current as unknown as GeoJSON.FeatureCollection });
    map.addSource("plot-points", { type: "geojson", data: centroids(dataRef.current) });
    const z = 9;
    map.addLayer({
      id: "plots-fill",
      type: "fill",
      source: "plots",
      minzoom: z,
      paint: { "fill-color": verdictColor, "fill-opacity": ["match", ["get", "verdict"], "compliant", sat ? 0.3 : 0.26, "needs_review", sat ? 0.22 : 0.14, 0] as unknown as number },
    });
    map.addLayer({ id: "plots-loss", type: "fill", source: "plots", minzoom: z, filter: ["==", ["get", "verdict"], "non_compliant"], paint: { "fill-pattern": "pl-hatch", "fill-opacity": 0.95 } });
    const width = ["interpolate", ["linear"], ["zoom"], z, sat ? 1.6 : 1.2, 15, sat ? 2.6 : 2.2] as unknown as number;
    map.addLayer({ id: "plots-line", type: "line", source: "plots", minzoom: z, filter: ["!=", ["get", "verdict"], "pending"], paint: { "line-color": verdictColor, "line-width": width } });
    map.addLayer({
      id: "plots-line-pending",
      type: "line",
      source: "plots",
      minzoom: z,
      filter: ["==", ["get", "verdict"], "pending"],
      paint: { "line-color": VERDICT_MAP_COLOR.pending, "line-width": width, "line-dasharray": [2, 1.5] },
    });
    map.addLayer({
      id: "plots-selected",
      type: "line",
      source: "plots",
      filter: ["==", ["get", "id"], selectedRef.current ?? "__none__"],
      paint: { "line-color": MARKER_HEX, "line-width": 2.5, "line-opacity": survey ? 0 : 1 },
    });
    map.addLayer({
      id: "plots-dot",
      type: "symbol",
      source: "plot-points",
      maxzoom: 12,
      layout: {
        "icon-image": ["concat", "pl-glyph-", ["get", "verdict"]] as unknown as string,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.85, 8, 1.1] as unknown as number,
        "symbol-sort-key": ["match", ["get", "verdict"], "non_compliant", 4, "needs_review", 3, "pending", 2, 1] as unknown as number,
      },
      paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 1, 11.5, 0] as unknown as number },
    });
  }

  const sel = survey && selectedId ? dataRef.current.features.find((f) => f.properties.id === selectedId) : undefined;

  return (
    <div className={cn("relative isolate min-h-0 overflow-hidden bg-sheet-2", className)}>
      <div className="absolute inset-0">
        {/* MapLibre forces position: relative on its container, so size it from an absolutely positioned wrapper. */}
        <div ref={el} className="h-full w-full" />
      </div>
      {sel && surveyKey ? <SurveyOverlay map={mapObj} geometry={sel.geometry as Geometry} drawKey={surveyKey} pegs={sel.properties.kind !== "point"} delay={0.15} /> : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[14px] italic text-ink-muted">
          The map can’t be shown in this browser. The plot list still has every detail.
        </div>
      ) : null}
      {showBasemapToggle && !failed ? (
        <div className="absolute left-3 top-3 z-10">
          <Segmented<Basemap>
            label="Background"
            value={basemap}
            onChange={setBasemap}
            className="shadow-pop"
            options={[
              { value: "map", label: "Map" },
              { value: "satellite", label: "Satellite" },
            ]}
          />
        </div>
      ) : null}
      {notice ? (
        <p className="panel-float absolute bottom-8 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-sm px-2.5 py-1.5 text-[13px] italic text-ink-muted">{notice}</p>
      ) : null}
    </div>
  );
}
