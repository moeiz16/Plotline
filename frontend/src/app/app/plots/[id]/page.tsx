"use client";

import { Crosshair, RotateCw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { LossChart } from "@/components/charts/loss-chart";
import { checkCode, plainVersion } from "@/components/domain/check-code";
import { ImageCompare } from "@/components/domain/image-compare";
import { ReviewActions } from "@/components/domain/review-actions";
import { ChangeBadge, CountryLabel, RiskBadge, VERDICT_META, VerdictBadge } from "@/components/domain/status";
import { PlotMap } from "@/components/map/plot-map";
import { Reveal } from "@/components/motion";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, Coord, DefinitionList, ErrorState, Figure, Glyph, Rule, Skeleton, Stamp, type Tone } from "@/components/ui/display";
import { useAssessPlot, useAssessments, usePlot, useSimilarPlots } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Assessment, Plot, PlotFeatureCollection, Reason } from "@/lib/api/types";
import { commodityLabel, date, ha, kg, num, relative, share } from "@/lib/format";
import { cn } from "@/lib/utils";

const reasonTone: Record<Reason["severity"], Tone> = { info: "neutral", warning: "review", critical: "noncompliant" };
const reasonLabel: Record<Reason["severity"], string> = { info: "Note", warning: "Warning", critical: "Critical" };

function Sec({ n, title, children, className, id, aside }: { n: string; title: string; children: ReactNode; className?: string; id?: string; aside?: ReactNode }) {
  return (
    <Reveal as="section" className={cn("min-w-0", className)}>
      <div id={id} className="mb-3 flex scroll-mt-28 items-center gap-3">
        <span className="numerals text-[11px] text-marker-ink">{n}</span>
        <h2 className="label-caps shrink-0 text-ink">{title}</h2>
        <span aria-hidden className="h-px min-w-6 flex-1 bg-rule-strong" />
        {aside}
      </div>
      {children}
    </Reveal>
  );
}

