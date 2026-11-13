"use client";

import { motion, useReducedMotion } from "motion/react";
import { DrawPath } from "@/components/motion";

/**
 * The integrity seal of the activity log. Unchecked: a dashed ring waiting for the check.
 * Checked: the ring draws itself, the inner ring follows, then the verdict is pressed in
 * the middle. Intact = forest ink, broken = crimson with a hatched band.
 */
export function IntegritySeal({ state, checked, brokenAt, date }: { state: "idle" | "checking" | "intact" | "broken"; checked?: number; brokenAt?: string | number | null; date?: string }) {
  const reduce = useReducedMotion();
  const ink = state === "broken" ? "var(--noncompliant)" : state === "intact" ? "var(--compliant)" : "var(--ink-subtle)";
  const ring = "M80 8a72 72 0 1 1 0 144a72 72 0 1 1 0-144";
  const inner = "M80 22a58 58 0 1 1 0 116a58 58 0 1 1 0-116";
  const done = state === "intact" || state === "broken";
  return (
    <svg viewBox="0 0 160 160" className="size-40 shrink-0" role="img" aria-label={done ? (state === "intact" ? `Chain intact, ${checked} entries checked` : `Chain broken at entry ${brokenAt}`) : "Seal not checked yet"}>
      <defs>
        <pattern id="seal-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.6" height="5" fill="var(--noncompliant)" opacity="0.6" />
        </pattern>
        {/* Starts at the bottom and runs clockwise over the top, so the ring text is centred on top
            and leaves the bottom of the ring free for the count and date. */}
        <path id="seal-arc" d="M80 130a50 50 0 1 1 0.1 0" />
      </defs>
      {!done ? (
        <>
          <circle cx="80" cy="80" r="72" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray="5 5" />
          <text x="80" y="76" textAnchor="middle" className="fill-ink-muted font-mono text-[9px] uppercase tracking-[0.14em]">
            {state === "checking" ? "Reading" : "Seal"}
          </text>
          <text x="80" y="90" textAnchor="middle" className="fill-ink-muted font-mono text-[9px] uppercase tracking-[0.14em]">
            {state === "checking" ? "the chain…" : "not checked"}
          </text>
        </>
      ) : (
        <g key={state}>
          {state === "broken" ? <path d={`${ring}Z`} fill="url(#seal-hatch)" opacity="0.5" /> : null}
          <DrawPath d={ring} fill="none" stroke={ink} strokeWidth="3" duration={0.9} />
          <DrawPath d={inner} fill="none" stroke={ink} strokeWidth="1" delay={0.35} duration={0.8} />
          <motion.g initial={reduce ? false : { opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8, type: "spring", stiffness: 420, damping: 22 }} style={{ transformOrigin: "80px 80px" }}>
            <text fill={ink} className="font-mono text-[8px] uppercase tracking-[0.22em]">
              <textPath href="#seal-arc" startOffset="50%" textAnchor="middle">
                {state === "intact" ? "Plotline · activity log · verified" : "Plotline · activity log · altered"}
              </textPath>
            </text>
            <text x="80" y="76" textAnchor="middle" fill={ink} className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em]">
              {state === "intact" ? "Chain" : "Broken"}
            </text>
            <text x="80" y="92" textAnchor="middle" fill={ink} className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em]">
              {state === "intact" ? "intact" : `at #${brokenAt}`}
            </text>
            <text x="80" y="106" textAnchor="middle" className="fill-ink-muted font-mono text-[7.5px] uppercase tracking-[0.1em]">
              {checked} entries
            </text>
            {date ? (
              <text x="80" y="117" textAnchor="middle" className="fill-ink-muted font-mono text-[7.5px] uppercase tracking-[0.1em]">
                {date}
              </text>
            ) : null}
          </motion.g>
        </g>
      )}
    </svg>
  );
}
