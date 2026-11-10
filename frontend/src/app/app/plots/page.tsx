"use client";

import { MapIcon, Pentagon } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { PlotFilterBar } from "@/components/domain/plot-filters";
import { PlotTable } from "@/components/domain/plot-table";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/display";
import { usePlots } from "@/lib/api/hooks";
import type { Commodity, PlotFilters, Verdict } from "@/lib/api/types";

export default function PlotsPage() {
  const [filters, setFilters] = useState<PlotFilters>({ verdict: "", commodity: "", country: "", q: "" });
  // Links from the overview and country pages open the list pre-filtered (?country=GH&verdict=needs_review).
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

  return (
    <PageContainer wide>
      <PageHeader
        title="Plots"
        description="Every farm plot your suppliers have mapped, with its latest verdict."
        actions={
          <Button asChild>
            <Link href="/app/map">
              <MapIcon /> View on map
            </Link>
          </Button>
        }
      />
      <Card>
        <div className="border-b border-border p-4 sm:px-5">
          <PlotFilterBar value={filters} onChange={setFilters} countries={countries} className="lg:max-w-3xl" />
        </div>
        {list.isPending ? (
          <LoadingBlock className="p-5" rows={6} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data.length ? (
          <EmptyState icon={<Pentagon />} title="No plots match these filters" body="Clear a filter, or add plots from a supplier’s page." />
        ) : (
          <PlotTable plots={list.data} />
        )}
      </Card>
    </PageContainer>
  );
}
