"use client";

import {
  ArrowLeft,
  ChevronDown,
  CircleCheck,
  CircleX,
  Info,
  MessageSquareText,
  OctagonX,
  RotateCw,
  Scale,
  TriangleExclamationPoint,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LossChart } from "@/components/charts/loss-chart";
import { ImageCompare } from "@/components/domain/image-compare";
import { ChangeBadge, CountryLabel, RiskBadge, VerdictBadge, VERDICT_META } from "@/components/domain/status";
import { PlotMap } from "@/components/map/plot-map";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DefinitionList,
  EmptyState,
  ErrorState,
  Meter,
  Skeleton,
} from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useAssessPlot, useAssessments, usePlot, useReviewPlot, useSimilarPlots } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Assessment, Plot, PlotFeatureCollection, Reason, ReviewDecision } from "@/lib/api/types";
import { commodityLabel, dateTime, ha, kg, num, relative, share } from "@/lib/format";
import { cn } from "@/lib/utils";

const reasonIcon: Record<Reason["severity"], React.ReactNode> = {
  info: <Info className="size-4 text-brand" aria-hidden />,
  warning: <TriangleExclamationPoint className="size-4 text-review" aria-hidden />,
  critical: <OctagonX className="size-4 text-noncompliant" aria-hidden />,
};
const reasonLabel: Record<Reason["severity"], string> = { info: "Note", warning: "Warning", critical: "Critical" };

const DECISIONS: Record<ReviewDecision, { label: string; title: string; help: string; icon: React.ReactNode; tone: "primary" | "secondary" | "danger-outline" }> = {
  confirm_compliant: {
    label: "Confirm compliant",
    title: "Confirm this plot as compliant",
    help: "You’ve checked the evidence and are satisfied no forest was cleared on this plot after 31 December 2020.",
    icon: <CircleCheck />,
    tone: "primary",
  },
  confirm_non_compliant: {
    label: "Confirm non-compliant",
    title: "Confirm this plot as non-compliant",
    help: "Product from this plot will be blocked from shipments to the EU market.",
    icon: <CircleX />,
    tone: "danger-outline",
  },
  request_information: {
    label: "Request information",
    title: "Ask the supplier for more information",
    help: "The supplier is asked to explain or correct the plot. It stays in review until they respond.",
    icon: <MessageSquareText />,
    tone: "secondary",
  },
};

function datasetRows(a: Assessment) {
  return [
    { label: "Forest map (2020)", value: a.datasets.forest2020 },
    { label: "Forest loss data", value: a.datasets.forestLoss },
    { label: "Imagery source", value: a.datasets.imagery },
    { label: "Land-change check version", value: a.datasets.changeModel },
    { label: "Rule set version", value: a.datasets.rules },
  ];
}

