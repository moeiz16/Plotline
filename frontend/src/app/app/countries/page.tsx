"use client";

import { Globe, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ReadinessRow } from "@/components/domain/readiness";
import { CountryLabel, RISK_META, RiskBadge } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Badge, Card, CardBody, CardHeader, Chip, EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { useCountries, useDashboard, useSuppliers } from "@/lib/api/hooks";
import type { RiskTier } from "@/lib/api/types";
import { commodityLabel, num } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIERS: RiskTier[] = ["low", "standard", "high"];

const TIER_TEXT: Record<RiskTier, { title: string; body: string; checks: string }> = {
  low: {
    title: "Simplified due diligence",
    body: "You still collect plot locations and production details, but you don’t need to carry out a full risk assessment, unless you know of a specific risk.",
    checks: "Authorities check about 1% of operators each year.",
  },
  standard: {
    title: "Full due diligence",
    body: "Collect the information, assess the risk that product came from deforested or illegally used land, and act on any risk you find before placing it on the market.",
    checks: "Authorities check about 3% of operators each year.",
  },
  high: {
    title: "Enhanced scrutiny",
    body: "Full due diligence with closer attention. Plotline can send every plot from these countries to a reviewer before it is used.",
    checks: "Authorities check about 9% of operators and of volume each year.",
  },
};

const toneRing: Record<RiskTier, string> = {
  low: "border-compliant/30",
  standard: "border-border",
  high: "border-noncompliant/30",
};

export default function CountriesPage() {
  const countries = useCountries();
  const dash = useDashboard();
  const suppliers = useSuppliers();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<RiskTier | "">("");

  const sourcing = useMemo(() => dash.data?.byCountry ?? [], [dash.data]);
  const supplierCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of suppliers.data ?? []) m.set(s.country, (m.get(s.country) ?? 0) + 1);
    return m;
  }, [suppliers.data]);

  const byTier = useMemo(() => {
    const m: Record<RiskTier, number> = { low: 0, standard: 0, high: 0 };
    for (const c of sourcing) m[c.riskTier] += 1;
    return m;
  }, [sourcing]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (countries.data ?? []).filter(
      (c) => (!tier || c.riskTier === tier) && (!needle || c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle),
    );
  }, [countries.data, q, tier]);

  return (
    <PageContainer>
      <PageHeader
        title="Country risk"
        description="How the European Commission rates the countries you source from, and what each rating means for your due diligence."
      />

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => (
          <Card key={t} className={cn("flex flex-col", toneRing[t])}>
            <CardBody className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <RiskBadge tier={t} />
                <span className="text-[13px] text-muted tabular">
                  {dash.isPending ? "…" : `${num(byTier[t])} of your ${sourcing.length === 1 ? "country" : "countries"}`}
                </span>
              </div>
              <p className="mt-1 text-[15px] font-semibold">{TIER_TEXT[t].title}</p>
              <p className="text-[13px] leading-relaxed text-muted">{TIER_TEXT[t].body}</p>
              <p className="mt-auto pt-2 text-xs text-subtle">{TIER_TEXT[t].checks}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Where you source from"
          description="Readiness is the share of mapped plots confirmed compliant in each country."
          icon={<Globe />}
        />
        {dash.isPending ? (
          <LoadingBlock className="p-5" rows={4} />
        ) : dash.isError ? (
          <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
        ) : !sourcing.length ? (
          <EmptyState title="No sourcing countries yet" body="Countries appear here once your suppliers have mapped plots." />
        ) : (
          <ul className="divide-y divide-border">
            {sourcing.map((c) => {
              const n = supplierCount.get(c.key) ?? 0;
              return (
                <li key={c.key} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center sm:gap-6 sm:px-5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Link href={`/app/plots?country=${c.key}`} className="min-w-0 rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                      <CountryLabel code={c.key} name={c.label} />
                    </Link>
                    <RiskBadge tier={c.riskTier} />
                    {n ? <span className="text-xs text-muted">{n === 1 ? "1 supplier" : `${n} suppliers`}</span> : null}
                  </div>
                  <ReadinessRow label={<span className="sr-only">{c.label}</span>} split={c} plots={c.plots} readinessPct={c.readinessPct} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="EU country benchmarking"
          description="Every country rated under Article 29 of the regulation. Ratings are reviewed by the Commission; Plotline uses the list currently in force."
        />
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="sm:w-64">
            <Input leading={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a country" aria-label="Find a country" />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by risk">
            <Chip active={!tier} onClick={() => setTier("")}>
              All
            </Chip>
            {TIERS.map((t) => (
              <Chip key={t} active={tier === t} onClick={() => setTier(tier === t ? "" : t)} icon={RISK_META[t].icon}>
                {RISK_META[t].label}
              </Chip>
            ))}
          </div>
          <span className="text-[13px] text-muted sm:ml-auto" aria-live="polite">
            {countries.data ? `${num(list.length)} ${list.length === 1 ? "country" : "countries"}` : null}
          </span>
        </div>
        {countries.isPending ? (
          <LoadingBlock className="p-5" rows={6} />
        ) : countries.isError ? (
          <ErrorState error={countries.error} onRetry={() => countries.refetch()} />
        ) : !list.length ? (
          <EmptyState title="No countries match" body="Try another name or clear the risk filter." />
        ) : (
          <div className="max-h-[560px] overflow-y-auto scrollbar-thin">
            <Table>
              <thead>
                <tr>
                  <Th>Country</Th>
                  <Th>Risk tier</Th>
                  <Th className="hidden sm:table-cell">Main EUDR commodities</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.code}>
                    <Td className="whitespace-normal">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <CountryLabel code={c.code} name={c.name} />
                        {sourcing.some((s) => s.key === c.code) ? <Badge tone="brand">You source here</Badge> : null}
                      </span>
                    </Td>
                    <Td>
                      <RiskBadge tier={c.riskTier} />
                    </Td>
                    <Td className="hidden text-muted sm:table-cell">{c.commodities.length ? c.commodities.map(commodityLabel).join(", ") : "–"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Source: Commission Implementing Regulation (EU) 2025/1093 on the country benchmarking under Regulation (EU) 2023/1115.
      </p>
    </PageContainer>
  );
}
