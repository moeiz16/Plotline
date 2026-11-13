"use client";

import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { niceScale } from "./plot-style";

function fmt(v: number, pos: string, neg: string) {
  return `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;
}

/**
 * The map sheet's status line: centre coordinates, zoom and a scale bar. Subscribes to the map
 * itself (throttled to one update per frame) so the camera never re-renders the page around it.
 */
export function StatusLine({ map, className, style }: { map: MLMap | null; className?: string; style?: CSSProperties }) {
  const [v, setV] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  useEffect(() => {
    if (!map) return;
    let raf = 0;
    const read = () => {
      const c = map.getCenter();
      setV({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    };
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        read();
      });
    };
    read();
    map.on("move", onMove);
    map.on("moveend", read);
    return () => {
      cancelAnimationFrame(raf);
      map.off("move", onMove);
      map.off("moveend", read);
    };
  }, [map]);
  if (!v) return null;
  const scale = niceScale(v.lat, v.zoom, 90);
  return (
    <div aria-hidden className={cn("pointer-events-none flex items-end gap-4", className)} style={style}>
      <span className="numerals bg-panel px-1.5 py-0.5 text-[11px] text-ink-muted backdrop-blur-sm">
        {fmt(v.lat, "N", "S")} · {fmt(v.lng, "E", "W")} · Z {v.zoom.toFixed(1)}
      </span>
      <span className="flex-1" />
      <span className="flex flex-col items-end bg-panel px-1.5 py-0.5 backdrop-blur-sm">
        <span className="numerals text-[10.5px] text-ink-muted">{scale.label}</span>
        <span className="mt-0.5 h-1.5 border-x border-b border-ink/70" style={{ width: scale.px }} />
      </span>
    </div>
  );
}
