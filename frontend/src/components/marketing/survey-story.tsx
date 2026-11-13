"use client";

import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { useId, useRef, useState } from "react";
import { Glyph } from "@/components/ui/display";
import { cn } from "@/lib/utils";
import { CLASS_STYLE, PARCEL, PARCEL_D, RASTER, SCENE, STAKE_COORDS } from "./raster";
import { SCENE_CONTOURS, SCENE_RIVER } from "./topo";
import { TopoMap } from "./topo-map";

type Frame = { draw: MotionValue<number>; forest: MotionValue<number>; wipe: MotionValue<number>; verdict: MotionValue<number> };

const STEPS = [
  {
    fig: "I",
    layer: "Field survey",
    title: "A supplier walks the boundary.",
    body: "At the edge of the farm, a cooperative member taps each corner on a phone. Six stakes, one closed outline: plot CI-NAW-0007, 6.1 hectares of cocoa near Nawa, Côte d’Ivoire.",
    key: (
      <>
        <span className="inline-block size-2.5 rotate-45 bg-marker" aria-hidden /> 6 stakes · 6.1 ha
      </>
    ),
    vh: 100,
  },
  {
    fig: "II",
    layer: "Forest map · 31 Dec 2020",
    title: "The official forest map decides.",
    body: "The outline is laid over the EU’s map of where forest stood on 31 December 2020. On the cut-off date, 5.1 ha of this plot, 84 per cent, was forest.",
    key: (
      <>
        <Glyph tone="compliant" /> Forest on 31 Dec 2020
      </>
    ),
    vh: 100,
  },
  {
    fig: "III",
    layer: "Imagery · 2020 | 2026",
    title: "Then the satellite takes a second look.",
    body: "Imagery from 2020 is set beside today’s. A corner of the plot has gone to bare ground. The yearly forest-loss data dates it to 2022, so nobody has to guess.",
    key: (
      <>
        <span className="inline-block size-2.5 bg-rule-strong" aria-hidden /> Bare ground since 2020
      </>
    ),
    vh: 120,
  },
  {
    fig: "IV",
    layer: "Verdict",
    title: "Non-compliant: 2.4 ha cleared in 2022.",
    body: "Cocoa from this plot cannot enter the EU. The verdict, the imagery and the data versions behind it go on the record, and a reviewer confirms it before any shipment is blocked.",
    key: (
      <>
        <Glyph tone="noncompliant" /> Forest lost after the cut-off
      </>
    ),
    vh: 100,
  },
];
const TAIL_VH = 70;

/* ── The scene ─────────────────────────────────────────────────────────── */

function Peg({ draw, i, x, y }: { draw: MotionValue<number>; i: number; x: number; y: number }) {
  const at = i / PARCEL.length;
  const opacity = useTransform(draw, [at, at + 0.03], [0, 1]);
  const drop = useTransform(draw, [at, at + 0.05], [-14, 0]);
  return (
    <motion.g style={{ opacity, y: drop }}>
      <path d={`M${x} ${y}V${y - 22}`} stroke="var(--ink)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <path d={`M${x} ${y - 22}l11 4-11 4Z`} fill="var(--marker)" />
      <circle cx={x} cy={y} r={4} fill="var(--sheet)" stroke="var(--marker)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </motion.g>
  );
}

function RasterLayer({ which }: { which: "before" | "after" }) {
  const layer = RASTER[which];
  return (
    <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} className="absolute inset-0 size-full" aria-hidden>
      {(Object.keys(CLASS_STYLE) as (keyof typeof CLASS_STYLE)[]).map((k) =>
        layer[k] ? <path key={k} d={layer[k]} style={{ fill: `color-mix(in srgb, ${CLASS_STYLE[k].fill} ${CLASS_STYLE[k].opacity * 100}%, var(--paper))` }} /> : null,
      )}
    </svg>
  );
}

