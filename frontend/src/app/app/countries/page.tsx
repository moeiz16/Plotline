"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { VerdictBar } from "@/components/domain/readiness";
import { CountryLabel, RISK_META, RiskBadge } from "@/components/domain/status";
import { lineNo } from "@/components/ledger/format";
import { PageContainer } from "@/components/shell/app-shell";
import { Chip, EmptyState, ErrorState, Glyph, Ledger, LedgerHead, LedgerRow, LoadingBlock, PageHeader, Paper, SectionTitle } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { useCountries, useDashboard, useSuppliers } from "@/lib/api/hooks";
import type { Country, RiskTier } from "@/lib/api/types";
import { commodityLabel, num, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIERS: RiskTier[] = ["high", "standard", "low"];

const TIER_TEXT: Record<RiskTier, { duty: string; body: string; checks: string }> = {
  low: {
    duty: "Simplified due diligence",
    body: "Collect plot locations and production details; a full risk assessment is not needed unless you know of a specific risk.",
    checks: "About 1% of operators checked each year",
  },
  standard: {
    duty: "Full due diligence",
    body: "Collect the information, assess the risk of deforestation or illegal land use, and mitigate any risk before placing product on the market.",
    checks: "About 3% of operators checked each year",
  },
  high: {
    duty: "Enhanced scrutiny",
    body: "Full due diligence with closer attention. Plotline can send every plot from these countries to a reviewer before it is used.",
    checks: "About 9% of operators and of volume checked each year",
  },
};

const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_6rem_minmax(0,1.4fr)_4rem]";

function highlight(name: string, needle: string): ReactNode {
  if (!needle) return name;
  const i = name.toLowerCase().indexOf(needle);
  if (i < 0) return name;
  return (
    <>
      {name.slice(0, i)}
      <mark className="bg-marker-soft text-ink">{name.slice(i, i + needle.length)}</mark>
      {name.slice(i + needle.length)}
    </>
  );
}

/** A run-in list of country names, set like the Annex of an implementing regulation. */
function RunIn({ list, needle, sourcing }: { list: Country[]; needle: string; sourcing: Set<string> }) {
  return (
    <p className="text-[16px] leading-[1.9] text-ink">
      {list.map((c, i) => {
        const hit = needle && c.name.toLowerCase().includes(needle);
        const mine = sourcing.has(c.code);
        return (
          <Fragment key={c.code}>
            <span className={cn("whitespace-nowrap", needle && !hit && "text-ink-subtle", mine && "font-medium")}>
              {mine ? <Glyph tone="brand" size={8} className="mr-1 align-[0.05em]" label="You source here" /> : null}
              {highlight(c.name, needle)}
            </span>
            {i < list.length - 1 ? ", " : "."}
          </Fragment>
        );
      })}
    </p>
  );
}

