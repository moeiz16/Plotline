"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { VerdictBar } from "@/components/domain/readiness";
import { PlotFilterBar } from "@/components/domain/plot-filters";
import { PlotTable } from "@/components/domain/plot-table";
import { ViewSwitch } from "@/components/map/ledger-panel";
import { PageContainer } from "@/components/shell/app-shell";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/display";
import { usePlots } from "@/lib/api/hooks";
import type { Commodity, PlotFilters, Verdict } from "@/lib/api/types";
import { ha, num } from "@/lib/format";

export default function PlotsLedgerPage() {
  const [filters, setFilters] = useState<PlotFilters>({ verdict: "", commodity: "", country: "", q: "" });
  // Links from field notes and the country sheet open the ledger pre-filtered (?country=GH&verdict=needs_review).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const country = sp.get("country") ?? "";
    const verdict = (sp.get("verdict") ?? "") as Verdict | "";
    const commodity = (sp.get("commodity") ?? "") as Commodity | "";
    if (country || verdict || commodity) setFilters((f) => ({ ...f, country, verdict, commodity }));
  }, []);
  const q = useDeferredValue(filters.q);
  const list = usePlots({ ...filters, q });
  const all = usePlots();
  const countries = useMemo(() => Array.from(new Set((all.data ?? []).map((p) => p.country))).sort(), [all.data]);
  const rows = list.data ?? [];
  const split = {
    compliant: rows.filter((p) => p.verdict === "compliant").length,
    needsReview: rows.filter((p) => p.verdict === "needs_review").length,
    nonCompliant: rows.filter((p) => p.verdict === "non_compliant").length,
    pending: rows.filter((p) => p.verdict === "pending").length,
  };
  const area = rows.reduce((s, p) => s + p.areaHa, 0);

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Atlas / Ledger"
        title="Plots"
        description="Every plot your suppliers have surveyed, one line each, with its latest verdict. Choose a line to see it on the atlas."
        actions={<ViewSwitch value="ledger" />}
      />

      <PlotFilterBar
        value={filters}
        onChange={setFilters}
        countries={countries}
        trailing={
          <p className="numerals text-[12px] uppercase tracking-[0.04em] text-ink-muted" aria-live="polite">
            {list.isPending ? "Reading…" : `${num(rows.length)} ${rows.length === 1 ? "entry" : "entries"} · ${ha(area)}`}
          </p>
        }
      />
      {rows.length ? <VerdictBar split={split} height="h-1.5" className="mb-1 mt-4" /> : <div className="mt-4" />}

      <div className="mt-3">
        {list.isPending ? (
          <LoadingBlock rows={8} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !rows.length ? (
          <EmptyState title="No plots match these filters" body="Clear a filter, or add plots from a supplier’s page." />
        ) : (
          <PlotTable plots={rows} />
        )}
      </div>
      <p className="mt-4 text-[13px] italic text-ink-muted">
        Press a line to open it on the atlas. The reference opens the full record; hold ⌘ or Ctrl to open the record in a new tab.
      </p>
    </PageContainer>
  );
}
