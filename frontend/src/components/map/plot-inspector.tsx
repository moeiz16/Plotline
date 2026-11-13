"use client";

import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LossChart } from "@/components/charts/loss-chart";
import { checkCode } from "@/components/domain/check-code";
import { ImageCompare } from "@/components/domain/image-compare";
import { ReviewActions } from "@/components/domain/review-actions";
import { ChangeBadge, CountryLabel, VERDICT_META } from "@/components/domain/status";
import { StaggerItem, StaggerList } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Callout, DefinitionList, ErrorState, Glyph, LoadingBlock, Skeleton } from "@/components/ui/display";
import { usePlot } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import { commodityLabel, ha, num, relative, share } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CUTOFF_YEAR } from "./plot-style";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <StaggerItem as="section" className="mt-5">
      <div className="mb-2 flex items-center gap-2.5">
        <h3 className="label-caps shrink-0 text-ink">{title}</h3>
        <span aria-hidden className="h-px flex-1 bg-rule-strong" />
        {aside}
      </div>
      {children}
    </StaggerItem>
  );
}

/**
 * The Atlas inspector: one plot as a field card beside the map. Before/after imagery (synced to the
 * time ruler), the verdict glyph and headline, the evidence lines, loss by year, the reviewer's action
 * and a link to the full record.
 */
export function PlotInspector({
  plotId,
  year,
  position,
  onClose,
  onStep,
  className,
}: {
  plotId: string;
  year: number;
  position?: { index: number; total: number };
  onClose: () => void;
  onStep: (dir: -1 | 1) => void;
  className?: string;
}) {
  const q = usePlot(plotId);
  const { can } = useSession();
  const p = q.data;
  const a = p?.latestAssessment ?? null;
  const meta = VERDICT_META[p?.verdict ?? "pending"];

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="flex items-center gap-2 border-b border-ink/70 px-4 py-2.5">
        <div className="flex items-center">
          <Button size="icon-sm" variant="ghost" onClick={() => onStep(-1)} aria-label="Previous plot ( [ )">
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => onStep(1)} aria-label="Next plot ( ] )">
            <ChevronRight />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="numerals truncate text-[14px] font-medium text-ink">{p?.reference ?? "Plot"}</p>
          {position ? (
            <p className="label-caps text-ink-subtle" style={{ fontSize: 10 }}>
              Sheet {String(position.index + 1).padStart(2, "0")} of {String(position.total).padStart(2, "0")}
            </p>
          ) : null}
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close the inspector (Esc)">
          <X />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 scrollbar-thin">
        {q.isPending ? (
          <div role="status" aria-label="Opening plot">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-3 h-6 w-full" />
            <Skeleton className="mt-4 aspect-square w-full" />
            <LoadingBlock rows={4} className="mt-4" />
          </div>
        ) : q.isError || !p ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this plot" />
        ) : (
          <StaggerList as="div" key={p.id}>
            <StaggerItem as="div">
              <p className="flex flex-wrap items-center gap-x-1.5 text-[14px] italic text-ink-muted">
                <Link href={`/app/suppliers/${p.supplierId}`} className="not-italic text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                  {p.supplierName}
                </Link>
                <span aria-hidden>·</span>
                {commodityLabel(p.commodity)}
                <span aria-hidden>·</span>
                <CountryLabel code={p.country} name={p.countryName} />
              </p>
              <div className="mt-3 flex items-start gap-3 border-y border-rule py-3">
                <Glyph tone={meta.tone} size={20} className="mt-1" label={meta.label} />
                <div className="min-w-0">
                  <p className={cn("label-caps", { compliant: "text-compliant-fg", review: "text-review-fg", noncompliant: "text-noncompliant-fg", pending: "text-pending-fg", neutral: "text-ink-muted", brand: "text-marker-ink" }[meta.tone])}>{meta.label}</p>
                  <p className="mt-0.5 text-[20px] leading-snug tracking-[-0.01em] text-ink">{a?.headline ?? p.headline ?? meta.description}</p>
                </div>
              </div>
            </StaggerItem>

            <Section title="Before / after">
              <ImageCompare plotId={p.id} version={a?.id} compact stage={year <= CUTOFF_YEAR ? "baseline" : "compare"} />
              <p className="mt-1.5 text-[12.5px] italic text-ink-muted">
                {year <= CUTOFF_YEAR ? "The time ruler is on or before the cut-off, so the 2020 image is shown." : "Drag the divider, or focus it and use the arrow keys."}
              </p>
            </Section>

            <Section title="Evidence">
              {a ? (
                <DefinitionList
                  className="[&>div]:py-2 [&>div]:text-[14px]"
                  items={[
                    { label: "Forest at end of 2020", value: <span className="numerals text-[13px]">{ha(a.forest2020Ha, 1)} ({share(a.forest2020Share)})</span> },
                    {
                      label: "Lost after the cut-off",
                      value: <span className={cn("numerals text-[13px]", (a.lossAfter2020Ha ?? 0) > 0 && "text-noncompliant-fg")}>{ha(a.lossAfter2020Ha, 2)}</span>,
                    },
                    {
                      label: "Land-change signal",
                      value: (
                        <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5">
                          <ChangeBadge level={a.changeLevel} />
                          <span className="text-[12.5px] italic text-ink-subtle">second opinion</span>
                        </span>
                      ),
                    },
                    { label: "Cloud-free imagery", value: <span className="numerals text-[13px]">{share(a.cloudFreeShare)}</span> },
                    { label: "Check code", value: <span className="numerals text-[13px]">{checkCode(a.resultHash)}</span> },
                  ]}
                />
              ) : (
                <p className="text-[14px] italic text-ink-muted">Not checked yet. The evidence appears after the first check.</p>
              )}
            </Section>

            {a ? (
              <Section title="Loss by year" aside={<span className="numerals text-[11px] text-ink-subtle">{year}</span>}>
                <LossChart byYear={a.lossByYear} year={year} compact />
              </Section>
            ) : null}

            <Section title="Reviewer">
              {a?.review ? (
                <Callout tone="brand" title={`Reviewed by ${a.review.reviewerName} · ${relative(a.review.reviewedAt)}`} className="mb-3">
                  “{a.review.note}”
                </Callout>
              ) : (
                <p className="mb-3 text-[14px] italic text-ink-muted">
                  {p.reviewRequired
                    ? "The forest maps and the land-change signal need a person’s judgement before this plot can be used."
                    : `No review is needed${a ? `; checked ${relative(a.createdAt)}` : ""}.`}
                </p>
              )}
              {can("plots:review") ? <ReviewActions plotId={p.id} reference={p.reference} verdict={p.verdict} assessment={a} /> : null}
            </Section>

            <StaggerItem as="div" className="mt-5 border-t border-ink/70 pt-3">
              <Link
                href={`/app/plots/${p.id}`}
                className="group flex items-center justify-between gap-2 font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink outline-none hover:text-marker-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open the full record
                <ArrowRight aria-hidden className="size-4 transition-transform duration-[var(--dur-fast)] group-hover:translate-x-1" />
              </Link>
              <p className="mt-1 text-[12.5px] italic text-ink-muted">
                {num(p.areaHa, 2)} ha · {p.kind === "point" ? "mapped as a point" : "mapped as a boundary"} · {p.shipments.length ? `in ${p.shipments.length} shipment${p.shipments.length === 1 ? "" : "s"}` : "in no shipment yet"}
              </p>
            </StaggerItem>
          </StaggerList>
        )}
      </div>
    </div>
  );
}
