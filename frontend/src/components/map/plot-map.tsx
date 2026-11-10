"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap, MapGeoJSONFeature, Popup as MLPopup } from "maplibre-gl";
import { Layers, MapIcon, Satellite } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Segmented } from "@/components/ui/display";
import { VERDICT_MAP_COLOR, VERDICT_META } from "@/components/domain/status";
import type { PlotFeatureCollection, Verdict } from "@/lib/api/types";
import { ha } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EMPTY_FC, baseStyle, boundsOf, centroids, fetchVectorStyle, loadMaplibre, type Basemap } from "./base";

const verdictColor = [
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

const LAYERS = ["plots-fill", "plots-dot"];

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
}

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
  ariaLabel = "Map of plots coloured by verdict",
  hoverCard = true,
}: PlotMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dataRef = useRef<PlotFeatureCollection>(data ?? EMPTY_FC);
  const selectedRef = useRef<string | null>(selectedId ?? null);
  const onSelectRef = useRef(onSelect);
  const fittedKey = useRef<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>(initialBasemap);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const want = useRef({ basemap, dark });
  want.current = { basemap, dark };
  const applied = useRef<string>("");

  onSelectRef.current = onSelect;

  /** Bring the base style in line with the wanted basemap + theme. Overlays are re-added on style.load. */
  async function syncStyle() {
    const map = mapRef.current;
    if (!map) return;
    const { basemap: b, dark: d } = want.current;
    const vector = b === "map" ? await fetchVectorStyle() : null;
    if (!mapRef.current) return;
    if (want.current.basemap !== b || want.current.dark !== d) return; // superseded by a newer choice
    const key = `${b}|${d}|${vector ? "v" : "-"}`;
    setNotice(b === "map" && !vector ? "Background map unavailable right now. Plots are still shown." : null);
    if (applied.current === key) return;
    applied.current = key;
    map.setStyle(baseStyle(b, d, vector), { diff: false });
  }

  /* Create the map once. */
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
          cooperativeGestures: false,
          scrollZoom: !compact,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
      } catch {
        setFailed(true);
        return;
      }
      mapRef.current = map;
      applied.current = `${want.current.basemap}|${want.current.dark}|-`;
      map.touchZoomRotate.disableRotation();
      // Keep the canvas matched to its box when the layout settles or changes.
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

      map.on("style.load", () => addOverlays(map));
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });

      popup = hoverCard ? new lib.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "pl-popup" }) : null;

      for (const layer of LAYERS) {
        map.on("mouseenter", layer, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          popup?.remove();
        });
        map.on("mousemove", layer, (e) => {
          const f = e.features?.[0] as MapGeoJSONFeature | undefined;
          if (!f || !popup) return;
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
      }
      map.on("click", (e) => {
        const hits = map.getStyle()?.layers?.some((l) => l.id === "plots-fill")
          ? map.queryRenderedFeatures(e.point, { layers: LAYERS })
          : [];
        const id = hits[0]?.properties?.id as string | undefined;
        onSelectRef.current?.(id ?? null);
      });

      // Upgrade to the street basemap when it can be reached; otherwise keep the plain background.
      if (!cancelled) void syncStyle();
    })();
    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      popup?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Created once; later changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Basemap or theme switch. */
  useEffect(() => {
    void syncStyle();
    // syncStyle reads the latest wanted state from a ref.
     
  }, [basemap, dark]);

  /* Data updates. */
  useEffect(() => {
    dataRef.current = data ?? EMPTY_FC;
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("plots") as GeoJSONSource | undefined)?.setData(dataRef.current as unknown as GeoJSON.FeatureCollection);
    (map.getSource("plot-points") as GeoJSONSource | undefined)?.setData(centroids(dataRef.current));
    if (data && fittedKey.current !== fitKey && data.features.length) {
      fittedKey.current = fitKey;
      const b = boundsOf(data.features.map((f) => f.geometry));
      // Keep plots clear of the background toggle (top left), zoom buttons (top right) and attribution (bottom).
      if (b)
        map.fitBounds(b, {
          padding: compact ? { top: 64, bottom: 48, left: 40, right: 56 } : { top: 72, bottom: 56, left: 56, right: 72 },
          maxZoom: maxFitZoom,
          duration: 0,
        });
    }
  }, [data, ready, fitKey, compact, maxFitZoom]);

  /* Selection highlight. */
  useEffect(() => {
    selectedRef.current = selectedId ?? null;
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("plots-selected")) return;
    map.setFilter("plots-selected", ["==", ["get", "id"], selectedRef.current ?? "__none__"]);
    if (selectedId) {
      const f = dataRef.current.features.find((x) => x.properties.id === selectedId);
      if (f) {
        const b = boundsOf([f.geometry]);
        if (b) map.fitBounds(b, { padding: 80, maxZoom: Math.max(maxFitZoom, 15), duration: 400 });
      }
    }
  }, [selectedId, ready, maxFitZoom]);

  function addOverlays(map: MLMap) {
    if (map.getSource("plots")) return;
    const sat = map.getStyle()?.sources?.satellite !== undefined;
    const dark = want.current.dark;
    map.addSource("plots", { type: "geojson", data: dataRef.current as unknown as GeoJSON.FeatureCollection });
    map.addSource("plot-points", { type: "geojson", data: centroids(dataRef.current) });
    map.addLayer({
      id: "plots-fill",
      type: "fill",
      source: "plots",
      minzoom: 8,
      paint: { "fill-color": verdictColor, "fill-opacity": sat ? 0.32 : 0.38 },
    });
    map.addLayer({
      id: "plots-line",
      type: "line",
      source: "plots",
      minzoom: 8,
      paint: { "line-color": verdictColor, "line-width": sat ? 2 : 1.6 },
    });
    map.addLayer({
      id: "plots-selected",
      type: "line",
      source: "plots",
      filter: ["==", ["get", "id"], selectedRef.current ?? "__none__"],
      paint: { "line-color": sat ? "#ffffff" : dark ? "#ece8df" : "#1f1d1a", "line-width": 3 },
    });
    map.addLayer({
      id: "plots-dot",
      type: "circle",
      source: "plot-points",
      maxzoom: 13,
      paint: {
        "circle-color": verdictColor,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 8, 6, 12, 7],
        "circle-stroke-color": sat ? "#ffffff" : dark ? "#1b1a17" : "#fdfcf9",
        "circle-stroke-width": 1.5,
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11, 1, 13, 0],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 11, 1, 13, 0],
      },
    });
  }

  return (
    <div className={cn("relative isolate min-h-0 overflow-hidden bg-surface-2", className)}>
      <div className="absolute inset-0">
        {/* MapLibre forces position: relative on its container, so size it from an absolutely positioned wrapper. */}
        <div ref={el} className="h-full w-full" />
      </div>
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
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
              { value: "map", label: (<><MapIcon aria-hidden /> Map</>) },
              { value: "satellite", label: (<><Satellite aria-hidden /> Satellite</>) },
            ]}
          />
        </div>
      ) : null}
      {notice ? (
        <div className="absolute bottom-8 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-md border border-border bg-surface/95 px-2.5 py-1.5 text-xs text-muted">
          <Layers className="size-3.5 shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      ) : null}
    </div>
  );
}
