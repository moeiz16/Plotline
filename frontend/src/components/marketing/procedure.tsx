"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useStoryMotion } from "./use-story-motion";
import { useRef } from "react";
import s from "./story.module.css";

const STEPS = [
  {
    title: "Suppliers map their plots",
    body: "Each cooperative or farm gets a link from your team. They tap the corners of a plot on a phone or upload a file. No account, nothing to install, and the outline is checked before it is saved.",
    who: "Supplier",
    out: "A plot outline",
    art: ["M14 4h20v40H14Z", "M18 14 28 12 31 22 25 30 18 26Z", "M22 40h4"],
  },
  {
    title: "Official forest maps decide",
    body: "Every plot is laid over the EU’s map of forest at 31 December 2020 and the yearly forest-loss record. Forest cleared after the cut-off makes the plot non-compliant, with the reason written out.",
    who: "Plotline",
    out: "A verdict, with data versions",
    art: ["M6 6h36v36H6Z", "M6 18h36M6 30h36M18 6v36M30 6v36", "M10 38c8-6 14 0 22-8s8-14 8-14"],
  },
  {
    title: "The satellite gives a second opinion",
    body: "Recent imagery is compared with 2020. When this second opinion disagrees with the official maps, the plot goes to a person. It is never settled automatically.",
    who: "Plotline",
    out: "A land-change signal",
    art: ["M20 12 28 20 20 28 12 20Z", "M4 12l8 8M28 20l8 8M24 4l-4 8", "M20 28v6M14 44h12"],
  },
  {
    title: "A reviewer confirms",
    body: "Your reviewer sees the before and after, the evidence and a plain reason, then confirms or overturns the verdict with a note that stays on the record.",
    who: "Reviewer",
    out: "A confirmed verdict",
    art: ["M20 20m-12 0a12 12 0 1 0 24 0a12 12 0 1 0-24 0", "M29 29 42 42", "M14 20l4 4 8-8"],
  },
  {
    title: "The statement is filed",
    body: "Shipments are traced back to their plots, and the due diligence statement is prepared for the EU information system (demo submission), with an evidence pack kept for five years.",
    who: "Compliance lead",
    out: "Due diligence statement",
    art: ["M10 4h22l8 8v32H10Z", "M16 16h16M16 22h16M16 28h10", "M30 38m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0"],
  },
];

/** [5] What your team does: a numbered field procedure with a survey line that draws as you read. */
export function Procedure() {
  const ref = useRef<HTMLOListElement>(null);
  const live = useStoryMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 60%"] });
  const line = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="procedure" aria-labelledby="procedure-title" className="scroll-mt-14 border-t border-ink/70 bg-sheet">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-6 border-b-[3px] border-double border-ink/60 pb-8 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="label-caps text-ink-subtle">
              <span className="text-marker-ink">Sheet 02</span> · Field procedure
            </p>
            <h2 id="procedure-title" className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.03em] sm:text-[60px]">
              What your team does
            </h2>
          </div>
          <p className="max-w-[46ch] text-[17px] italic leading-relaxed text-ink-muted lg:justify-self-end">
            Five steps, from a farmer’s phone to the EU information system. Every step leaves a line in the record, so anyone can retrace it later.
          </p>
        </div>

        <ol ref={ref} className="relative mt-4">
          {/* The survey line through the station numbers */}
          <div aria-hidden className="absolute bottom-10 left-[27px] top-10 w-px bg-rule sm:left-[35px]" />
          <motion.div
            aria-hidden
            className="absolute bottom-10 left-[27px] top-10 w-[2px] origin-top bg-marker sm:left-[35px]"
            style={!live ? undefined : { scaleY: line }}
          />
          {STEPS.map((step, i) => (
            <li key={step.title} className={`${s.inkRow} relative grid grid-cols-[56px_minmax(0,1fr)] gap-x-4 border-b border-rule py-8 sm:grid-cols-[72px_64px_minmax(0,1fr)_220px] sm:gap-x-6 sm:py-10`}>
              <span className="relative z-10 flex size-14 items-center justify-center border border-ink bg-sheet numerals text-[19px] font-medium sm:size-[72px] sm:text-[24px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <svg viewBox="0 0 48 48" className="hidden size-16 self-center text-ink sm:block" fill="none" aria-hidden>
                {step.art.map((d, k) => (
                  <path key={k} d={d} pathLength={1} className={s.drawView} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </svg>
              <div className="min-w-0 self-center">
                <h3 className="text-[24px] font-medium leading-tight tracking-[-0.015em] sm:text-[30px]">{step.title}</h3>
                <p className="mt-2 max-w-[60ch] text-[16px] leading-relaxed text-ink-muted">{step.body}</p>
              </div>
              <dl className="col-start-2 mt-4 grid gap-1.5 self-center border-l border-rule pl-4 sm:col-start-auto sm:mt-0">
                <div className="flex gap-2">
                  <dt className="label-caps w-14 shrink-0 text-ink-subtle">Who</dt>
                  <dd className="label-caps text-ink">{step.who}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="label-caps w-14 shrink-0 text-ink-subtle">Leaves</dt>
                  <dd className="text-[14px] italic leading-snug text-ink-muted">{step.out}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
