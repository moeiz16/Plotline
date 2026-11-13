"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useStoryMotion } from "./use-story-motion";
import { useEffect, useRef, useState } from "react";
import { daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import s from "./story.module.css";

const START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2027, 8, 30);
const DEADLINES = [
  { iso: "2026-12-30", label: "30 Dec 2026", who: "Medium and large operators and traders" },
  { iso: "2027-06-30", label: "30 Jun 2027", who: "Micro and small enterprises" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const pos = (t: number) => Math.min(100, Math.max(0, ((t - START) / (END - START)) * 100));

const TICKS = Array.from({ length: 21 }, (_, i) => {
  const y = 2026 + Math.floor(i / 12);
  const m = i % 12;
  return { at: pos(Date.UTC(y, m, 1)), month: MONTHS[m], year: m === 0 ? y : null, quarter: m % 3 === 0 };
});

function useToday() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60 * 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function dLabel(days: number | null) {
  if (days === null) return "D–··";
  if (days <= 0) return "In force";
  return `D–${days}`;
}

/** [8] The deadline as a ruler, measured from today. */
export function DeadlineRuler() {
  const now = useToday();
  const live = useStoryMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 90%", "start 35%"] });
  const grow = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const todayAt = now ? pos(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) : 0;
  const todayLabel = now ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(now) : "";
  const days = DEADLINES.map((d) => (now ? daysUntil(d.iso, now) : null));

  return (
    <section id="deadline" aria-labelledby="deadline-title" className="scroll-mt-14 border-t border-ink/70 bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="label-caps text-ink-subtle">
              <span className="text-marker-ink">Sheet 05</span> · Deadline, measured from today
            </p>
            <h2 id="deadline-title" className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.03em] sm:text-[60px]">
              The stakes are already in the ground
            </h2>
          </div>
          <p className="max-w-[46ch] text-[17px] italic leading-relaxed text-ink-muted lg:justify-self-end">
            From these dates, products in scope can only be placed on or exported from the EU market with a due diligence statement behind them.
          </p>
        </div>

        <div ref={ref} className="mt-14">
          {/* Horizontal ruler (tablet and up) */}
          <div className="relative hidden h-[220px] md:block" aria-hidden>
            <div className="absolute inset-x-0 top-[150px] h-[2px] bg-ink" />
            {/* elapsed time, measured out as you read */}
            <div className="absolute left-0 top-[136px] h-[14px]" style={{ width: `${todayAt}%` }}>
              <motion.div className="hatch size-full origin-left text-ink/35" style={!live ? undefined : { scaleX: grow }} />
            </div>
            {TICKS.map((t) => (
              <div key={t.at} className="absolute top-[150px]" style={{ left: `${t.at}%` }}>
                <span className={cn(s.tickGrow, "absolute bottom-0 left-0 w-px bg-ink", t.year ? "h-10" : t.quarter ? "h-4" : "h-2.5")} />
                <span className={cn("absolute left-1 top-2 numerals text-[10px] uppercase text-ink-subtle", !t.quarter && "hidden lg:block")}>{t.month}</span>
                {t.year ? <span className="absolute -top-[66px] left-1.5 font-serif text-[26px] italic text-ink">{t.year}</span> : null}
              </div>
            ))}
            {now ? (
              <div className="absolute top-[64px]" style={{ left: `${todayAt}%` }}>
                <span className="absolute left-0 top-0 h-[86px] w-[2px] bg-ink" />
                <span className="absolute right-2 top-0 whitespace-nowrap bg-ink px-1.5 py-0.5 numerals text-[10.5px] uppercase text-paper">Today · {todayLabel}</span>
              </div>
            ) : null}
            {DEADLINES.map((d, i) => (
              <div key={d.iso} className={cn(s.stakeIn, "absolute top-0")} style={{ left: `${pos(utc(d.iso))}%` }}>
                <span className="absolute left-0 top-0 h-[150px] w-[2px] bg-ink" />
                <span className="absolute left-[2px] top-0 flex h-9 items-center gap-2 whitespace-nowrap bg-marker-fill pl-2.5 pr-4 font-mono text-[15px] font-semibold text-marker-contrast [clip-path:polygon(0_0,100%_0,calc(100%-8px)_50%,100%_100%,0_100%)]">
                  {dLabel(days[i])}
                </span>
                <span className="absolute left-2 top-11 whitespace-nowrap numerals text-[10.5px] uppercase text-ink-muted">
                  {i + 1} · {d.label}
                </span>
              </div>
            ))}
            <span className="absolute -left-1 top-[160px] -translate-x-full numerals text-[10px] text-ink-subtle">≈</span>
          </div>

          {/* Vertical ruler (phones) */}
          <div className="relative ml-2 h-[520px] md:hidden" aria-hidden>
            <div className="absolute inset-y-0 left-[96px] w-[2px] bg-ink" />
            <div className="absolute left-[98px] top-0 w-[12px]" style={{ height: `${todayAt}%` }}>
              <motion.div className="hatch size-full origin-top text-ink/35" style={!live ? undefined : { scaleY: grow }} />
            </div>
            {TICKS.map((t) => (
              <div key={t.at} className="absolute left-[96px]" style={{ top: `${t.at}%` }}>
                <span className={cn("absolute right-0 top-0 h-px bg-ink", t.year ? "w-8" : t.quarter ? "w-4" : "w-2")} />
                {t.quarter ? <span className="absolute right-10 top-[-6px] numerals text-[10px] uppercase text-ink-subtle">{t.month}</span> : null}
                {t.year ? <span className="absolute -top-8 right-10 font-serif text-[20px] italic text-ink">{t.year}</span> : null}
              </div>
            ))}
            {now ? (
              <div className="absolute left-[96px]" style={{ top: `${todayAt}%` }}>
                <span className="absolute left-0 top-0 h-[2px] w-16 bg-ink" />
                <span className="absolute left-16 top-[-9px] whitespace-nowrap bg-ink px-1.5 py-0.5 numerals text-[10px] uppercase text-paper">Today</span>
              </div>
            ) : null}
            {DEADLINES.map((d, i) => (
              <div key={d.iso} className="absolute left-[96px]" style={{ top: `${pos(utc(d.iso))}%` }}>
                <span className="absolute left-0 top-0 h-[2px] w-24 bg-ink" />
                <span className="absolute left-24 top-[-17px] flex h-[34px] items-center whitespace-nowrap bg-marker-fill pl-2.5 pr-4 font-mono text-[14px] font-semibold text-marker-contrast [clip-path:polygon(0_0,100%_0,calc(100%-8px)_50%,100%_100%,0_100%)]">
                  {dLabel(days[i])}
                </span>
              </div>
            ))}
          </div>

          {/* The readable record of the ruler */}
          <ol className="mt-10 grid gap-px border border-ink/80 bg-rule md:grid-cols-2">
            {DEADLINES.map((d, i) => (
              <li key={d.iso} className="flex items-start gap-5 bg-sheet p-5 sm:p-7">
                <span className="numerals text-[13px] text-marker-ink">{i + 1}</span>
                <div className="min-w-0">
                  <p className="label-caps text-ink-subtle">{d.label}</p>
                  <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
                    <span className="font-serif text-[56px] font-medium leading-none tracking-[-0.03em] tabular" aria-live="polite">
                      {days[i] === null ? "··" : Math.max(0, days[i]!)}
                    </span>
                    <span className="text-[18px] italic text-ink-muted">{days[i] !== null && days[i]! <= 0 ? "in force" : "days to go"}</span>
                  </p>
                  <p className="mt-3 text-[16px] leading-snug">{d.who}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
