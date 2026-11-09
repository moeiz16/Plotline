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

/** Flat stacked bar of plot verdicts, 2 px gaps between segments, a hover tooltip per segment. */
export function VerdictBar({ split, className, height = "h-2" }: { split: VerdictSplit; className?: string; height?: string }) {
  const total = VERDICT_ORDER.reduce((s, v) => s + (split[keyOf[v]] || 0), 0);
  if (!total) return <div className={cn("w-full rounded-full bg-surface-3", height, className)} aria-hidden />;
  const label = VERDICT_ORDER.map((v) => `${VERDICT_META[v].label}: ${split[keyOf[v]] || 0}`).join(", ");
  return (
    <div className={cn("flex w-full gap-[2px]", height, className)} role="img" aria-label={label}>
      {VERDICT_ORDER.map((v) => {
        const n = split[keyOf[v]] || 0;
        if (!n) return null;
        return (
          <Tooltip key={v} content={`${VERDICT_META[v].label}: ${num(n)} ${n === 1 ? "plot" : "plots"}`}>
            <span
              className={cn("h-full min-w-[3px] first:rounded-l-full last:rounded-r-full", dotClass[v])}
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
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted", className)}>
      {VERDICT_ORDER.map((v) => (
        <li key={v} className="inline-flex items-center gap-1.5">
          <VerdictDot verdict={v} className="size-2" />
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
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          {meta ? <span className="shrink-0 text-xs font-normal text-muted">{meta}</span> : null}
        </div>
        <div className="shrink-0 text-sm tabular">
          <span className="font-semibold">{pct(readinessPct)}</span>
          <span className="ml-1.5 text-xs text-muted">of {num(plots)}</span>
        </div>
      </div>
      <VerdictBar split={split} className="mt-2" />
    </>
  );
  return href ? (
    <Link href={href} className="-mx-2 block rounded-md px-2 py-2 outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    <div className="py-2">{body}</div>
  );
}
