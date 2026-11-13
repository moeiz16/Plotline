"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { Layers, LocateFixed, MapIcon, Satellite } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/display";
import { VERDICT_MAP_COLOR } from "@/components/domain/status";
import type { PlotListItem, Position } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { baseStyle, fetchVectorStyle, loadMaplibre, type Basemap } from "./base";

export type DrawMode = "point" | "polygon";

/** Rough country centres for opening the map near the supplier. */
const COUNTRY_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  CI: { center: [-5.5, 7.6], zoom: 6 },
  GH: { center: [-1.0, 7.9], zoom: 6 },
  BR: { center: [-51.9, -12.5], zoom: 4 },
  ID: { center: [113.9, -0.8], zoom: 4 },
  PE: { center: [-75.0, -9.2], zoom: 5 },
  CO: { center: [-74.3, 4.6], zoom: 5 },
  EC: { center: [-78.2, -1.8], zoom: 6 },
  CM: { center: [12.4, 5.7], zoom: 5.5 },
  NG: { center: [8.7, 9.1], zoom: 5 },
  VN: { center: [106.3, 14.1], zoom: 5 },
  MY: { center: [109.7, 3.9], zoom: 5 },
  ET: { center: [39.6, 9.1], zoom: 5 },
  UG: { center: [32.3, 1.4], zoom: 6 },
  HN: { center: [-86.2, 14.8], zoom: 6.5 },
  PY: { center: [-58.4, -23.4], zoom: 5.5 },
  AR: { center: [-63.6, -38.4], zoom: 3.5 },
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function DrawMap({
  mode,
  point,
  vertices,
  onPoint,
  onVertices,
  country,
  existing = [],
  className,
}: {
  mode: DrawMode;
  point: Position | null;
  vertices: Position[];
  onPoint: (p: Position) => void;
  onVertices: (v: Position[]) => void;
  country?: string;
  existing?: PlotListItem[];
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const want = useRef({ basemap, dark });
  want.current = { basemap, dark };
  const applied = useRef("");
  const state = useRef({ mode, point, vertices, existing });
  state.current = { mode, point, vertices, existing };
  const handlers = useRef({ onPoint, onVertices });
  handlers.current = { onPoint, onVertices };

  async function syncStyle() {
    const map = mapRef.current;
    if (!map) return;
    const { basemap: b, dark: d } = want.current;
    const vector = b === "map" ? await fetchVectorStyle() : null;
    if (!mapRef.current || want.current.basemap !== b || want.current.dark !== d) return;
    setNotice(b === "map" && !vector ? "Background map unavailable right now. You can still place your plot." : null);
    const key = `${b}|${d}|${vector ? "v" : "-"}`;
    if (applied.current === key) return;
    applied.current = key;
    map.setStyle(baseStyle(b, d, vector), { diff: false });
  }

  function draftData(): GeoJSON.FeatureCollection {
    const { mode: m, point: p, vertices: v } = state.current;
    const features: GeoJSON.Feature[] = [];
    if (m === "point" && p) features.push({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: { role: "point" } });
    if (m === "polygon" && v.length) {
      if (v.length >= 3) features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[...v, v[0]]] }, properties: { role: "area" } });
      if (v.length >= 2) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: v.length >= 3 ? [...v, v[0]] : v }, properties: { role: "edge" } });
      v.forEach((c, i) => features.push({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: { role: i === 0 ? "first" : "vertex" } }));
    }
    return { type: "FeatureCollection", features };
  }

  function existingData(): GeoJSON.FeatureCollection {
    return {
      type: "FeatureCollection",
      features: state.current.existing
        .filter((p) => Array.isArray(p.centroid))
        .map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: p.centroid }, properties: { verdict: p.verdict, reference: p.reference } })),
    };
  }

  function addOverlays(map: MLMap) {
    if (map.getSource("draft")) return;
    const sat = map.getStyle()?.sources?.satellite !== undefined;
    const ink = sat ? "#ffffff" : want.current.dark ? "#ece8df" : "#1f5c4d";
    map.addSource("existing", { type: "geojson", data: existingData() });
    map.addSource("draft", { type: "geojson", data: draftData() });
    map.addLayer({
      id: "existing-dot",
      type: "circle",
      source: "existing",
      paint: {
        "circle-radius": 6,
        "circle-color": ["match", ["get", "verdict"], "compliant", VERDICT_MAP_COLOR.compliant, "needs_review", VERDICT_MAP_COLOR.needs_review, "non_compliant", VERDICT_MAP_COLOR.non_compliant, VERDICT_MAP_COLOR.pending],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["get", "role"], "area"], paint: { "fill-color": "#6fc0af", "fill-opacity": 0.28 } });
    map.addLayer({ id: "draft-edge", type: "line", source: "draft", filter: ["==", ["get", "role"], "edge"], paint: { "line-color": ink, "line-width": 2.5, "line-dasharray": [2, 1] } });
    map.addLayer({
      id: "draft-vertex",
      type: "circle",
      source: "draft",
      filter: ["in", ["get", "role"], ["literal", ["vertex", "first", "point"]]],
      paint: {
        "circle-radius": ["match", ["get", "role"], "point", 9, "first", 7, 5],
        "circle-color": ["match", ["get", "role"], "point", "#1f5c4d", "first", "#e3a12f", "#ffffff"],
        "circle-stroke-color": ["match", ["get", "role"], "point", "#ffffff", "#1f5c4d"],
        "circle-stroke-width": 2.5,
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    (async () => {
      let lib: Awaited<ReturnType<typeof loadMaplibre>>;
      try {
        lib = await loadMaplibre();
      } catch {
        setFailed(true);
        return;
      }
      if (cancelled || !el.current) return;
      const view = (country && COUNTRY_VIEW[country.toUpperCase()]) || { center: [0, 8] as [number, number], zoom: 2 };
      const first = state.current.existing.find((p) => Array.isArray(p.centroid));
      let map: MLMap;
      try {
        map = new lib.Map({
          container: el.current,
          style: baseStyle(want.current.basemap, want.current.dark, null),
          center: first ? first.centroid : view.center,
          zoom: first ? 13 : view.zoom,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          doubleClickZoom: false,
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
      map.getCanvas().setAttribute("aria-label", "Map for placing your plot. Tap to add points.");
      map.getCanvas().style.cursor = "crosshair";
      map.on("error", (e) => {
        const src = (e as unknown as { sourceId?: string }).sourceId;
        if (src === "satellite" || (src && src !== "draft" && src !== "existing"))
          setNotice("Background imagery unavailable right now. You can still place your plot.");
      });
      map.on("style.load", () => addOverlays(map));
      map.on("load", () => {
        if (cancelled) return;
        // Narrow maps keep the credits folded behind the (i) button so they never cover the plots.
        if (el.current && el.current.clientWidth < 720)
          el.current.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
        setReady(true);
      });
      map.on("click", (e) => {
        const c: Position = [round6(e.lngLat.lng), round6(e.lngLat.lat)];
        if (state.current.mode === "point") handlers.current.onPoint(c);
        else handlers.current.onVertices([...state.current.vertices, c]);
      });
      void syncStyle();
    })();
    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void syncStyle();
     
  }, [basemap, dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("draft") as GeoJSONSource | undefined)?.setData(draftData());
     
  }, [mode, point, vertices, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("existing") as GeoJSONSource | undefined)?.setData(existingData());
     
  }, [existing, ready]);

  function locate() {
    if (!("geolocation" in navigator)) {
      toast.error("Your device can’t share its location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: Position = [round6(pos.coords.longitude), round6(pos.coords.latitude)];
        mapRef.current?.flyTo({ center: c, zoom: 16, duration: 600 });
        if (state.current.mode === "point") handlers.current.onPoint(c);
      },
      () => toast.error("We couldn’t get your location. Check location permission and try again."),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  return (
    <div className={cn("relative isolate min-h-0 overflow-hidden bg-surface-2", className)}>
      <div className="absolute inset-0">
        {/* MapLibre forces position: relative on its container, so size it from an absolutely positioned wrapper. */}
        <div ref={el} className="h-full w-full" />
      </div>
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
          The map can’t be shown on this device. You can upload a file with your plot instead.
        </div>
      ) : (
        <>
          <div className="absolute left-2 top-2 z-10">
            <Segmented<Basemap>
              label="Background"
              value={basemap}
              onChange={setBasemap}
              className="shadow-pop"
              options={[
                { value: "satellite", label: (<><Satellite aria-hidden /> Satellite</>) },
                { value: "map", label: (<><MapIcon aria-hidden /> Map</>) },
              ]}
            />
          </div>
          <Button size="sm" className="absolute bottom-8 right-2 z-10 shadow-pop" onClick={locate}>
            <LocateFixed /> My location
          </Button>
        </>
      )}
      {notice ? (
        <div className="absolute left-2 top-12 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md border border-border bg-surface/95 px-2.5 py-1.5 text-xs text-muted">
          <Layers className="size-3.5 shrink-0" aria-hidden />
          <span>{notice}</span>
        </div>
      ) : null}
    </div>
  );
}
