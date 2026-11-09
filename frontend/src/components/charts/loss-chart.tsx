"use client";

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
  return (
    <div className={className} role="img" aria-label={`Forest lost per year since 2021. ${table}`}>
      <Impl data={data} />
    </div>
  );
}
