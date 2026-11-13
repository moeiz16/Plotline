"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Stamp, type Tone } from "@/components/ui/display";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════════════════════════
   Document furniture for the manifest, the statement, the dossier and the
   supplier upload slip: numbered form boxes, a stamp that lands, a perforation.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A ruled form grid, like the boxes on a bill of lading or an official form.
 * Children are <FormBox>es; the grid draws the outer rules, each box draws its own right/bottom rule.
 */
export function FormGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid border-l border-t border-ink/50", className)}>{children}</div>;
}

/** One numbered box on a form: box number + mono caps label on top, the entry below. */
export function FormBox({
  n,
  label,
  children,
  className,
  mono,
}: {
  n?: ReactNode;
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set the entry in mono (references, quantities). */
  mono?: boolean;
}) {
  return (
    <div className={cn("min-w-0 border-b border-r border-ink/50 px-3 pb-2.5 pt-1.5", className)}>
      <div className="flex items-baseline gap-1.5 font-mono text-[9.5px] font-medium uppercase leading-4 tracking-[0.1em] text-ink-muted">
        {n !== undefined ? <span className="text-ink">{n}</span> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 min-w-0 break-words text-[15px] leading-snug text-ink", mono && "numerals text-[13.5px]")}>{children}</div>
    </div>
  );
}

/**
 * A rubber stamp that lands on the paper: it drops from above the sheet, hits slightly
 * over-size and settles at its angle; the ink ring spreads once. With `land={false}`
 * (or reduced motion) it is simply printed in place.
 */
export function LandingStamp({
  tone = "brand",
  angle = -6,
  land = true,
  delay = 0,
  children,
  className,
  size = "md",
}: {
  tone?: Tone;
  angle?: number;
  land?: boolean;
  delay?: number;
  children: ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  const reduce = useReducedMotion();
  // The ink ring is removed once it has faded, so its scaled box never widens the page on phones.
  const [ringDone, setRingDone] = useState(false);
  if (!land || reduce)
    return (
      <span className={cn("inline-block", className)}>
        <Stamp tone={tone} angle={angle} size={size}>
          {children}
        </Stamp>
      </span>
    );
  return (
    <span className={cn("relative inline-block", className)}>
      <motion.span
        className="inline-block"
        initial={{ opacity: 0, scale: 2.4, rotate: angle - 14, y: -18 }}
        animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
        transition={{ delay, type: "spring", stiffness: 520, damping: 26, mass: 1.1 }}
      >
        <Stamp tone={tone} angle={angle} size={size}>
          {children}
        </Stamp>
      </motion.span>
      {ringDone ? null : (
        <motion.span
          aria-hidden
          onAnimationComplete={() => setRingDone(true)}
          className="pointer-events-none absolute inset-[-6px] border-2 border-current"
          style={{ rotate: angle, color: "var(--marker)" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: [0, 0.45, 0], scale: [0.9, 1.25, 1.4] }}
          transition={{ delay: delay + 0.16, duration: 0.6, ease: "easeOut" }}
        />
      )}
    </span>
  );
}

/** A tear-off line, like the stub of a ticket or a request slip. */
export function Perforation({ className, label }: { className?: string; label?: string }) {
  return (
    <div aria-hidden className={cn("flex items-center gap-2", className)}>
      <span className="h-0 flex-1 border-t-2 border-dotted border-rule-strong" />
      {label ? <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-subtle">{label}</span> : null}
      <span className="h-0 w-6 border-t-2 border-dotted border-rule-strong" />
    </div>
  );
}

/** A short-lived marginal note that inks in next to whatever just happened (a reminder, a decision). */
export function MarginNote({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          role="status"
          className={cn("inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-marker-ink", className)}
          initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
          animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.52, ease: [0.5, 0, 0.1, 1] }}
        >
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
