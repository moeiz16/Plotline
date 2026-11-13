"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useStoryMotion } from "./use-story-motion";
import Link from "next/link";
import { useRef } from "react";
import { DemoEntry } from "./demo-entry";
import s from "./story.module.css";
import { HERO_CONTOURS, HERO_PLOT, HERO_PLOT_ORIGIN, HERO_RIVER, HERO_VIEW } from "./topo";
import { TopoMap } from "./topo-map";

const LAT = ["5°52′ N", "5°50′ N", "5°48′ N", "5°46′ N"];
const LON = ["6°40′ W", "6°38′ W", "6°36′ W", "6°34′ W", "6°32′ W"];

/**
 * [1] The cut-off. A full-bleed topographic sheet with the date set huge across it.
 * Scrolling away flies the sheet in toward the plot that the next scene surveys
 * (scale on the map, rise + fade on the type: transform and opacity only).
 */
export function CutoffScene() {
  const ref = useRef<HTMLElement>(null);
  const live = useStoryMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const zoom = useTransform(scrollYProgress, [0, 1], [1, 2.6]);
  const mapOpacity = useTransform(scrollYProgress, [0.55, 0.95], [1, 0]);
  const typeY = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const typeOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const chromeOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const plotD = `M${HERO_PLOT.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

  return (
    <section ref={ref} aria-labelledby="cutoff-title" className="paper-grain relative isolate h-svh min-h-[620px] overflow-hidden bg-paper">
      {/* The sheet */}
      <motion.div
        className="absolute inset-0 text-ink will-change-transform"
        style={!live ? undefined : { scale: zoom, opacity: mapOpacity, transformOrigin: `${HERO_PLOT_ORIGIN.x * 100}% ${HERO_PLOT_ORIGIN.y * 100}%` }}
      >
        <div className="graticule absolute inset-0 opacity-70" />
        <TopoMap contours={HERO_CONTOURS} view={HERO_VIEW} river={HERO_RIVER} drawIndex className="absolute inset-0 size-full">
          <path d={plotD} fill="var(--marker)" fillOpacity={0.08} stroke="var(--marker)" strokeWidth={1.4} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <path d={`M${HERO_PLOT[0][0]} ${HERO_PLOT[0][1]}V${HERO_PLOT[0][1] - 34}`} stroke="var(--ink)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          <path d={`M${HERO_PLOT[0][0]} ${HERO_PLOT[0][1] - 34}l18 6-18 6Z`} fill="var(--marker)" />
          <text x={HERO_PLOT[2][0] + 14} y={HERO_PLOT[2][1] - 4} className="font-mono" fontSize={11} letterSpacing="0.08em" fill="var(--ink-muted)">
            CI-NAW-0007
          </text>
          <text x={HERO_PLOT[2][0] + 14} y={HERO_PLOT[2][1] + 12} className="font-mono" fontSize={11} letterSpacing="0.08em" fill="var(--ink-subtle)">
            NOT YET SURVEYED
          </text>
        </TopoMap>
      </motion.div>

      {/* Sheet edge: graticule labels like a printed map */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block" style={!live ? undefined : { opacity: chromeOpacity }}>
        <div className="absolute inset-x-8 top-16 flex justify-between numerals text-[10px] text-ink-subtle">
          {LON.map((l) => (
            <span key={l} className="border-l border-ink/40 pb-6 pl-1.5">
              {l}
            </span>
          ))}
        </div>
        <div className="absolute inset-y-24 right-4 flex flex-col justify-between numerals text-[10px] text-ink-subtle">
          {LAT.map((l) => (
            <span key={l} className="border-t border-ink/40 pt-1 text-right">
              {l}
            </span>
          ))}
        </div>
      </motion.div>

      {/* The date */}
      <motion.div className="relative z-10 flex h-full flex-col items-center justify-center px-4 pt-10 text-center" style={!live ? undefined : { y: typeY, opacity: typeOpacity }}>
        <p className={`${s.fadeUp} label-caps text-ink-muted`} style={{ animationDelay: "120ms" }}>
          <span className="text-marker-ink">Cut-off</span> · Regulation (EU) 2023/1115
        </p>
        <h1 id="cutoff-title" className="mt-5 font-serif font-[440] leading-[0.86] tracking-[-0.035em] text-ink [font-optical-sizing:auto]">
          <span className="sr-only">31 December 2020</span>
          <span aria-hidden className="flex flex-col items-center lg:flex-row lg:items-baseline lg:gap-[2.6vw]">
            <span className={s.line}>
              <span className={`${s.rise} text-[clamp(60px,15vw,96px)] lg:text-[min(10vw,168px)]`} style={{ animationDelay: "200ms" }}>
                31 December
              </span>
            </span>
            <span className={s.line}>
              <span className={`${s.rise} text-[clamp(96px,30vw,150px)] italic lg:text-[min(10vw,168px)]`} style={{ animationDelay: "340ms" }}>
                2020
              </span>
            </span>
          </span>
        </h1>
        <div className={`${s.fadeUp} mt-8 flex w-full max-w-[640px] items-center gap-3`} style={{ animationDelay: "700ms" }} aria-hidden>
          <span className="numerals text-[10px] text-ink-subtle">0</span>
          <span className="h-2 flex-1 border-x border-b border-ink/70 bg-[repeating-linear-gradient(90deg,var(--ink)_0_25%,transparent_25%_50%)] bg-[length:100%_3px] bg-bottom bg-no-repeat" />
          <span className="numerals text-[10px] text-ink-subtle">500 m</span>
        </div>
        <p className={`${s.fadeUp} mt-7 max-w-[34ch] text-[19px] italic leading-snug text-ink-muted sm:text-[22px]`} style={{ animationDelay: "820ms" }}>
          Land cleared after this date can no longer supply the European market. Plotline shows, plot by plot, which side of it your supply sits on.
        </p>
        <div className={`${s.fadeUp} mt-9 flex flex-col items-center gap-4 sm:flex-row sm:gap-6`} style={{ animationDelay: "960ms" }}>
          <DemoEntry />
          <Link href="/signup" className="font-serif text-[17px] italic text-marker-ink underline decoration-marker/50 underline-offset-4 hover:decoration-marker">
            or start your atlas →
          </Link>
        </div>
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center">
        <a
          href="#survey"
          className="pointer-events-auto flex flex-col items-center gap-2 label-caps text-ink-subtle hover:text-ink"
        >
          Scroll to survey the plot
          <span aria-hidden className="block h-8 w-px bg-ink/50" />
        </a>
      </div>
    </section>
  );
}
