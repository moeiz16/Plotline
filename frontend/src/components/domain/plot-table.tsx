"use client";

import { Crosshair } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { PlotListItem } from "@/lib/api/types";
import { commodityLabel, ha, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChangeBadge, CountryLabel, VERDICT_META, VerdictBadge, VerdictDot } from "./status";

const atlasHref = (id: string) => `/app?plot=${id}`;
const recordHref = (id: string) => `/app/plots/${id}`;
const inkDelay = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 16) * 35}ms` });

/**
 * Plots as a ruled field-book ledger: line numbers in the margin, the reference in mono with the
 * headline written under it, and the verdict as glyph + label. Fits 1440 px with no cut-off column
 * (secondary text wraps under the primary cell); stacks into entries below 768 px.
 * A row opens the plot on the Atlas (inspector); the reference opens the full record.
 */
export function PlotTable({ plots, showSupplier = true, numbered = true }: { plots: PlotListItem[]; showSupplier?: boolean; numbered?: boolean }) {
  const router = useRouter();
  return (
    <>
      <ol className="border-t border-ink/60 md:hidden" aria-label="Plots">
        {plots.map((p, i) => (
          <li key={p.id} className="ink-in border-b border-rule" style={inkDelay(i)}>
            <Link href={recordHref(p.id)} className="flex gap-3 px-1 py-3 outline-none focus-visible:bg-sheet-2/60 active:bg-sheet-2/60">
              {numbered ? <span className="numerals w-6 shrink-0 pt-0.5 text-[11px] text-ink-subtle">{String(i + 1).padStart(2, "0")}</span> : null}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="numerals truncate text-[13.5px] font-medium text-ink">{p.reference}</span>
                  <VerdictBadge verdict={p.verdict} />
                </span>
                {p.headline ? <span className="mt-1 block text-[14.5px] italic leading-snug text-ink-muted">{p.headline}</span> : null}
                <span className="mt-1 block truncate text-[13px] text-ink-muted">
                  {showSupplier ? `${p.supplierName} · ` : ""}
                  {commodityLabel(p.commodity)} · {ha(p.areaHa)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <table className="hidden w-full table-fixed border-collapse text-[15px] md:table">
        <colgroup>
          {numbered ? <col className="w-10" /> : null}
          <col className={showSupplier ? "w-[27%]" : "w-[34%]"} />
          {showSupplier ? <col className="w-[18%]" /> : null}
          <col className="w-[8%]" />
          <col className="w-[12%]" />
          <col className="w-[7%]" />
          <col className="w-[13%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-10" />
        </colgroup>
        <thead>
          <tr className="label-caps text-left text-ink-muted [&>th]:border-b-[3px] [&>th]:border-double [&>th]:border-ink/60 [&>th]:px-2 [&>th]:pb-2 [&>th]:pt-3 [&>th]:font-medium">
            {numbered ? <th scope="col" className="!pl-1">#</th> : null}
            <th scope="col">Plot</th>
            {showSupplier ? <th scope="col">Supplier</th> : null}
            <th scope="col">Commodity</th>
            <th scope="col">Country</th>
            <th scope="col" className="text-right">Area</th>
            <th scope="col">Verdict</th>
            <th scope="col">Signal</th>
            <th scope="col">Checked</th>
            <th scope="col">
              <span className="sr-only">On the map</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plots.map((p, i) => (
            <tr
              key={p.id}
              style={inkDelay(i)}
              className={cn(
                "ink-in group cursor-pointer align-top transition-colors duration-[var(--dur-fast)] hover:bg-sheet-2/60 [&>td]:border-b [&>td]:border-rule [&>td]:px-2 [&>td]:py-3",
                p.verdict === "non_compliant" && "[&>td:first-child]:shadow-[inset_2px_0_0_var(--noncompliant)]",
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a,button")) return;
                if (e.metaKey || e.ctrlKey) window.open(recordHref(p.id), "_blank");
                else router.push(atlasHref(p.id));
              }}
            >
              {numbered ? <td className="numerals !pl-1 pt-3.5 text-[11px] text-ink-subtle">{String(i + 1).padStart(2, "0")}</td> : null}
              <td className="min-w-0">
                <Link href={recordHref(p.id)} className="numerals text-[13.5px] font-medium text-ink underline decoration-transparent underline-offset-4 outline-none hover:decoration-ink focus-visible:ring-2 focus-visible:ring-ring">
                  {p.reference}
                </Link>
                {p.headline ? <p className="mt-0.5 text-[14px] italic leading-snug text-ink-muted [overflow-wrap:anywhere]">{p.headline}</p> : null}
              </td>
              {showSupplier ? <td className="text-[14.5px] leading-snug [overflow-wrap:anywhere]">{p.supplierName}</td> : null}
              <td className="text-[14.5px]">{commodityLabel(p.commodity)}</td>
              <td className="text-[14.5px]">
                <CountryLabel code={p.country} name={p.countryName} className="max-w-full" />
              </td>
              <td className="numerals text-right text-[13px]">{ha(p.areaHa)}</td>
              <td>
                <span className="inline-flex max-w-full items-center gap-1.5 font-mono text-[10.5px] font-medium uppercase leading-tight tracking-[0.06em]">
                  <VerdictDot verdict={p.verdict} className="shrink-0" />
                  <span className={cn({ compliant: "text-compliant-fg", needs_review: "text-review-fg", non_compliant: "text-noncompliant-fg", pending: "text-pending-fg" }[p.verdict])}>
                    {VERDICT_META[p.verdict].label}
                  </span>
                </span>
              </td>
              <td>
                {p.changeLevel ? (
                  <ChangeBadge level={p.changeLevel} />
                ) : (
                  <span className="text-[13.5px] italic text-ink-muted">{p.assessedAt ? "Too cloudy" : "Not yet"}</span>
                )}
              </td>
              <td className="text-[13.5px] text-ink-muted">{p.assessedAt ? relative(p.assessedAt) : <span className="italic">Not yet</span>}</td>
              <td className="!px-0 text-right">
                <Link
                  href={atlasHref(p.id)}
                  aria-label={`Show ${p.reference} on the atlas`}
                  className="inline-flex size-7 items-center justify-center rounded-sm text-ink-subtle opacity-60 outline-none transition-opacity hover:text-marker-ink hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 [&_svg]:size-4"
                >
                  <Crosshair aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
