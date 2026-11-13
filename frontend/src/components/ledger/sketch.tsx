"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, type ReactNode } from "react";
import { SurveyOutline } from "@/components/motion";
import type { Geometry, Position, Verdict } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const STROKE: Record<Verdict, string> = {
  compliant: "var(--compliant)",
  needs_review: "var(--review)",
  non_compliant: "var(--noncompliant)",
  pending: "var(--pending)",
};

/** Outer rings of a geometry in lon/lat (points return no ring). */
function rings(g: Geometry): Position[][] {
  if (g.type === "Polygon") return [g.coordinates[0] ?? []];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0] ?? []);
  return [];
}

/**
 * Project lon/lat rings into a square SVG box (equirectangular with a cos(lat) correction),
 * keeping the plot's own proportions and leaving a margin for the corner pegs.
 */
function project(rs: Position[][], box: number, pad: number) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rs)
    for (const [x, y] of r) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const w = Math.max((maxX - minX) * k, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const s = (box - pad * 2) / Math.max(w, h);
  const ox = (box - w * s) / 2;
  const oy = (box - h * s) / 2;
  return rs.map((r) => {
    const pts = r.map(([x, y]) => [+(ox + (x - minX) * k * s).toFixed(2), +(oy + (maxY - y) * s).toFixed(2)] as [number, number]);
    // the SVG path closes itself; drop the repeated last vertex
    if (pts.length > 1) {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      if (a[0] === b[0] && a[1] === b[1]) pts.pop();
    }
    return pts;
  });
}

/**
 * A plot drawn at its own scale, the way a surveyor sketches it in the field book:
 * the boundary draws itself vertex to vertex, pegs drop at the corners, then the
 * verdict fill settles in (hatched when forest was cleared, dashed while pending).
 * Single-point plots are drawn as a stake with a ring.
 */
export function PlotSketch({
  geometry,
  verdict,
  size = 96,
  delay = 0,
  className,
  label,
  grid = true,
}: {
  geometry: Geometry | null | undefined;
  verdict: Verdict;
  size?: number;
  delay?: number;
  className?: string;
  label?: string;
  grid?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const box = 100;
  const stroke = STROKE[verdict] ?? STROKE.pending;
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  const fill =
    verdict === "non_compliant"
      ? `url(#h${id})`
      : verdict === "compliant"
        ? "color-mix(in srgb, var(--compliant) 16%, transparent)"
        : verdict === "needs_review"
          ? "color-mix(in srgb, var(--review) 14%, transparent)"
          : "none";

  let body: ReactNode = null;
  if (geometry?.type === "Point" || (geometry && !rings(geometry).some((r) => r.length >= 3))) {
    body = (
      <g>
        <motion.circle
          cx={50}
          cy={50}
          r={22}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          strokeDasharray={verdict === "pending" ? "4 3" : undefined}
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.52, delay, ease: [0.5, 0, 0.1, 1] }}
          style={{ transformOrigin: "50px 50px" }}
        />
        <path d="M50 30v40M30 50h40" stroke={stroke} strokeWidth={1} opacity={0.7} />
        <circle cx={50} cy={50} r={3} fill="var(--sheet)" stroke={stroke} strokeWidth={1.5} />
      </g>
    );
  } else if (geometry) {
    const polys = project(rings(geometry), box, 14);
    body = polys.map((pts, i) =>
      verdict === "pending" ? (
        <motion.path
          key={i}
          d={`M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} Z`}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.52, delay }}
        />
      ) : (
        <SurveyOutline key={i} points={pts} stroke={stroke} fill={fill} strokeWidth={1.5} pegs={pts.length <= 24} delay={delay + i * 0.2} duration={0.9} />
      ),
    );
  }

  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} className={cn("block shrink-0 overflow-visible", className)} {...a11y}>
      <defs>
        <pattern id={`h${id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.6" height="5" fill="var(--noncompliant)" opacity="0.8" />
        </pattern>
        <pattern id={`g${id}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="var(--rule)" strokeWidth="0.6" />
        </pattern>
      </defs>
      {grid ? <rect x="0" y="0" width={box} height={box} fill={`url(#g${id})`} /> : null}
      {body ?? <rect x="20" y="20" width="60" height="60" fill="none" stroke="var(--rule-strong)" strokeDasharray="3 3" />}
    </svg>
  );
}