/** The sheet's title block: ruled cells, mono values, like the cartouche on a survey drawing. */
function Cartouche({ cells }: { cells: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 border-l border-t border-ink/60 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0 border-b border-r border-ink/60 px-3 py-2">
          <dt className="label-caps text-ink-subtle" style={{ fontSize: 10 }}>
            {c.label}
          </dt>
          <dd className="numerals mt-1 text-[13px] text-ink [overflow-wrap:anywhere]">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function agreement(a: Assessment): { tone: Tone; text: string } {
  if (a.changeLevel === null || a.signalsAgree === null)
    return { tone: "pending", text: "Recent imagery was too cloudy for the land-change signal, so this verdict rests on the official forest maps alone." };
  if (a.signalsAgree) return { tone: "compliant", text: "The land-change signal agrees with the official forest maps." };
  return { tone: "review", text: "The land-change signal disagrees with the official forest maps, so a reviewer must confirm the verdict before this plot can be used." };
}

function History({ plotId }: { plotId: string }) {
  const q = useAssessments(plotId);
  if (q.isPending) return <Skeleton className="h-32" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-6" />;
  if (!q.data.length) return <p className="text-[14.5px] italic text-ink-muted">Not checked yet. Run the check to see the first result.</p>;
  return (
    <ol className="relative" aria-label="Check history, newest first">
      <span aria-hidden className="absolute bottom-3 left-[5px] top-2 w-px bg-rule-strong" />
      {q.data.map((a, i) => (
        <li key={a.id} className="ink-in relative pb-4 pl-6 last:pb-0" style={{ animationDelay: `${i * 60}ms` }}>
          <span className="absolute left-0 top-[5px] bg-paper p-[1px]">
            <Glyph tone={VERDICT_META[a.verdict].tone} size={10} />
          </span>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="numerals text-[12px] uppercase text-ink-muted">{date(a.createdAt)}</span>
            <VerdictBadge verdict={a.verdict} />
            {i === 0 ? <span className="label-caps text-marker-ink">Latest</span> : null}
          </p>
          <p className="mt-1 text-[15px] leading-snug text-ink">{a.headline}</p>
          {a.review ? (
            <p className="mt-1 text-[14px] italic text-ink-muted">
              {a.review.reviewerName}: “{a.review.note}”
            </p>
          ) : null}
          <p className="numerals mt-1 text-[11.5px] text-ink-subtle">
            Check code {checkCode(a.resultHash)} · inputs {checkCode(a.inputsHash)} · {a.source === "live" ? "live imagery" : "stored imagery"}
          </p>
          {i === 0 ? (
            <details className="group mt-2">
              <summary className="label-caps cursor-pointer list-none text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">▸</span> Data versions used
              </summary>
              <DefinitionList
                className="mt-1 [&>div]:py-1.5 [&>div]:text-[13.5px]"
                items={[
                  { label: "Forest map 2020", value: plainVersion(a.datasets.forest2020) },
                  { label: "Forest loss", value: plainVersion(a.datasets.forestLoss) },
                  { label: "Imagery", value: plainVersion(a.datasets.imagery) },
                  { label: "Signal", value: plainVersion(a.datasets.changeModel, "signal") },
                  { label: "Rule set", value: plainVersion(a.datasets.rules) },
                ]}
              />
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Similar({ plotId }: { plotId: string }) {
  const q = useSimilarPlots(plotId);
  if (q.isPending) return <Skeleton className="h-24" />;
  if (q.isError || !q.data.length) return <p className="text-[14px] italic text-ink-muted">No similar-looking plots found yet.</p>;
  return (
    <ol className="border-t border-ink/60">
      {q.data.map((s, i) => (
        <li key={s.plot.id} className="ink-in border-b border-rule" style={{ animationDelay: `${i * 35}ms` }}>
          <Link href={`/app/plots/${s.plot.id}`} className="flex items-center gap-3 px-1 py-2 outline-none hover:bg-sheet-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <span className="numerals w-6 text-[11px] text-ink-subtle">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <span className="numerals block truncate text-[13px] text-ink">{s.plot.reference}</span>
              <span className="block truncate text-[13.5px] italic text-ink-muted">{s.plot.supplierName}</span>
            </span>
            <VerdictBadge verdict={s.plot.verdict} />
            <span className="numerals w-12 text-right text-[11.5px] text-ink-muted">{Math.round(s.similarity * 100)}%</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function featureOf(plot: Plot): PlotFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: plot.geometry,
        properties: { id: plot.id, reference: plot.reference, verdict: plot.verdict, commodity: plot.commodity, supplierName: plot.supplierName, areaHa: plot.areaHa, kind: plot.kind },
      },
    ],
  };
}

export default function PlotRecordPage() {
  const { id } = useParams<{ id: string }>();
  const q = usePlot(id);
  const assess = useAssessPlot(id);
  const { can } = useSession();
  const plot = q.data;
  const a = plot?.latestAssessment ?? null;
  const fc = useMemo(() => (plot ? featureOf(plot) : undefined), [plot]);

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-9 w-72" />
        <Skeleton className="mt-6 h-16 w-full" />
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <Skeleton className="h-[420px] lg:col-span-7" />
          <Skeleton className="h-[420px] lg:col-span-5" />
        </div>
      </PageContainer>
    );
  if (q.isError || !plot)
    return (
      <PageContainer>
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this plot" />
      </PageContainer>
    );

  const meta = VERDICT_META[plot.verdict];
  const agree = a ? agreement(a) : null;
  const toneText: Record<Tone, string> = {
    compliant: "text-compliant-fg",
    review: "text-review-fg",
    noncompliant: "text-noncompliant-fg",
    pending: "text-pending-fg",
    neutral: "text-ink-muted",
    brand: "text-marker-ink",
  };

  return (
    <PageContainer wide>
      {/* ── Title block ─────────────────────────────────────────────────── */}
      <header className="mb-8">
        <p className="label-caps mb-2 flex items-center gap-2 text-ink-muted">
          <Link href={`/app?plot=${plot.id}`} className="underline-offset-4 hover:underline">
            Atlas
          </Link>
          <span aria-hidden>/</span>
          <Link href="/app/plots" className="underline-offset-4 hover:underline">
            Ledger
          </Link>
          <span aria-hidden>/</span>
          <span>Plot record</span>
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <h1 className="numerals text-[30px] font-medium leading-none tracking-[-0.02em] sm:text-[38px]">{plot.reference}</h1>
              <span className="inline-block animate-[pop-in_var(--dur-slow)_var(--ease-out)_both] [animation-delay:200ms]">
                <Stamp tone={meta.tone} angle={-3}>
                  {meta.label}
                </Stamp>
              </span>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] text-ink-muted">
              <Link href={`/app/suppliers/${plot.supplierId}`} className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                {plot.supplierName}
              </Link>
              <span aria-hidden>·</span>
              <span className="italic">{commodityLabel(plot.commodity)}</span>
              <span aria-hidden>·</span>
              <CountryLabel code={plot.country} name={plot.countryName} />
              <RiskBadge tier={plot.riskTier} className="ml-1" />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={`/app?plot=${plot.id}`}>
                <Crosshair /> On the atlas
              </Link>
            </Button>
            {can("plots:write") ? (
              <Button variant="secondary" onClick={() => assess.mutate()} loading={assess.isPending}>
                {!assess.isPending ? <RotateCw /> : null} Check again
              </Button>
            ) : null}
          </div>
        </div>
        <Rule variant="double" className="mb-4 mt-5" />
        <Cartouche
          cells={[
            { label: "Area", value: ha(plot.areaHa, 2) },
            { label: "Declared area", value: plot.declaredAreaHa === null ? "Not given" : ha(plot.declaredAreaHa, 2) },
            { label: "Centre", value: <Coord lat={plot.centroid[1]} lon={plot.centroid[0]} className="text-[12.5px] text-ink" /> },
            { label: "Mapped as", value: plot.kind === "point" ? "Point (≤ 4 ha)" : "Boundary" },
            { label: "Producer", value: plot.producerName || "Not given" },
            {
              label: "Boundary check",
              value: plot.validation.valid ? (
                <span className="inline-flex items-center gap-1.5 text-compliant-fg">
                  <Glyph tone="compliant" size={9} /> Meets EUDR rules
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-noncompliant-fg">
                  <Glyph tone="noncompliant" size={9} /> Needs correction
                </span>
              ),
            },
          ]}
        />
        {plot.validation.issues.length ? (
          <ul className="mt-3 grid gap-1">
            {plot.validation.issues.map((i) => (
              <li key={i.code + i.message} className="flex items-start gap-2 text-[14px] text-ink-muted">
                <Glyph tone={i.severity === "error" ? "noncompliant" : "review"} size={9} className="mt-[6px]" label={i.severity === "error" ? "Error" : "Warning"} />
                {i.message}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-12">
        {/* ── Left: the ground ───────────────────────────────────────────── */}
        <div className="grid min-w-0 content-start gap-10 lg:col-span-7">
          <Sec n="01" title="Survey" aside={<span className="numerals text-[11px] text-ink-subtle">{plot.kind === "point" ? "Footprint drawn from the declared area" : "Boundary as mapped by the supplier"}</span>}>
            <div className="border border-ink/60 bg-sheet-2 p-1">
              <PlotMap
                data={fc}
                selectedId={plot.id}
                initialBasemap="satellite"
                maxFitZoom={16.5}
                hoverCard={false}
                compact
                survey
                className="h-[320px] sm:h-[420px]"
                ariaLabel={`Satellite map of plot ${plot.reference}`}
              />
            </div>
          </Sec>

          <Sec n="02" title="Before / after">
            <ImageCompare plotId={plot.id} version={a?.id} />
            <p className="mt-2 text-center text-[13.5px] italic text-ink-muted">
              Satellite imagery at the cut-off, 31 December 2020, against the latest image. Drag the divider or use the arrow keys.
            </p>
          </Sec>

          <Sec n="03" title="Forest loss by year">
            {a ? (
              <>
                <div className="mb-6 grid grid-cols-3 gap-5">
                  <Figure label="Forest at end of 2020" value={num(a.forest2020Ha, 2)} unit="ha" sub={`${share(a.forest2020Share)} of the plot`} size="sm" />
                  <Figure label="Lost after the cut-off" value={num(a.lossAfter2020Ha, 2)} unit="ha" tone={(a.lossAfter2020Ha ?? 0) > 0 ? "noncompliant" : undefined} sub="Since 1 January 2021" size="sm" />
                  <Figure label="Tree cover in 2000" value={a.treeCover2000Pct === null ? "–" : num(a.treeCover2000Pct)} unit={a.treeCover2000Pct === null ? undefined : "%"} sub="Long-term context" size="sm" />
                </div>
                <LossChart byYear={a.lossByYear} />
              </>
            ) : (
              <p className="text-[14.5px] italic text-ink-muted">Not checked yet. Run the check to see forest evidence for this plot.</p>
            )}
          </Sec>
        </div>

        {/* ── Right: the judgement ───────────────────────────────────────── */}
        <div className="grid min-w-0 content-start gap-10 lg:col-span-5">
          <Sec n="04" title="Verdict">
            <div className="flex items-start gap-3.5">
              <Glyph tone={meta.tone} size={26} className="mt-1" label={meta.label} />
              <div className="min-w-0">
                <p className={cn("label-caps", toneText[meta.tone])}>{meta.label}</p>
                <p className="mt-1 text-[24px] leading-tight tracking-[-0.01em] text-ink">{a?.headline ?? plot.headline ?? meta.description}</p>
                {a ? <p className="mt-1 text-[13.5px] italic text-ink-muted">Checked {relative(a.createdAt)}</p> : null}
              </div>
            </div>
            {a?.reasons.length ? (
              <ul className="mt-4 border-t border-ink/60">
                {a.reasons.map((r) => (
                  <li key={r.code + r.message} className="flex gap-2.5 border-b border-rule py-2.5 text-[15px] leading-snug">
                    <Glyph tone={reasonTone[r.severity]} size={10} className="mt-[6px]" label={reasonLabel[r.severity]} />
                    <span>{r.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {a ? (
              <div className="mt-4 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="label-caps text-ink-muted">Land-change signal · second opinion</span>
                  <ChangeBadge level={a.changeLevel} />
                </div>
                {agree ? <Callout tone={agree.tone}>{agree.text}</Callout> : null}
              </div>
            ) : null}
          </Sec>

          <Sec n="05" title="Reviewer decision" id="review">
            {a?.review ? (
              <Callout tone="brand" title={`${a.review.reviewerName} · ${relative(a.review.reviewedAt)}`} className="mb-4">
                “{a.review.note}”
              </Callout>
            ) : (
              <p className="mb-4 text-[15px] italic text-ink-muted">
                {plot.reviewRequired ? "This plot waits for a reviewer. Confirm what the forest maps show, overturn it, or ask the supplier." : "No review is needed. A reviewer can still record a decision."}
              </p>
            )}
            {can("plots:review") ? (
              <ReviewActions plotId={plot.id} reference={plot.reference} verdict={plot.verdict} assessment={a} size="md" />
            ) : (
              <p className="text-[14px] italic text-ink-muted">Decisions are recorded by colleagues with the reviewer role.</p>
            )}
          </Sec>

          <Sec n="06" title="Check history">
            <History plotId={plot.id} />
            <p className="mt-4 text-[13.5px] italic leading-relaxed text-ink-muted">
              Checks are reproducible: the same boundary and data versions give the same verdict, and the check codes let an auditor confirm nothing changed.
            </p>
          </Sec>

          <Sec n="07" title="Shipments using this plot">
            {plot.shipments.length ? (
              <ol className="border-t border-ink/60">
                {plot.shipments.map((s) => (
                  <li key={s.id} className="border-b border-rule">
                    <Link href={`/app/shipments/${s.id}`} className="flex items-center justify-between gap-3 px-1 py-2 outline-none hover:bg-sheet-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span className="numerals text-[13px] text-ink">{s.reference}</span>
                      <span className="numerals text-[12.5px] text-ink-muted">{kg(s.quantityKg)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[14.5px] italic text-ink-muted">Not part of any shipment yet.</p>
            )}
          </Sec>

          <Sec n="08" title="Similar-looking plots">
            <Similar plotId={plot.id} />
          </Sec>
        </div>
      </div>

      <footer className="mt-12 border-t-[3px] border-double border-ink/60 pt-4 text-[13.5px] italic leading-relaxed text-ink-muted">
        The verdict rests on the official forest maps: the EU JRC Global Forest Cover 2020 map shows where forest stood at the cut-off, and Hansen Global Forest
        Change shows loss in each year since. The land-change signal from Copernicus Sentinel-2 imagery is a second opinion; when it disagrees, a reviewer decides.
      </footer>
    </PageContainer>
  );
}
