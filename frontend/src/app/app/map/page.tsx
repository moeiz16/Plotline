"use client";

import { ArrowRight, MapPinned, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { PlotFilterBar } from "@/components/domain/plot-filters";
import { VerdictLegend } from "@/components/domain/readiness";
import { ChangeBadge, CountryLabel, VerdictBadge, VerdictDot } from "@/components/domain/status";
import { PlotMap } from "@/components/map/plot-map";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/display";
import { usePlots, usePlotsMap } from "@/lib/api/hooks";
import type { PlotFilters, PlotListItem } from "@/lib/api/types";
import { commodityLabel, ha } from "@/lib/format";
import { cn } from "@/lib/utils";

function SummaryCard({ p, onClose }: { p: PlotListItem; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold">{p.reference}</p>
          <p className="truncate text-[13px] text-muted">{p.supplierName}</p>
        </div>
        <button onClick={onClose} className="-mr-1 -mt-1 rounded-sm p-1 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close plot summary">
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <VerdictBadge verdict={p.verdict} />
        <ChangeBadge level={p.changeLevel} prefix="Land change" />
      </div>
      {p.headline ? <p className="mt-3 text-sm">{p.headline}</p> : null}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">Commodity</dt>
          <dd className="mt-0.5 font-medium">{commodityLabel(p.commodity)}</dd>
        </div>
        <div>
          <dt className="text-muted">Area</dt>
          <dd className="mt-0.5 font-medium tabular">{ha(p.areaHa)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Country</dt>
          <dd className="mt-0.5 font-medium">
            <CountryLabel code={p.country} name={p.countryName} />
          </dd>
        </div>
      </dl>
      <Button asChild variant="primary" size="sm" className="mt-4 w-full">
        <Link href={`/app/plots/${p.id}`}>
          Open plot <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}

export default function MapPage() {
  const [filters, setFilters] = useState<PlotFilters>({ verdict: "", commodity: "", country: "", q: "" });
  const deferredQ = useDeferredValue(filters.q);
  const apiFilters = { ...filters, q: deferredQ };
  const mapQ = usePlotsMap(apiFilters);
  const listQ = usePlots(apiFilters);
  const all = usePlots();
  const [selected, setSelected] = useState<string | null>(null);

  const countries = useMemo(() => Array.from(new Set((all.data ?? []).map((p) => p.country))).sort(), [all.data]);
  const list = listQ.data ?? [];
  const selectedPlot = (listQ.data ?? all.data ?? []).find((p) => p.id === selected) ?? all.data?.find((p) => p.id === selected);
  const fitKey = `${filters.verdict}|${filters.commodity}|${filters.country}`;

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row">
      <aside className="order-2 flex min-h-0 flex-col border-border bg-surface lg:order-1 lg:w-[360px] lg:shrink-0 lg:border-r">
        <div className="border-b border-border p-4">
          <h1 className="text-lg font-semibold">Plot map</h1>
          <p className="mt-0.5 text-[13px] text-muted">Every supplier plot, coloured by its latest verdict.</p>
          <PlotFilterBar value={filters} onChange={setFilters} countries={countries} className="mt-3" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted">
          <span aria-live="polite">{listQ.isPending ? "Loading plots…" : `${list.length} ${list.length === 1 ? "plot" : "plots"}`}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {listQ.isPending ? (
            <LoadingBlock className="p-4" rows={6} />
          ) : listQ.isError ? (
            <ErrorState error={listQ.error} onRetry={() => listQ.refetch()} />
          ) : !list.length ? (
            <EmptyState icon={<MapPinned />} title="No plots match" body="Try clearing a filter." />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {list.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    aria-pressed={selected === p.id}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2",
                      selected === p.id && "bg-brand-soft hover:bg-brand-soft",
                    )}
                  >
                    <VerdictDot verdict={p.verdict} className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[13px] font-medium">{p.reference}</span>
                        <span className="shrink-0 text-xs tabular text-muted">{ha(p.areaHa)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        {p.supplierName} · {commodityLabel(p.commodity)}
                      </span>
                      {p.headline ? <span className="mt-0.5 block truncate text-xs text-subtle">{p.headline}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section aria-label="Map" className="relative order-1 h-[58dvh] min-h-[320px] lg:order-2 lg:h-auto lg:flex-1">
        <PlotMap data={mapQ.data} selectedId={selected} onSelect={setSelected} fitKey={fitKey} className="absolute inset-0" maxFitZoom={13} />
        <div className="pointer-events-none absolute bottom-8 right-3 z-10 hidden rounded-md border border-border bg-surface/95 px-3 py-2 sm:block">
          <VerdictLegend />
        </div>
        {mapQ.isError ? (
          <div className="absolute inset-x-3 top-14 z-10 rounded-md border border-noncompliant/30 bg-noncompliant-soft px-3 py-2 text-[13px] text-noncompliant-fg">
            Plot shapes couldn’t be loaded.{" "}
            <button className="font-medium underline" onClick={() => mapQ.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {selectedPlot ? (
          <div className="absolute inset-x-3 bottom-8 z-20 sm:left-auto sm:right-3 sm:top-14 sm:bottom-auto sm:w-80">
            <SummaryCard p={selectedPlot} onClose={() => setSelected(null)} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
