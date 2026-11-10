"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Td, Th } from "@/components/ui/display";
import type { PlotListItem } from "@/lib/api/types";
import { commodityLabel, ha, relative } from "@/lib/format";
import { ChangeBadge, CountryLabel, VerdictBadge } from "./status";

/** Plots as a table on wide screens and as stacked rows on phones. */
export function PlotTable({ plots, showSupplier = true }: { plots: PlotListItem[]; showSupplier?: boolean }) {
  const router = useRouter();
  return (
    <>
      <ul className="divide-y divide-border md:hidden">
        {plots.map((p) => (
          <li key={p.id}>
            <Link href={`/app/plots/${p.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[13px] font-medium">{p.reference}</span>
                  <VerdictBadge verdict={p.verdict} />
                </div>
                <p className="mt-1 truncate text-[13px] text-muted">
                  {showSupplier ? `${p.supplierName} · ` : ""}
                  {commodityLabel(p.commodity)} · {ha(p.areaHa)}
                </p>
                {p.headline ? <p className="mt-0.5 truncate text-xs text-subtle">{p.headline}</p> : null}
              </div>
              <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Table className="hidden md:block">
        <thead>
          <tr>
            <Th>Plot</Th>
            {showSupplier ? <Th>Supplier</Th> : null}
            <Th>Commodity</Th>
            <Th>Country</Th>
            <Th align="right">Area</Th>
            <Th>Verdict</Th>
            <Th>Land-change signal</Th>
            <Th>Last checked</Th>
          </tr>
        </thead>
        <tbody>
          {plots.map((p) => (
            <tr
              key={p.id}
              className="cursor-pointer transition-colors duration-150 hover:bg-surface-2/60"
              onClick={() => router.push(`/app/plots/${p.id}`)}
            >
              <Td>
                <Link href={`/app/plots/${p.id}`} className="font-mono text-[13px] font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                  {p.reference}
                </Link>
                {p.headline ? <p className="mt-0.5 max-w-[22rem] truncate text-xs text-muted">{p.headline}</p> : null}
              </Td>
              {showSupplier ? <Td className="max-w-[14rem] truncate">{p.supplierName}</Td> : null}
              <Td>{commodityLabel(p.commodity)}</Td>
              <Td>
                <CountryLabel code={p.country} name={p.countryName} />
              </Td>
              <Td align="right">{ha(p.areaHa)}</Td>
              <Td>
                <VerdictBadge verdict={p.verdict} />
              </Td>
              <Td>
                <ChangeBadge level={p.changeLevel} />
              </Td>
              <Td className="whitespace-nowrap text-muted">{p.assessedAt ? relative(p.assessedAt) : "Not yet"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