export default function CountriesPage() {
  const countries = useCountries();
  const dash = useDashboard();
  const suppliers = useSuppliers();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<RiskTier | "">("");
  const needle = q.trim().toLowerCase();

  const sourcing = useMemo(() => dash.data?.byCountry ?? [], [dash.data]);
  const sourcingSet = useMemo(() => new Set(sourcing.map((c) => c.key)), [sourcing]);
  const supplierCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of suppliers.data ?? []) m.set(s.country, (m.get(s.country) ?? 0) + 1);
    return m;
  }, [suppliers.data]);
  const byTier = useMemo(() => {
    const m: Record<RiskTier, Country[]> = { low: [], standard: [], high: [] };
    for (const c of countries.data ?? []) m[c.riskTier].push(c);
    return m;
  }, [countries.data]);
  const matches = needle ? (countries.data ?? []).filter((c) => c.name.toLowerCase().includes(needle)) : [];

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Ledger · Countries"
        title="Country risk ledger"
        description="How the European Commission benchmarks the countries you buy from, and what each tier asks of your due diligence."
      />

      {/* Where you source */}
      <section aria-label="Where you source">
        <SectionTitle action={<span className="numerals text-[11px] text-ink-muted">{plural(sourcing.length, "country", "countries")}</span>}>Where you source</SectionTitle>
        {dash.isPending ? (
          <LoadingBlock rows={4} />
        ) : dash.isError ? (
          <ErrorState error={dash.error} onRetry={() => dash.refetch()} />
        ) : !sourcing.length ? (
          <EmptyState title="No sourcing countries yet" body="Countries appear here once your suppliers have mapped plots." />
        ) : (
          <>
            <LedgerHead className={cn("hidden pl-11 pr-1 md:grid gap-x-5", COLS)}>
              <span>Country of production</span>
              <span>EU benchmark · duty</span>
              <span className="text-right">Suppliers</span>
              <span>Plots by verdict</span>
              <span className="text-right">Ready</span>
            </LedgerHead>
            <Ledger label="Countries you source from" className="border-t-0">
              {sourcing.map((c, i) => (
                <LedgerRow key={c.key} index={i} number={lineNo(i)} href={`/app/plots?country=${c.key}`} className={cn(COLS, "gap-x-5 gap-y-2")}>
                  <span className="min-w-0 text-[19px] font-medium leading-tight">
                    <CountryLabel code={c.key} name={c.label} />
                  </span>
                  <span className="numerals text-right text-[18px] md:hidden">{c.readinessPct}%</span>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <RiskBadge tier={c.riskTier} />
                    <p className="mt-1 text-[14px] italic text-ink-muted">{TIER_TEXT[c.riskTier].duty}</p>
                  </div>
                  <span className="numerals hidden text-right text-[13.5px] md:block">{num(supplierCount.get(c.key) ?? 0)}</span>
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <VerdictBar split={c} height="h-2.5" />
                    <p className="numerals mt-1 text-[11px] text-ink-subtle">{plural(c.plots, "plot")}</p>
                  </div>
                  <span className="numerals hidden text-right text-[18px] md:block">{c.readinessPct}%</span>
                </LedgerRow>
              ))}
            </Ledger>
          </>
        )}
      </section>

      {/* Key */}
      <section className="mt-12" aria-label="What each tier asks of you">
        <SectionTitle>Key · what each tier asks of you</SectionTitle>
        <dl className="grid border-t border-ink/60 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t} className="border-b border-rule py-4 md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0">
              <dt className="flex items-center justify-between gap-3">
                <RiskBadge tier={t} />
                <span className="numerals text-[11px] text-ink-muted">{byTier[t].length ? plural(byTier[t].length, "country", "countries") : "…"}</span>
              </dt>
              <dd className="mt-2">
                <p className="text-[17px] font-medium">{TIER_TEXT[t].duty}</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{TIER_TEXT[t].body}</p>
                <p className="numerals mt-2 text-[11px] uppercase text-ink-subtle">{TIER_TEXT[t].checks}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The Annex */}
      <section className="mt-12" aria-label="EU country benchmarking">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle className="mb-0 flex-1">The benchmark · as published</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input leading={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a country" aria-label="Find a country" className="w-full sm:w-56" />
            <div className="flex gap-1.5" role="group" aria-label="Show one tier">
              <Chip active={!tier} onClick={() => setTier("")}>
                All
              </Chip>
              {TIERS.map((t) => (
                <Chip key={t} active={tier === t} onClick={() => setTier(tier === t ? "" : t)} icon={RISK_META[t].icon}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {needle ? (
          <p className="mb-3 text-[15px] italic text-ink-muted" aria-live="polite">
            {matches.length
              ? matches
                  .slice(0, 6)
                  .map((c) => `${c.name}: ${RISK_META[c.riskTier].label.toLowerCase()}${c.commodities.length ? ` (${c.commodities.map(commodityLabel).join(", ").toLowerCase()})` : ""}`)
                  .join(" · ")
              : "No country by that name."}
          </p>
        ) : null}

        {countries.isPending ? (
          <LoadingBlock rows={6} />
        ) : countries.isError ? (
          <ErrorState error={countries.error} onRetry={() => countries.refetch()} />
        ) : (
          <Paper className="px-5 py-7 sm:px-10">
            <p className="label-caps text-center text-ink">Annex</p>
            <p className="mx-auto mt-2 max-w-2xl text-center text-[15px] italic text-ink-muted">
              List of countries which are considered to present low or high risk according to the assessment based on Article 29 of Regulation (EU) 2023/1115.
            </p>
            <div className="mt-6 grid gap-8">
              {(["high", "low", "standard"] as RiskTier[]).filter((t) => !tier || t === tier).map((t) => (
                <div key={t}>
                  <h3 className="mb-2 flex items-center gap-2 border-b border-ink/40 pb-1.5">
                    <Glyph tone={RISK_META[t].tone} size={11} />
                    <span className="label-caps text-ink">{t === "standard" ? "Standard risk · not listed in the Annex" : `${t} risk countries`}</span>
                    <span className="numerals ml-auto text-[11px] text-ink-muted">{byTier[t].length}</span>
                  </h3>
                  {t === "high" ? (
                    <div className="hatch-faint border border-noncompliant/40 px-4 py-3">
                      <RunIn list={byTier[t]} needle={needle} sourcing={sourcingSet} />
                    </div>
                  ) : (
                    <RunIn list={byTier[t]} needle={needle} sourcing={sourcingSet} />
                  )}
                </div>
              ))}
            </div>
            <p className="mt-8 flex items-center gap-2 border-t border-rule pt-3 text-[13.5px] italic text-ink-muted">
              <Glyph tone="brand" size={8} /> marks a country you source from.
            </p>
          </Paper>
        )}
        <p className="mt-4 text-[13.5px] italic leading-relaxed text-ink-muted">
          Source: Commission Implementing Regulation (EU) 2025/1093 of 22 May 2025, Annex, as in force. Territories not named in the Annex are shown as standard risk. The Commission reviews the list;{" "}
          <Link href="https://eur-lex.europa.eu/eli/reg_impl/2025/1093/oj" className="text-marker-ink underline decoration-marker/50 underline-offset-4" target="_blank" rel="noopener">
            check the current text
          </Link>{" "}
          before relying on it.
        </p>
      </section>
    </PageContainer>
  );
}
