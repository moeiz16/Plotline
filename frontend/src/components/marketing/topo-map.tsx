import { cn } from "@/lib/utils";
import type { Contour } from "./topo";

/**
 * A topographic sheet: contour rings (index contours heavier), an optional river and an
 * optional set of index contours that draw themselves on load (CSS `draw-in`, so it costs no JS
 * and is switched off by the reduced-motion rule in globals.css).
 */
export function TopoMap({
  contours,
  view,
  river,
  drawIndex = false,
  className,
  children,
  preserve = "xMidYMid slice",
}: {
  contours: Contour[];
  view: { w: number; h: number };
  river?: string;
  drawIndex?: boolean;
  className?: string;
  children?: React.ReactNode;
  preserve?: string;
}) {
  return (
    <svg viewBox={`0 0 ${view.w} ${view.h}`} preserveAspectRatio={preserve} className={cn("block", className)} aria-hidden fill="none">
      <g stroke="currentColor" strokeLinejoin="round">
        {contours.map((c, i) =>
          c.index ? (
            <path
              key={i}
              d={c.d}
              strokeWidth={1.1}
              strokeOpacity={0.3}
              pathLength={drawIndex ? 1 : undefined}
              className={drawIndex ? "draw-in" : undefined}
              style={drawIndex ? { animationDelay: `${120 + (i % 9) * 90}ms`, animationDuration: "1800ms" } : undefined}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <path key={i} d={c.d} strokeWidth={0.7} strokeOpacity={0.16} vectorEffect="non-scaling-stroke" />
          ),
        )}
      </g>
      {river ? (
        <g stroke="var(--pending)" strokeLinecap="round" fill="none">
          <path d={river} strokeWidth={5} strokeOpacity={0.14} vectorEffect="non-scaling-stroke" />
          <path d={river} strokeWidth={1.3} strokeOpacity={0.55} vectorEffect="non-scaling-stroke" />
        </g>
      ) : null}
      {children}
    </svg>
  );
}
