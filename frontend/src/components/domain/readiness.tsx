"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/overlays";
import type { Verdict } from "@/lib/api/types";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VERDICT_META, VERDICT_ORDER, VerdictDot, dotClass } from "./status";

export interface VerdictSplit {
  compliant: number;
  needsReview: number;
  nonCompliant: number;
  pending: number;
}

const keyOf: Record<Verdict, keyof VerdictSplit> = {
  compliant: "compliant",
  needs_review: "needsReview",
  non_compliant: "nonCompliant",
  pending: "pending",
};

/** Stacked verdict ruler: square segments, 2 px gaps, hatched non-compliant, dashed pending, hover tooltip per segment. */
export function VerdictBar({ split, className, height = "h-2" }: { split: VerdictSplit; className?: string; height?: string }) {
  const total = VERDICT_ORDER.reduce((s, v) => s + (split[keyOf[v]] || 0), 0);
  if (!total) return <div className={cn("w-full border border-dashed border-rule-strong", height, className)} aria-hidden />;
  const label = VERDICT_ORDER.map((v) => `${VERDICT_META[v].label}: ${split[keyOf[v]] || 0}`).join(", ");
  return (
    <div className={cn("flex w-full gap-[2px]", height, className)} role="img" aria-label={label}>
      {VERDICT_ORDER.map((v) => {
        const n = split[keyOf[v]] || 0;
        if (!n) return null;
        return (
          <Tooltip key={v} content={`${VERDICT_META[v].label}: ${num(n)} ${n === 1 ? "plot" : "plots"}`}>
            <span
              className={cn("h-full min-w-[3px]", dotClass[v])}
              style={{ flexGrow: n, flexBasis: 0 }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

export function VerdictLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted", className)}>
      {VERDICT_ORDER.map((v) => (
        <li key={v} className="inline-flex items-center gap-1.5">
          <VerdictDot verdict={v} size={9} />
          {VERDICT_META[v].label}
        </li>
      ))}
    </ul>
  );
}

/** One labelled row: name, plot count, readiness %, stacked verdict bar. */
export function ReadinessRow({
  label,
  meta,
  split,
  plots,
  readinessPct,
  href,
}: {
  label: ReactNode;
  meta?: ReactNode;
  split: VerdictSplit;
  plots: number;
  readinessPct: number;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
          <span className="truncate">{label}</span>
          {meta ? <span className="shrink-0 text-[13px] font-normal italic text-ink-muted">{meta}</span> : null}
        </div>
        <div className="numerals shrink-0 text-[13px]">
          <span className="font-semibold">{pct(readinessPct)}</span>
          <span className="ml-1.5 text-[11px] text-ink-muted">of {num(plots)}</span>
        </div>
      </div>
      <VerdictBar split={split} className="mt-2" />
    </>
  );
  return href ? (
    <Link href={href} className="-mx-2 block border-b border-rule px-2 py-2.5 outline-none transition-colors duration-150 hover:bg-sheet-2/60 focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    <div className="border-b border-rule py-2.5">{body}</div>
  );
}
