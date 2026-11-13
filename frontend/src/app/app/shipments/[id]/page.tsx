"use client";

import { ArrowLeft, FileCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { VerdictLegend } from "@/components/domain/readiness";
import { CHECK_META, CountryLabel, DdsBadge, RiskBadge, SHIPMENT_META, VerdictBadge, VerdictDot } from "@/components/domain/status";
import { CHECK_REMEDY, stampDate } from "@/components/ledger/format";
import { FormBox, FormGrid, LandingStamp } from "@/components/ledger/paper";
import { PlotMap } from "@/components/map/plot-map";
import { StaggerItem, StaggerList } from "@/components/motion";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { ErrorState, Glyph, Meter, Paper, SectionTitle, Skeleton } from "@/components/ui/display";
import { useCreateDds, usePlotsMap, useShipment, useTrace } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Check, PlotFeatureCollection, Shipment, Trace, TraceNode } from "@/lib/api/types";
import { commodityLabel, ha, kg, num, pct, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const ORDER: Record<Check["status"], number> = { fail: 0, warn: 1, pass: 2 };

/* ── Checks as a stamped checklist ──────────────────────────────────────────── */
function Checklist({ s }: { s: Shipment }) {
  const open = [...s.checks].filter((c) => c.status !== "pass").sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const passed = s.checks.filter((c) => c.status === "pass");
  return (
    <div className="grid gap-4">
      {open.length ? (
        <StaggerList as="ol" className="grid" label="Open checks">
          {open.map((c, i) => {
            const fix = CHECK_REMEDY[c.code];
            return (
              <StaggerItem key={c.code} className={cn("grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-3 last:border-b-0", c.status === "fail" && "bg-noncompliant-soft/25")}>
                <span
                  className={cn("flex size-7 items-center justify-center border-2", c.status === "fail" ? "border-noncompliant" : "border-review")}
                  style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}
                  aria-hidden
                >
                  <Glyph tone={CHECK_META[c.status].tone} size={13} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-[16px] font-medium leading-snug">{c.label}</span>
                    <span className={cn("font-mono text-[10.5px] font-medium uppercase tracking-[0.1em]", c.status === "fail" ? "text-noncompliant-fg" : "text-review-fg")}>
                      {c.status === "fail" ? "Blocker" : "Note"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[14.5px] italic leading-snug text-ink-muted">{c.detail}</p>
                  {fix ? (
                    <p className="mt-2 border-l-2 border-marker pl-2.5 text-[14.5px] leading-snug">
                      <span className="label-caps mr-1.5 text-marker-ink">To clear</span>
                      {fix.how}{" "}
                      {fix.href ? (
                        <Link href={fix.href(s.id)} className="whitespace-nowrap italic text-marker-ink underline decoration-marker/50 underline-offset-4">
                          {fix.cta} →
                        </Link>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      ) : null}
      {passed.length ? (
        <StaggerList as="ul" className="grid gap-x-6 sm:grid-cols-2" label="Passed checks">
          {passed.map((c, i) => (
            <StaggerItem key={c.code} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2.5 border-b border-rule py-2">
              <span className="flex size-5 items-center justify-center border-2 border-ink/70" style={{ transform: `rotate(${((i * 37) % 5) - 2}deg)` }} aria-hidden>
                <Glyph tone="compliant" size={10} />
              </span>
              <div className="min-w-0">
                <p className="text-[14.5px] leading-snug">
                  {c.label}
                  <span className="sr-only"> (passed)</span>
                </p>
                <p className="text-[13px] italic leading-snug text-ink-muted">{c.detail}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
      ) : null}
    </div>
  );
}

function Station({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <li className="relative grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] gap-x-3 pb-4 md:grid-cols-1 md:grid-rows-[1rem_auto] md:gap-y-2 md:pb-0 md:pr-4">
      <span aria-hidden className="relative z-10 mt-1 size-3 border-2 border-ink bg-sheet md:mt-0" />
      {!last ? <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-1rem)] border-l-2 border-ink md:left-4 md:top-[5px] md:h-0 md:w-[calc(100%-1rem)] md:border-l-0 md:border-t-2" /> : null}
      <div className="min-w-0">
        <p className="label-caps text-ink-subtle">{label}</p>
        <div className="mt-1 min-w-0">{children}</div>
      </div>
    </li>
  );
}

/* ── Trace: product ─ shipment ─ supplier ─ plot, as a route with stations ─── */
function TraceRoute({ trace }: { trace: Trace }) {
  const by = (t: TraceNode["type"]) => trace.nodes.filter((n) => n.type === t);
  const product = by("product")[0];
  const shipment = by("shipment")[0];
  const suppliers = by("supplier");
  const plots = by("plot");
  const kgOf = (target: string) => trace.edges.find((e) => e.target === target)?.quantityKg ?? null;
  const plotsOf = (sid: string) => plots.filter((p) => trace.edges.some((e) => e.source === sid && e.target === p.id));

  return (
    <ol className="grid md:grid-cols-[1fr_1fr_1.2fr_1.4fr]">
      <Station label="Product">
        <p className="text-[15px]">{product?.label ?? "–"}</p>
      </Station>
      <Station label="Shipment">
        <p className="numerals text-[13px]">{shipment?.label ?? "–"}</p>
      </Station>
      <Station label="Suppliers">
        <ul className="grid gap-1">
          {suppliers.map((s) => (
            <li key={s.id} className="text-[14.5px] leading-snug">
              {s.label}
              {kgOf(s.id) ? <span className="numerals ml-1.5 text-[11px] text-ink-muted">{kg(kgOf(s.id))}</span> : null}
            </li>
          ))}
        </ul>
      </Station>
      <Station label="Plots" last>
        <ul className="grid gap-1">
          {suppliers.flatMap((s) => plotsOf(s.id)).concat(plots.filter((p) => !suppliers.some((s) => plotsOf(s.id).includes(p)))).map((p) => (
            <li key={p.id}>
              <Link href={`/app/plots/${p.id}`} className="inline-flex items-center gap-1.5 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                {p.verdict ? <VerdictDot verdict={p.verdict} /> : null}
                <span className="numerals text-[12.5px]">{p.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Station>
    </ol>
  );
}

/* ── Right rail: where it was grown ─────────────────────────────────────────── */
function OriginMap({ s }: { s: Shipment }) {
  const all = usePlotsMap({ commodity: s.commodity });
  const router = useRouter();
  const data = useMemo<PlotFeatureCollection | undefined>(() => {
    if (!all.data) return undefined;
    const ids = new Set(s.allocations.map((a) => a.plotId));
    return { type: "FeatureCollection", features: all.data.features.filter((f) => ids.has(f.properties.id)) };
  }, [all.data, s.allocations]);
  if (!s.allocations.length) return null;
  return (
    <div className="border border-rule bg-sheet">
      <PlotMap data={data} compact fitKey={s.id} className="h-64 lg:h-72" onSelect={(id) => id && router.push(`/app/plots/${id}`)} ariaLabel={`Map of the plots in shipment ${s.reference}`} />
      <div className="border-t border-rule px-3 py-2">
        <VerdictLegend />
      </div>
    </div>
  );
}

const STAMP: Record<Shipment["status"], string> = { blocked: "Blocked", ready: "Cleared to ship", submitted: "Statement filed", draft: "Draft" };

export default function ShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const q = useShipment(id);
  const trace = useTrace(id);
  const { me, can } = useSession();
  const createDds = useCreateDds();
  const router = useRouter();
  const s = q.data;

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-6 h-[540px] max-w-[900px]" />
      </PageContainer>
    );
  if (q.isError || !s)
    return (
      <PageContainer>
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this manifest" />
      </PageContainer>
    );

  const blockers = s.checks.filter((c) => c.status === "fail").length;
  const notes = s.checks.filter((c) => c.status === "warn").length;
  const mb = new Map(s.massBalance.map((m) => [m.plotId, m]));
  const allocated = s.allocations.reduce((n, a) => n + a.quantityKg, 0);
  const mixTotal = s.mixing.verifiedKg + s.mixing.unverifiedKg;
  const tone = SHIPMENT_META[s.status].tone;

  const action = (variant: "primary" | "secondary") => s.ddsId ? (
    <Button asChild variant={variant}>
      <Link href={`/app/statements/${s.ddsId}`}>
        <FileCheck /> Open the statement
      </Link>
    </Button>
  ) : can("dds:write") ? (
    <Button
      variant={variant}
      disabled={s.status !== "ready"}
      loading={createDds.isPending}
      onClick={async () => {
        const d = await createDds.mutateAsync(s.id).catch(() => null);
        if (d) router.push(`/app/statements/${d.id}`);
      }}
    >
      <FileCheck /> Draft statement
    </Button>
  ) : null;

  return (
    <PageContainer wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/shipments" className="label-caps inline-flex items-center gap-1.5 text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="size-3.5" aria-hidden /> Consignment book
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {s.status === "blocked" && !s.ddsId ? <span className="text-[14px] italic text-noncompliant-fg">Clear {plural(blockers, "blocker")} before a statement can be drafted.</span> : null}
          {action("secondary")}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Paper className="px-4 pb-6 pt-5 sm:px-8 sm:pt-7">
          {/* Title block */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <p className="label-caps text-ink">Manifest · bill of lading</p>
              <p className="text-[14px] italic text-ink-muted">Traceability record under Regulation (EU) 2023/1115</p>
              <h1 className="numerals mt-3 text-[30px] font-medium leading-none tracking-[-0.01em] sm:text-[38px]">{s.reference}</h1>
            </div>
            <LandingStamp tone={tone} angle={-7} delay={0.35} size="lg" className="mt-1">
              {STAMP[s.status]}
            </LandingStamp>
          </div>
          <div className="my-5 h-[3px] border-y border-ink/70" aria-hidden />

          {/* Particulars */}
          <FormGrid className="grid-cols-2 md:grid-cols-4">
            <FormBox n="1" label="Operator" className="col-span-2">
              {me?.activeOrg?.name ?? "–"}
            </FormBox>
            <FormBox n="2" label="Description of goods" className="col-span-2">
              {s.productName}
            </FormBox>
            <FormBox n="3" label="HS heading" mono>
              {s.hsCode} · {commodityLabel(s.commodity).toUpperCase()}
            </FormBox>
            <FormBox n="4" label="Net weight" mono>
              {kg(s.quantityKg)}
            </FormBox>
            <FormBox n="5" label="Harvest" mono>
              {s.harvestYear}
            </FormBox>
            <FormBox n="6" label="Statement">
              {s.ddsStatus ? <DdsBadge status={s.ddsStatus} /> : <span className="italic text-ink-muted">Not drafted</span>}
            </FormBox>
            <FormBox n="7" label="Countries of production" className="col-span-2">
              <ul className="grid gap-1">
                {s.countries.map((c) => (
                  <li key={c.code} className="flex flex-wrap items-center gap-x-3">
                    <CountryLabel code={c.code} name={c.name} />
                    <RiskBadge tier={c.riskTier} />
                  </li>
                ))}
              </ul>
            </FormBox>
            <FormBox n="8" label="Suppliers · plots" mono className="col-span-2">
              {num(s.suppliers)} · {num(s.plots)}
            </FormBox>
          </FormGrid>

          {/* Lines */}
          <section className="mt-8" aria-label="Lines traced to plots">
            <SectionTitle action={<span className="numerals text-[11px] text-ink-muted">{plural(s.allocations.length, "line")}</span>}>Lines · traced to plots</SectionTitle>
            <div className="hidden md:block">
              <div className="label-caps grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_6.5rem_minmax(0,1.3fr)] gap-x-3 border-b-[3px] border-double border-ink/60 pb-2 text-ink-muted">
                <span>Line</span>
                <span>Origin plot</span>
                <span>Supplier</span>
                <span>Verdict</span>
                <span className="text-right">Allocated</span>
                <span>Capacity used</span>
              </div>
              <StaggerList as="ol" className="grid">
                {s.allocations.map((a, i) => {
                  const m = mb.get(a.plotId);
                  return (
                    <StaggerItem key={a.plotId} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_6.5rem_minmax(0,1.3fr)] items-center gap-x-3 border-b border-rule py-2.5">
                      <span className="numerals text-[12px] text-ink-subtle">{i + 1}</span>
                      <span className="min-w-0">
                        <Link href={`/app/plots/${a.plotId}`} className="numerals text-[13px] font-medium hover:underline">
                          {a.reference}
                        </Link>
                        <span className="numerals block text-[11px] text-ink-subtle">
                          {a.country} · {ha(a.areaHa)}
                        </span>
                      </span>
                      <span className="min-w-0 truncate text-[15px]">{a.supplierName}</span>
                      <VerdictBadge verdict={a.verdict} />
                      <span className="numerals text-right text-[13.5px]">{num(a.quantityKg)}</span>
                      <span className="flex items-center gap-2">
                        {m ? (
                          <>
                            <Meter value={Math.min(100, m.utilisationPct)} tone={m.ok ? "compliant" : "noncompliant"} className="min-w-12 flex-1" label={`${a.reference} capacity used`} />
                            <span className={cn("numerals w-11 text-right text-[12px]", !m.ok && "text-noncompliant-fg")}>{pct(m.utilisationPct)}</span>
                          </>
                        ) : (
                          <span className="numerals text-[12px] text-ink-subtle">–</span>
                        )}
                      </span>
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            </div>
            <ol className="grid md:hidden">
              {s.allocations.map((a, i) => {
                const m = mb.get(a.plotId);
                return (
                  <li key={a.plotId} className="grid gap-1.5 border-b border-rule py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/app/plots/${a.plotId}`} className="numerals text-[13px] font-medium">
                        <span className="text-ink-subtle">{i + 1} · </span>
                        {a.reference}
                      </Link>
                      <span className="numerals text-[13px]">{kg(a.quantityKg)}</span>
                    </div>
                    <p className="truncate text-[14.5px]">{a.supplierName}</p>
                    <VerdictBadge verdict={a.verdict} />
                    {m ? (
                      <div className="flex items-center gap-2">
                        <Meter value={Math.min(100, m.utilisationPct)} tone={m.ok ? "compliant" : "noncompliant"} className="flex-1" label={`${a.reference} capacity used`} />
                        <span className={cn("numerals text-[11.5px]", !m.ok && "text-noncompliant-fg")}>{pct(m.utilisationPct)} of capacity</span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className="flex items-baseline justify-between gap-3 border-b-[3px] border-double border-ink/60 py-2">
              <span className="label-caps text-ink">Total</span>
              <span className="numerals text-[14px]">
                {kg(allocated)}
                {Math.abs(allocated - s.quantityKg) > 0.5 ? <span className="ml-2 text-review-fg">of {kg(s.quantityKg)} declared</span> : null}
              </span>
            </div>
            {s.massBalance.some((m) => !m.ok) ? (
              <p className="mt-2 text-[14px] italic text-noncompliant-fg">A plot is allocated more than it could plausibly grow in a harvest year. Product from other, unmapped land may be mixed in.</p>
            ) : null}

            {/* Verified / unverified */}
            <div className="mt-5 grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="label-caps text-ink-muted">Verified and unverified product</span>
                <span className={cn("text-[14px] italic", s.mixing.mixed ? "text-review-fg" : "text-ink-muted")}>{s.mixing.mixed ? "Mixed: the whole lot counts as unverified" : "No mixing"}</span>
              </div>
              <div className="flex h-2.5 gap-[2px]" role="img" aria-label={`Verified ${kg(s.mixing.verifiedKg)}, unverified ${kg(s.mixing.unverifiedKg)}`}>
                {s.mixing.verifiedKg ? <span className="bg-compliant" style={{ flexGrow: s.mixing.verifiedKg }} /> : null}
                {s.mixing.unverifiedKg ? <span className="hatch-noncompliant border border-noncompliant/60" style={{ flexGrow: s.mixing.unverifiedKg }} /> : null}
                {!mixTotal ? <span className="flex-1 border border-dashed border-rule-strong" /> : null}
              </div>
              <div className="numerals flex justify-between text-[11.5px] text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Glyph tone="compliant" size={9} /> VERIFIED {kg(s.mixing.verifiedKg)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Glyph tone="noncompliant" size={9} /> UNVERIFIED {kg(s.mixing.unverifiedKg)}
                </span>
              </div>
            </div>
          </section>

          {/* Checks */}
          <section className="mt-8" aria-label="Checks">
            <SectionTitle
              action={
                <span className="numerals text-[11px] text-ink-muted">
                  {s.checks.length - blockers - notes} PASSED · {notes} NOTES · {blockers} BLOCKERS
                </span>
              }
            >
              Checks
            </SectionTitle>
            <Checklist s={s} />
          </section>

          {/* Trace */}
          <section className="mt-8" aria-label="Trace">
            <SectionTitle>Trace · product to plot</SectionTitle>
            {trace.isPending ? <Skeleton className="h-20" /> : trace.isError ? <ErrorState error={trace.error} onRetry={() => trace.refetch()} className="py-6" /> : <TraceRoute trace={trace.data} />}
          </section>

          {/* Foot */}
          <div className="mt-8 flex flex-col gap-4 border-t-[3px] border-double border-ink/60 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="numerals text-[11px] leading-5 text-ink-muted">
              <p>ENTERED {stampDate(s.updatedAt)} · {s.reference}</p>
              <p>CHECKED AGAINST THE EU FOREST MAP 2020 AND THE GLOBAL FOREST-LOSS RECORD</p>
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              {action("primary")}
              {!s.ddsId && s.status !== "ready" ? (
                <span className="text-[13.5px] italic text-ink-muted">{s.status === "blocked" ? "Disabled while blockers remain." : "Available once every check passes."}</span>
              ) : null}
            </div>
          </div>
        </Paper>

        {/* Rail */}
        <aside className="grid gap-5 lg:sticky lg:top-[calc(var(--masthead-h)+1.5rem)]">
          <section>
            <SectionTitle>Where it was grown</SectionTitle>
            <OriginMap s={s} />
          </section>
          <section>
            <SectionTitle>Clearance</SectionTitle>
            <p className="text-[15px] leading-relaxed">
              {s.status === "blocked"
                ? `${plural(blockers, "blocker")} stop${blockers === 1 ? "s" : ""} this consignment from the EU market. Each one says how to clear it.`
                : s.status === "ready"
                  ? `Every check passed${notes ? `, with ${plural(notes, "note")} to keep in mind` : ""}. Draft the statement to file it.`
                  : s.status === "submitted"
                    ? "The statement for this consignment is filed (demo submission)."
                    : "Trace the consignment to its plots to run the checks."}
            </p>
            {s.countries.some((c) => c.riskTier === "low") && s.countries.every((c) => c.riskTier === "low") ? (
              <p className="mt-2 text-[14px] italic text-ink-muted">All origins are low risk under the EU benchmark, so simplified due diligence may apply.</p>
            ) : null}
          </section>
        </aside>
      </div>
    </PageContainer>
  );
}
