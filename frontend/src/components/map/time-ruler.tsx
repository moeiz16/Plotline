"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DrawPath } from "@/components/motion";
import { Tooltip } from "@/components/ui/overlays";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CUTOFF_YEAR, RULER_FIRST, RULER_LAST } from "./plot-style";

const YEARS = Array.from({ length: RULER_LAST - RULER_FIRST + 1 }, (_, i) => RULER_FIRST + i);
const N = YEARS.length;
/** Centre of a year's column, in % of the track. */
const at = (y: number) => ((y - RULER_FIRST + 0.5) / N) * 100;
/** The cut-off sits on the boundary between 2020 and 2021. */
const CUT = ((CUTOFF_YEAR - RULER_FIRST + 1) / N) * 100;
export const PLAY_STEP_MS = 700;

/**
 * The Atlas time ruler (DESIGN.md §1, signature interaction 1). A ruled track from 2018 to 2026
 * with the 31 Dec 2020 cut-off in marker orange and a histogram of hectares lost per year behind
 * the ticks. Drag, click, or use the arrow keys; ▶ sweeps one year per 700 ms and stops at 2026.
 */
export function TimeRuler({
  year,
  onYear,
  lossByYear,
  note,
  compact = false,
  className,
}: {
  year: number;
  onYear: (y: number) => void;
  lossByYear: Record<string, number>;
  note?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const yearRef = useRef(year);
  yearRef.current = year;
  const max = Math.max(0.01, ...YEARS.map((y) => Number(lossByYear[String(y)] ?? 0)));

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = yearRef.current + 1;
      if (next > RULER_LAST) {
        setPlaying(false);
        return;
      }
      onYear(next);
      if (next === RULER_LAST) setPlaying(false);
    }, PLAY_STEP_MS);
    return () => clearInterval(id);
  }, [playing, onYear]);

  const fromX = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.floor(((clientX - r.left) / r.width) * N);
    onYear(YEARS[Math.max(0, Math.min(N - 1, i))]);
  };

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (yearRef.current >= RULER_LAST) onYear(RULER_FIRST);
    setPlaying(true);
  };

  const after = year > CUTOFF_YEAR;
  const valueText = after ? `Showing forest loss up to ${year}` : `Showing the land as it stood in ${year}, before the cut-off`;

  return (
    <div className={cn("flex min-w-0 items-stretch gap-3 sm:gap-4", className)}>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause the survey sweep" : "Play the survey sweep from 2018 to 2026"}
          className="flex size-9 items-center justify-center rounded-sm border border-ink bg-ink text-paper outline-none transition-colors hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sheet [&_svg]:size-3.5"
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden className="translate-x-px" />}
        </button>
        {!compact ? (
          <div className="w-[150px] min-w-0" aria-live="polite">
            <p className="label-caps text-ink-muted">{after ? "Loss shown up to" : "Land as it stood"}</p>
            <p className="numerals text-[22px] leading-6 text-ink">{year}</p>
            {note ? <p className="truncate text-[12.5px] italic leading-4 text-ink-muted">{note}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="relative min-w-0 flex-1">
        {compact ? (
          <p className="label-caps mb-0.5 flex items-center justify-between gap-2 text-ink-muted" aria-live="polite">
            <span>
              {after ? `Loss up to ${year}` : `Land in ${year}`}
            </span>
            {note ? <span className="truncate normal-case tracking-normal font-serif italic text-[12px]">{note}</span> : null}
          </p>
        ) : null}
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Year shown on the map"
          aria-valuemin={RULER_FIRST}
          aria-valuemax={RULER_LAST}
          aria-valuenow={year}
          aria-valuetext={valueText}
          onKeyDown={(e) => {
            const k = e.key;
            let next: number | null = null;
            if (k === "ArrowLeft" || k === "ArrowDown") next = year - 1;
            else if (k === "ArrowRight" || k === "ArrowUp") next = year + 1;
            else if (k === "Home") next = RULER_FIRST;
            else if (k === "End") next = RULER_LAST;
            else if (k === " ") {
              e.preventDefault();
              togglePlay();
              return;
            }
            if (next === null) return;
            e.preventDefault();
            e.stopPropagation();
            setPlaying(false);
            onYear(Math.max(RULER_FIRST, Math.min(RULER_LAST, next)));
          }}
          onPointerDown={(e) => {
            setPlaying(false);
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            fromX(e.clientX);
          }}
          onPointerMove={(e) => dragging && fromX(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className={cn(
            "group relative touch-none select-none rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
            compact ? "h-[46px]" : "h-[58px]",
            dragging ? "cursor-grabbing" : "cursor-pointer",
          )}
        >
          {/* shown span: from the first year to the handle */}
          <div
            aria-hidden
            className={cn("absolute left-0 top-0 bg-ink/[0.045] dark:bg-ink/[0.06]", compact ? "h-[28px]" : "h-[36px]", !dragging && "transition-[width] duration-[var(--dur)] ease-[var(--ease-survey)]")}
            style={{ width: `${((year - RULER_FIRST + 1) / N) * 100}%` }}
          />

          {/* histogram: hectares lost per year */}
          <div aria-hidden={false} className={cn("absolute inset-x-0 top-0 flex items-end", compact ? "h-[28px]" : "h-[36px]")}>
            {YEARS.map((y) => {
              const v = Number(lossByYear[String(y)] ?? 0);
              if (!v) return <span key={y} className="h-full flex-1" />;
              const h = Math.max(3, (v / max) * (compact ? 20 : 26));
              const on = y <= year;
              return (
                <span key={y} className="flex h-full flex-1 items-end justify-center">
                  <Tooltip content={`${y}: ${num(v, 1)} ha of forest lost on your plots`}>
                    <span
                      className={cn(
                        "block w-[38%] max-w-6 border-t-2 transition-opacity duration-[var(--dur)]",
                        on ? "border-noncompliant hatch-noncompliant opacity-100" : "border-rule-strong hatch-faint opacity-70",
                      )}
                      style={{ height: h }}
                    />
                  </Tooltip>
                </span>
              );
            })}
          </div>

          {/* ruler line and ticks */}
          <div aria-hidden className={cn("absolute inset-x-0 border-t border-ink/70", compact ? "top-[28px]" : "top-[36px]")}>
            {YEARS.map((y, i) => (
              <span key={y}>
                <span className="absolute top-0 h-2 w-px bg-ink/70" style={{ left: `${at(y)}%` }} />
                {[0.25, 0.75].map((q) => (
                  <span key={q} className="absolute top-0 h-1 w-px bg-ink/30" style={{ left: `${((i + q) / N) * 100}%` }} />
                ))}
              </span>
            ))}
          </div>

          {/* year labels */}
          <div aria-hidden className={cn("absolute inset-x-0", compact ? "top-[37px]" : "top-[46px]")}>
            {YEARS.map((y, i) =>
              compact && i % 2 === 1 && y !== year ? null : (
                <span
                  key={y}
                  className={cn(
                    "numerals absolute -translate-x-1/2 text-[10.5px] leading-none transition-colors duration-[var(--dur-fast)]",
                    y === year ? "font-semibold text-ink" : "text-ink-subtle",
                  )}
                  style={{ left: `${at(y)}%` }}
                >
                  {y}
                </span>
              ),
            )}
          </div>

          {/* the cut-off */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: `${CUT}%` }}>
            <svg className="absolute -left-[1px] top-0 h-full w-[2px] overflow-visible" preserveAspectRatio="none" viewBox="0 0 2 100">
              <DrawPath d="M1 0 V100" stroke="var(--marker)" strokeWidth={2} vectorEffect="non-scaling-stroke" duration={0.9} delay={0.3} />
            </svg>
            {compact ? (
              <span className="label-caps absolute right-1.5 top-0 whitespace-nowrap text-right text-[9px] leading-tight text-marker-ink">Cut-off</span>
            ) : (
              <span className="label-caps absolute -top-[15px] left-1 whitespace-nowrap text-[9.5px] text-marker-ink">31 Dec 2020</span>
            )}
          </div>

          {/* handle */}
          <div
            aria-hidden
            className={cn("pointer-events-none absolute inset-y-0 -translate-x-1/2", !dragging && "transition-[left] duration-[var(--dur)] ease-[var(--ease-survey)]")}
            style={{ left: `${at(year)}%` }}
          >
            <span className={cn("absolute left-1/2 top-0 w-px -translate-x-1/2 bg-marker", compact ? "h-[28px]" : "h-[36px]")} />
            <span
              className={cn(
                "absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-sheet bg-marker shadow-[0_0_0_1px_var(--marker)] transition-transform duration-[var(--dur-fast)] group-hover:scale-110",
                compact ? "top-[28px]" : "top-[36px]",
                dragging && "scale-125",
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