function Scene({ f, className, still }: { f: Frame; className?: string; still?: boolean }) {
  const hatchId = `story-hatch-${useId().replace(/:/g, "")}`;
  const outlineFill = useTransform(f.draw, [0.95, 1], [0, 1]);
  const revealX = useTransform(f.wipe, (w) => `${(w - 1) * 100}%`);
  const counterX = useTransform(f.wipe, (w) => `${(1 - w) * 100}%`);
  const dividerOpacity = useTransform(f.wipe, [0, 0.02, 0.98, 1], [0, 1, 1, 0]);
  const year = useTransform(f.wipe, (w) => String(2020 + Math.round(w * 6)));
  const yearOpacity = useTransform(f.wipe, [0, 0.04], [0, 1]);
  const stampScale = useTransform(f.verdict, [0, 1], [1.6, 1]);
  const stampOpacity = useTransform(f.verdict, [0, 0.35], [0, 1]);
  const lossOpacity = useTransform(f.verdict, [0, 0.6], [0, 1]);

  // Layer label + stake readout change in steps: a little state, updated only at boundaries.
  const [layer, setLayer] = useState(0);
  const [stake, setStake] = useState(0);
  const sync = () => {
    const l = f.verdict.get() > 0.3 ? 3 : f.wipe.get() > 0.02 ? 2 : f.forest.get() > 0.4 ? 1 : 0;
    setLayer(l);
    setStake(Math.min(PARCEL.length, Math.floor(f.draw.get() * PARCEL.length + 0.0001)));
  };
  useMotionValueEvent(f.draw, "change", sync);
  useMotionValueEvent(f.forest, "change", sync);
  useMotionValueEvent(f.wipe, "change", sync);
  useMotionValueEvent(f.verdict, "change", sync);
  const shownLayer = still ? (f.verdict.get() > 0.3 ? 3 : f.wipe.get() > 0.02 ? 2 : f.forest.get() > 0.4 ? 1 : 0) : layer;
  const shownStake = still ? PARCEL.length : stake;
  const c = STAKE_COORDS[Math.max(0, Math.min(PARCEL.length - 1, shownStake - 1))];

  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden border border-ink/70 bg-paper text-ink shadow-sheet", className)}>
      {/* Basemap: the same land as the opening sheet, zoomed in */}
      <div className="graticule absolute inset-0" />
      <TopoMap contours={SCENE_CONTOURS} view={SCENE} className="absolute inset-0 size-full" preserve="none" />

      {/* 2020 forest raster */}
      <motion.div className="absolute inset-0" style={{ opacity: f.forest }}>
        <RasterLayer which="before" />
      </motion.div>

      {/* 2026 raster, wiped in from the left (two opposing translates: transform only) */}
      <motion.div className="absolute inset-0 overflow-hidden" style={{ x: revealX }}>
        <motion.div className="absolute inset-0" style={{ x: counterX }}>
          <RasterLayer which="after" />
        </motion.div>
      </motion.div>
      <TopoMap contours={SCENE_CONTOURS} view={SCENE} className="pointer-events-none absolute inset-0 size-full opacity-60" preserve="none" />
      <motion.div className="pointer-events-none absolute inset-0" style={{ x: revealX, opacity: dividerOpacity }} aria-hidden>
        <div className="absolute inset-y-0 right-0 w-[2px] bg-ink" />
        <span className="absolute right-2 top-[30%] bg-ink sm:top-[14%] px-1.5 py-0.5 numerals text-[10.5px] text-paper">2026 ←</span>
        <span className="absolute -right-2 top-[30%] translate-x-full sm:top-[14%] border border-ink bg-sheet px-1.5 py-0.5 numerals text-[10.5px] text-ink">→ 2020</span>
      </motion.div>

      {/* Survey: outline, pegs, loss hatch */}
      <svg viewBox={`0 0 ${SCENE.w} ${SCENE.h}`} className="absolute inset-0 size-full" aria-hidden fill="none">
        <defs>
          <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2.2" height="7" fill="var(--noncompliant)" />
          </pattern>
        </defs>
        <path d={SCENE_RIVER} stroke="var(--pending)" strokeWidth={2} strokeOpacity={0.6} strokeLinecap="round" />
        <motion.path d={PARCEL_D} fill="var(--marker)" fillOpacity={0.1} style={{ opacity: outlineFill }} />
        <motion.g style={{ opacity: lossOpacity }}>
          <path d={RASTER.loss} fill="var(--noncompliant-soft)" fillOpacity={0.55} />
          <path d={RASTER.loss} fill={`url(#${hatchId})`} />
        </motion.g>
        <motion.path
          d={PARCEL_D}
          stroke="var(--marker)"
          strokeWidth={2.6}
          strokeLinejoin="round"
          style={{ pathLength: f.draw }}
        />
        {PARCEL.map(([x, y], i) => (
          <Peg key={i} draw={f.draw} i={i} x={x} y={y} />
        ))}
      </svg>

      {/* Chrome */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-2.5 sm:p-3">
        <span className="panel-float hidden px-2 py-1 label-caps text-ink sm:inline">CI-NAW-0007 · Cocoa</span>
        <span className="panel-float ml-auto flex items-center gap-1.5 px-2 py-1 label-caps text-ink">
          <span className="numerals text-marker-ink">{STEPS[shownLayer].fig}</span>
          {STEPS[shownLayer].layer}
        </span>
      </div>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute bottom-11 right-2.5 border border-ink/70 bg-sheet px-2.5 pb-1 pt-0.5 font-serif text-[clamp(36px,6vw,88px)] italic leading-none tracking-[-0.04em] text-ink sm:bottom-14 sm:right-3"
        style={{ opacity: yearOpacity }}
      >
        {year}
      </motion.span>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 sm:p-3">
        <span className="panel-float px-2 py-1 numerals text-[10.5px] text-ink sm:text-[11px]">
          {shownStake === 0 ? "Awaiting first stake" : shownStake < PARCEL.length ? `Stake ${shownStake}/6 · ${c.lat}° N ${c.lon}° W` : "Closed · 6 stakes · 6.1 ha"}
        </span>
        <span className="panel-float hidden px-2 py-1 numerals text-[11px] text-ink-muted sm:inline">5.8° N · 6.6° W · Z 15</span>
      </div>

      {/* The stamp */}
      <motion.div className="pointer-events-none absolute left-[46%] top-[47%]" style={{ scale: stampScale, opacity: stampOpacity }}>
        <span className="-rotate-6 inline-flex items-center gap-2 border-[3px] border-noncompliant bg-sheet/90 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-noncompliant-fg sm:px-3.5 sm:py-2 sm:text-[14px]">
          <Glyph tone="noncompliant" size={14} /> Non-compliant
          <span className="hidden font-medium sm:inline">· 2.4 ha · 2022</span>
        </span>
      </motion.div>
    </div>
  );
}

