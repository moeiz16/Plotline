"use client";

import { motion, useReducedMotion } from "motion/react";
import { EASE_SURVEY } from "@/components/motion";
import { CUTOFF_YEAR, RULER_FIRST, RULER_LAST } from "@/components/map/plot-style";
import { Glyph } from "@/components/ui/display";
import { Tooltip } from "@/components/ui/overlays";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

const YEARS = Array.from({ length: RULER_LAST - RULER_FIRST + 1 }, (_, i) => RULER_FIRST + i);

/**
 * Forest lost per year, drawn on the same ruler as the Atlas time ruler (2018 – 2026, cut-off marked).
 * One series, so no legend: hatched crimson bars are loss after the cut-off. Bars rise from the
 * baseline one after another; years past `year` (the ruler position) are dimmed.
 */
export function LossChart({
  byYear,
  year = RULER_LAST,
  compact = false,
  className,
}: {
  byYear: Record<string, number>;
  year?: number;
  compact?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const data = YEARS.map((y) => ({ y, ha: y > CUTOFF_YEAR ? Number(byYear?.[String(y)] ?? 0) : 0 }));
  const total = data.reduce((s, d) => s + d.ha, 0);
  const max = Math.max(...data.map((d) => d.ha), 0.01);
  if (!total)
    return (
      <p className={cn("flex items-start gap-2.5 border-l-[3px] border-compliant bg-sheet px-3 py-2.5 text-[14px] italic text-ink-muted", className)}>
        <Glyph tone="compliant" className="mt-[5px]" />
        No forest loss recorded on this plot in any year from 2021 to {RULER_LAST}.
      </p>
    );
  const h = compact ? 56 : 132;
  const cutLeft = ((CUTOFF_YEAR - RULER_FIRST + 1) / YEARS.length) * 100;
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="relative" style={{ height: h + (compact ? 30 : 36) }} role="img" aria-label={`Forest lost per year after the cut-off: ${data.filter((d) => d.ha).map((d) => `${d.y} ${num(d.ha, 2)} hectares`).join(", ")}.`}>
        {/* before the cut-off: not counted */}
        <div aria-hidden className="absolute left-0 top-0 hatch-faint opacity-60" style={{ width: `${cutLeft}%`, height: h }} />
        <span aria-hidden className={cn("label-caps absolute left-1 top-0.5 text-ink-subtle", compact ? "hidden" : "")} style={{ fontSize: 9.5 }}>
          Before the cut-off
        </span>
        <div aria-hidden className="absolute inset-x-0 top-0 flex" style={{ height: h }}>
          {data.map((d, i) => {
            const bh = d.ha ? Math.max(3, (d.ha / max) * (h - (compact ? 14 : 20))) : 0;
            return (
              <div key={d.y} className={cn("flex flex-1 flex-col items-center justify-end transition-opacity duration-[var(--dur)]", d.y > year && "opacity-30")}>
                {d.ha ? (
                  <>
                    <span className="numerals mb-0.5 text-[10.5px] text-ink">{num(d.ha, d.ha < 10 ? 1 : 0)}</span>
                    <Tooltip content={`${d.y}: ${num(d.ha, 2)} ha of forest lost`}>
                      <motion.span
                        className="block w-[46%] max-w-9 border-t-2 border-noncompliant hatch-noncompliant"
                        style={{ height: bh, transformOrigin: "bottom" }}
                        initial={reduce ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.6, delay: 0.15 + i * 0.06, ease: EASE_SURVEY }}
                      />
                    </Tooltip>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* baseline + ticks + years */}
        <div aria-hidden className="absolute inset-x-0 border-t border-ink/70" style={{ top: h }}>
          {data.map((d, i) => (
            <span key={d.y} className="absolute top-0 h-1.5 w-px bg-ink/60" style={{ left: `${((i + 0.5) / YEARS.length) * 100}%` }} />
          ))}
        </div>
        <div aria-hidden className="absolute inset-x-0" style={{ top: h + 9 }}>
          {data.map((d, i) => (
            <span
              key={d.y}
              className={cn("numerals absolute -translate-x-1/2 text-[10.5px] leading-none", d.y === year ? "font-semibold text-ink" : "text-ink-subtle", compact && i % 2 === 1 && d.y !== year && "hidden")}
              style={{ left: `${((i + 0.5) / YEARS.length) * 100}%` }}
            >
              {compact ? `’${String(d.y).slice(2)}` : d.y}
            </span>
          ))}
        </div>
        {/* the cut-off */}
        <div aria-hidden className="absolute top-0 w-0.5 -translate-x-1/2 bg-marker" style={{ left: `${cutLeft}%`, height: h + 6 }} />
      </div>
      <table className="sr-only">
        <caption>Forest lost per year (hectares)</caption>
        <tbody>
          {data
            .filter((d) => d.y > CUTOFF_YEAR)
            .map((d) => (
              <tr key={d.y}>
                <th scope="row">{d.y}</th>
                <td>{num(d.ha, 2)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
