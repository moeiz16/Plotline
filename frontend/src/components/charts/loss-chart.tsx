"use client";

import { TreePine } from "lucide-react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/display";
import type { LossDatum } from "./loss-chart-impl";

const Impl = dynamic(() => import("./loss-chart-impl"), { ssr: false, loading: () => <Skeleton className="h-full w-full" /> });

/** Forest loss per year since 2021 (single series, so no legend; the card title names it). */
export function LossChart({ byYear, className }: { byYear: Record<string, number>; className?: string }) {
  const thisYear = new Date().getFullYear();
  const data: LossDatum[] = [];
  for (let y = 2021; y <= thisYear; y++) data.push({ year: String(y), ha: Number(byYear?.[String(y)] ?? 0) });
  const table = data.map((d) => `${d.year}: ${d.ha} ha`).join(", ");
  if (data.every((d) => !d.ha))
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-2/40 px-4 py-5 text-sm text-muted">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-compliant-soft text-compliant-fg" aria-hidden>
          <TreePine className="size-4" />
        </span>
        No forest loss recorded on this plot in any year from 2021 to {thisYear}.
      </div>
    );
  return (
    <div className={className} role="img" aria-label={`Forest lost per year since 2021. ${table}`}>
      <Impl data={data} />
    </div>
  );
}