function ReviewPanel({ plot }: { plot: Plot }) {
  const review = useReviewPlot(plot.id);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const meta = decision ? DECISIONS[decision] : null;
  return (
    <Card id="review" className="scroll-mt-20">
      <CardHeader title="Your review" icon={<Scale />} description={plot.reviewRequired ? "This plot is waiting for a reviewer’s decision." : "Record a decision on this plot."} />
      <CardBody className="grid gap-2">
        {(Object.keys(DECISIONS) as ReviewDecision[]).map((d) => (
          <Button
            key={d}
            variant={DECISIONS[d].tone}
            className="w-full justify-start"
            onClick={() => {
              setDecision(d);
              setNote("");
              setError(null);
            }}
          >
            {DECISIONS[d].icon} {DECISIONS[d].label}
          </Button>
        ))}
      </CardBody>
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        {meta && decision ? (
          <DialogContent title={meta.title} description={meta.help} size="sm">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (note.trim().length < 3) {
                  setError("Add a short note explaining your decision. It is kept in the plot’s history.");
                  return;
                }
                try {
                  await review.mutateAsync({ decision, note: note.trim() });
                  setDecision(null);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Couldn’t save your decision.");
                }
              }}
            >
              <Field label={decision === "request_information" ? "What do you need from the supplier?" : "Note for the record"} htmlFor="review-note" error={error}>
                <Textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} autoFocus rows={4} aria-invalid={!!error} />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Cancel</Button>
                </DialogClose>
                <Button type="submit" variant={decision === "confirm_non_compliant" ? "danger" : "primary"} loading={review.isPending}>
                  {meta.label}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

function History({ plotId }: { plotId: string }) {
  const q = useAssessments(plotId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Check history" description="Every check on this plot, newest first, with the data it used." />
      {q.isPending ? (
        <CardBody>
          <Skeleton className="h-24" />
        </CardBody>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState title="Not checked yet" body="Run the check to see the first result." />
      ) : (
        <ol className="divide-y divide-border">
          {q.data.map((a, i) => {
            const isOpen = open === a.id || (open === null && i === 0);
            return (
              <li key={a.id} className="px-4 py-3 sm:px-5">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? "" : a.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <VerdictBadge verdict={a.verdict} />
                      {i === 0 ? <Badge tone="brand">Latest</Badge> : null}
                      <span className="text-xs text-muted">{dateTime(a.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-sm">{a.headline}</p>
                    {a.review ? (
                      <p className="mt-1 text-[13px] text-muted">
                        Reviewed by {a.review.reviewerName}: “{a.review.note}”
                      </p>
                    ) : null}
                  </div>
                  <ChevronDown className={cn("mt-1 size-4 shrink-0 text-subtle transition-transform duration-150", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen ? (
                  <div className="mt-3 rounded-md border border-border bg-surface-2/50 px-3 py-1">
                    <p className="pt-2 text-xs font-medium text-muted">Data versions used</p>
                    <DefinitionList items={datasetRows(a).map((r) => ({ label: r.label, value: <span className="font-mono text-xs">{r.value}</span> }))} />
                    <DefinitionList
                      className="border-t border-border"
                      items={[
                        { label: "Imagery", value: a.source === "live" ? "Live satellite data" : "Stored demo imagery" },
                        { label: "Input fingerprint", value: <span className="font-mono text-xs" title={a.inputsHash}>{a.inputsHash.slice(0, 16)}…</span> },
                        { label: "Result fingerprint", value: <span className="font-mono text-xs" title={a.resultHash}>{a.resultHash.slice(0, 16)}…</span> },
                      ]}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted sm:px-5">
        Checks are reproducible: running one again with the same plot boundary and the same data versions gives the same verdict. The fingerprints let an
        auditor confirm that nothing changed.
      </p>
    </Card>
  );
}

function Similar({ plotId }: { plotId: string }) {
  const q = useSimilarPlots(plotId);
  return (
    <Card>
      <CardHeader title="Similar-looking plots" description="Plots whose satellite imagery looks most like this one." />
      {q.isPending ? (
        <CardBody>
          <Skeleton className="h-28" />
        </CardBody>
      ) : q.isError ? (
        <p className="px-5 py-4 text-sm text-muted">Similar plots aren’t available right now.</p>
      ) : !q.data.length ? (
        <p className="px-5 py-4 text-sm text-muted">No similar plots found yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((s) => (
            <li key={s.plot.id}>
              <Link href={`/app/plots/${s.plot.id}`} className="flex items-center gap-3 px-4 py-2.5 outline-none hover:bg-surface-2 focus-visible:bg-surface-2 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] font-medium">{s.plot.reference}</p>
                  <p className="truncate text-xs text-muted">{s.plot.supplierName}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <VerdictBadge verdict={s.plot.verdict} />
                  <span className="text-[11px] tabular text-muted">{Math.round(s.similarity * 100)}% alike</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function agreementText(a: Assessment) {
  if (a.changeLevel === null || a.signalsAgree === null)
    return { tone: "pending" as const, text: "Recent imagery was too cloudy for a land-change check, so this verdict rests on the official forest maps alone." };
  if (a.signalsAgree) return { tone: "compliant" as const, text: "The land-change check agrees with the official forest maps." };
  return {
    tone: "review" as const,
    text: "The land-change check disagrees with the official forest maps. A reviewer must confirm the verdict before this plot can be used.",
  };
}

export default function PlotPage() {
  const { id } = useParams<{ id: string }>();
  const q = usePlot(id);
  const assess = useAssessPlot(id);
  const { can } = useSession();
  const plot = q.data;
  const a = plot?.latestAssessment ?? null;

  const fc = useMemo<PlotFeatureCollection | undefined>(
    () =>
      plot
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: plot.geometry,
                properties: {
                  id: plot.id,
                  reference: plot.reference,
                  verdict: plot.verdict,
                  commodity: plot.commodity,
                  supplierName: plot.supplierName,
                  areaHa: plot.areaHa,
                  kind: plot.kind,
                },
              },
            ],
          }
        : undefined,
    [plot],
  );

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-4 h-8 w-64" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </PageContainer>
    );
  if (q.isError || !plot)
    return (
      <PageContainer>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this plot" />
        </Card>
      </PageContainer>
    );

  const agree = a ? agreementText(a) : null;
  const meta = VERDICT_META[plot.verdict];

  return (
    <PageContainer wide>
      <Link href="/app/plots" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Plots
      </Link>
      <div className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-[-0.01em] sm:text-2xl">{plot.reference}</h1>
            <VerdictBadge verdict={plot.verdict} />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <Link href={`/app/suppliers/${plot.supplierId}`} className="font-medium text-fg hover:underline">
              {plot.supplierName}
            </Link>
            <span aria-hidden>·</span>
            <span>{commodityLabel(plot.commodity)}</span>
            <span aria-hidden>·</span>
            <CountryLabel code={plot.country} name={plot.countryName} />
            <RiskBadge tier={plot.riskTier} />
          </p>
        </div>
        {can("plots:write") ? (
          <Button onClick={() => assess.mutate()} loading={assess.isPending}>
            {!assess.isPending ? <RotateCw /> : null} Re-run check
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <PlotMap
              data={fc}
              selectedId={plot.id}
              initialBasemap="satellite"
              maxFitZoom={17}
              hoverCard={false}
              compact
              className="h-72 sm:h-96"
              ariaLabel={`Map of plot ${plot.reference}`}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-xs text-muted sm:px-5">
              <span>{plot.kind === "point" ? "Mapped as a point (plots up to 4 ha)" : "Mapped as a boundary"}</span>
              <span>
                Centre {plot.centroid[1].toFixed(5)}, {plot.centroid[0].toFixed(5)}
              </span>
            </div>
          </Card>

          <Card>
            <CardHeader title="Before and after" description="Satellite imagery from 2020, the regulation’s cut-off year, compared with the latest image." />
            <CardBody>
              <ImageCompare plotId={plot.id} version={a?.id} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Forest evidence" description="From the official forest maps, which decide the verdict." />
            {a ? (
              <CardBody className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[13px] text-muted">Forest in 2020</p>
                    <p className="mt-1 text-2xl font-semibold tabular">{ha(a.forest2020Ha, 2)}</p>
                    <p className="text-xs text-muted">{share(a.forest2020Share)} of the plot</p>
                    <Meter value={(a.forest2020Share ?? 0) * 100} tone="compliant" className="mt-2" label="Share of plot that was forest in 2020" />
                  </div>
                  <div>
                    <p className="text-[13px] text-muted">Forest lost since 2021</p>
                    <p className={cn("mt-1 text-2xl font-semibold tabular", (a.lossAfter2020Ha ?? 0) > 0 && "text-noncompliant-fg")}>{ha(a.lossAfter2020Ha, 2)}</p>
                    <p className="text-xs text-muted">After the 31 Dec 2020 cut-off</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-muted">Tree cover in 2000</p>
                    <p className="mt-1 text-2xl font-semibold tabular">{a.treeCover2000Pct === null ? "–" : `${num(a.treeCover2000Pct)}%`}</p>
                    <p className="text-xs text-muted">Long-term context</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[13px] font-medium">Forest lost per year (ha)</p>
                  <LossChart byYear={a.lossByYear} className="h-44" />
                </div>
              </CardBody>
            ) : (
              <EmptyState title="Not checked yet" body="Run the check to see forest evidence for this plot." />
            )}
          </Card>

          <History plotId={plot.id} />
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader title="Verdict" />
            <CardBody>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
                    { compliant: "bg-compliant-soft text-compliant-fg", review: "bg-review-soft text-review-fg", noncompliant: "bg-noncompliant-soft text-noncompliant-fg", pending: "bg-pending-soft text-pending-fg", neutral: "", brand: "" }[meta.tone],
                  )}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{meta.label}</p>
                  <p className="text-sm text-muted">{a?.headline ?? plot.headline ?? meta.description}</p>
                </div>
              </div>
              {a?.reasons.length ? (
                <ul className="mt-4 grid gap-2.5 border-t border-border pt-4">
                  {a.reasons.map((r) => (
                    <li key={r.code + r.message} className="flex gap-2.5 text-sm">
                      <span className="mt-0.5 shrink-0" title={reasonLabel[r.severity]}>
                        {reasonIcon[r.severity]}
                        <span className="sr-only">{reasonLabel[r.severity]}: </span>
                      </span>
                      <span>{r.message}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {a ? <p className="mt-4 text-xs text-muted">Checked {relative(a.createdAt)}</p> : null}
              {a?.review ? (
                <Callout tone="brand" className="mt-4" title={`Reviewed by ${a.review.reviewerName}`}>
                  “{a.review.note}” · {relative(a.review.reviewedAt)}
                </Callout>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Land-change check" description="A second opinion from recent satellite imagery." />
            <CardBody className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted">Change since 2020</span>
                <ChangeBadge level={a?.changeLevel ?? null} />
              </div>
              {a?.cloudFreeShare !== null && a?.cloudFreeShare !== undefined ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted">Cloud-free imagery</span>
                  <span className="font-medium tabular">{share(a.cloudFreeShare)}</span>
                </div>
              ) : null}
              {agree ? (
                <Callout tone={agree.tone} className="mt-1">
                  {agree.text}
                </Callout>
              ) : null}
              <details className="group rounded-md border border-border px-3 py-2 text-[13px]">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span className="inline-flex items-center gap-1.5">
                    <Info className="size-3.5 text-brand" aria-hidden /> How the verdict is decided
                  </span>
                </summary>
                <div className="mt-2 grid gap-2 leading-relaxed text-muted">
                  <p>
                    The legal verdict rests on official forest maps: the EU JRC Global Forest Cover 2020 map shows where forest stood at the cut-off date, and
                    Hansen Global Forest Change shows tree-cover loss in each year since.
                  </p>
                  <p>
                    The land-change check compares recent Copernicus Sentinel-2 imagery with how the plot looked in 2020. It is a second opinion only. When it
                    disagrees with the official maps, the plot goes to a reviewer rather than being decided automatically.
                  </p>
                </div>
              </details>
            </CardBody>
          </Card>

          {can("plots:review") ? <ReviewPanel plot={plot} /> : null}

          <Card>
            <CardHeader title="Plot details" />
            <CardBody className="py-1">
              <DefinitionList
                items={[
                  { label: "Area", value: ha(plot.areaHa, 2) },
                  { label: "Declared area", value: plot.declaredAreaHa === null ? "Not given" : ha(plot.declaredAreaHa, 2) },
                  { label: "Producer reference", value: plot.producerName || "Not given" },
                  { label: "Mapped", value: relative(plot.createdAt) },
                  {
                    label: "Boundary check",
                    value: plot.validation.valid ? (
                      <span className="text-compliant-fg">Meets EUDR rules</span>
                    ) : (
                      <span className="text-noncompliant-fg">Needs correction</span>
                    ),
                  },
                ]}
              />
              {plot.validation.issues.length ? (
                <ul className="mb-3 grid gap-1.5">
                  {plot.validation.issues.map((i) => (
                    <li key={i.code + i.message} className="flex gap-2 text-[13px]">
                      {i.severity === "error" ? (
                        <CircleX className="mt-0.5 size-3.5 shrink-0 text-noncompliant" aria-label="Error" />
                      ) : (
                        <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0 text-review" aria-label="Warning" />
                      )}
                      {i.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Shipments using this plot" />
            {plot.shipments.length ? (
              <ul className="divide-y divide-border">
                {plot.shipments.map((s) => (
                  <li key={s.id}>
                    <Link href={`/app/shipments/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2 sm:px-5">
                      <span className="font-mono text-[13px] font-medium">{s.reference}</span>
                      <span className="tabular text-muted">{kg(s.quantityKg)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Not part of any shipment yet.</p>
            )}
          </Card>

          <Similar plotId={plot.id} />
        </div>
      </div>
    </PageContainer>
  );
}
