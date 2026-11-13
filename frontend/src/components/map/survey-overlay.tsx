"use client";

import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { SurveyOutline } from "@/components/motion";
import { MARKER_HEX } from "@/components/domain/status";
import type { Geometry, Position } from "@/lib/api/types";

/** The outer ring of a plot, without the closing vertex. */
function outerRing(g: Geometry): Position[] {
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : null;
  if (!ring?.length) return [];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1];
  return closed ? ring.slice(0, -1) : ring;
}

/**
 * A plot boundary drawn vertex by vertex over a MapLibre map (SVG, projected on every frame),
 * with survey pegs dropping at the corners. Re-draws whenever `drawKey` changes;
 * panning and zooming only move it. Pegs are left off for circular point footprints.
 */
export function SurveyOverlay({
  map,
  geometry,
  drawKey,
  pegs = true,
  color = MARKER_HEX,
  delay = 0,
}: {
  map: MLMap | null;
  geometry: Geometry | null | undefined;
  drawKey: string;
  pegs?: boolean;
  color?: string;
  delay?: number;
}) {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!map) return;
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setFrame((n) => n + 1));
    };
    map.on("move", onMove);
    map.on("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      map.off("move", onMove);
      map.off("resize", onMove);
    };
  }, [map]);

  if (!map || !geometry) return null;
  const ring = outerRing(geometry);
  if (ring.length < 3) return null;
  const pts = ring.map((p) => {
    const xy = map.project(p as [number, number]);
    return [Math.round(xy.x * 10) / 10, Math.round(xy.y * 10) / 10] as [number, number];
  });
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-[1] size-full overflow-visible">
      <SurveyOutline key={drawKey} points={pts} stroke={color} strokeWidth={2.5} pegs={pegs && ring.length <= 16} delay={delay} />
    </svg>
  );
}