/* ── Captions ──────────────────────────────────────────────────────────── */

function Caption({ step, i, className }: { step: (typeof STEPS)[number]; i: number; className?: string }) {
  return (
    <div className={cn("border-t-[3px] border-ink bg-sheet p-5 shadow-pop sm:p-6", className)}>
      <p className="flex items-baseline justify-between label-caps text-ink-subtle">
        <span>
          Fig. <span className="text-marker-ink">{step.fig}</span> · {step.layer}
        </span>
        <span className="numerals">{String(i + 1).padStart(2, "0")}/04</span>
      </p>
      <h3 className="mt-3 text-[24px] font-medium leading-[1.15] tracking-[-0.015em] sm:text-[28px]">{step.title}</h3>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-muted">{step.body}</p>
      <p className="mt-4 flex items-center gap-2 border-t border-rule pt-3 label-caps text-ink-muted">{step.key}</p>
    </div>
  );
}

/* ── The pinned story (motion) and its static frames (reduced motion) ──── */

function PinnedStory() {
  const ref = useRef<HTMLDivElement>(null);
  // Progress starts while the sheet is still rising into view (section top at 40 % of the viewport),
  // so the first stakes go in as the first caption arrives. Caption centres: I ≈ .13, II ≈ .36, III ≈ .6, IV ≈ .84.
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start 40%", "end end"] });
  const f: Frame = {
    draw: useTransform(p, [0.04, 0.21], [0, 1]),
    forest: useTransform(p, [0.29, 0.39], [0, 1]),
    wipe: useTransform(p, [0.5, 0.7], [0, 1]),
    verdict: useTransform(p, [0.79, 0.86], [0, 1]),
  };

  return (
    <div ref={ref} className="relative">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div className="mx-auto grid h-full max-w-[1440px] grid-rows-[auto_1fr] px-4 pt-[68px] sm:px-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1 lg:items-center lg:gap-12 lg:pt-14">
          <div className="mx-auto w-full max-w-[min(100%,calc((100svh-150px)*4/3))]">
            <Scene f={f} />
          </div>
        </div>
      </div>
      <ol className="relative -mt-[100svh]">
        {STEPS.map((step, i) => (
          <li
            key={step.fig}
            className="flex items-end px-4 pb-6 sm:px-8 lg:items-center lg:pb-0"
            style={{ minHeight: `${step.vh}svh` }}
          >
            <Caption
              step={step}
              i={i}
              className="w-full max-w-[460px] lg:ml-auto lg:mr-[max(0px,calc((100vw-1440px)/2))] lg:w-[400px]"
            />
          </li>
        ))}
        <li aria-hidden style={{ height: `${TAIL_VH}svh` }} />
      </ol>
    </div>
  );
}

function StillFrame({ draw, forest, wipe, verdict, i }: { draw: number; forest: number; wipe: number; verdict: number; i: number }) {
  const f: Frame = { draw: useMotionValue(draw), forest: useMotionValue(forest), wipe: useMotionValue(wipe), verdict: useMotionValue(verdict) };
  return (
    <li className="grid gap-4">
      <Scene f={f} still />
      <Caption step={STEPS[i]} i={i} className="shadow-none" />
    </li>
  );
}

function StillStory() {
  return (
    <ol className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 md:grid-cols-2">
      <StillFrame i={0} draw={1} forest={0} wipe={0} verdict={0} />
      <StillFrame i={1} draw={1} forest={1} wipe={0} verdict={0} />
      <StillFrame i={2} draw={1} forest={1} wipe={0.55} verdict={0} />
      <StillFrame i={3} draw={1} forest={1} wipe={1} verdict={1} />
    </ol>
  );
}

/**
 * [2–4] One plot, surveyed, judged and stamped. NYT-style sticky scene with stepped captions
 * (Pudding pattern: the graphic is `position: sticky`; captions scroll over it). With reduced
 * motion the same story is shown as four still frames, every caption visible.
 */
export function SurveyStory() {
  return (
    <section id="survey" aria-labelledby="survey-title" className="relative scroll-mt-14 bg-paper">
      <h2 id="survey-title" className="sr-only">
        One plot, surveyed and judged
      </h2>
      <div className="motion-reduce:hidden">
        <PinnedStory />
      </div>
      <div className="hidden motion-reduce:block">
        <StillStory />
      </div>
    </section>
  );
}
