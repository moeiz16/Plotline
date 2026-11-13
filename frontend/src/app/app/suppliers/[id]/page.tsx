"use client";

import { useQueries } from "@tanstack/react-query";
import { FileUp, Link2, Mail, PenLine } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { FILE_HINT, FILE_INPUT_CLASS, ImportResultView } from "@/components/domain/import-result";
import { PlotDrawForm } from "@/components/domain/plot-draw-form";
import { CountryLabel, RISK_META, StageBadge, STAGE_META, VerdictBadge } from "@/components/domain/status";
import { dMinus, stampDate } from "@/components/ledger/format";
import { FormBox, FormGrid, LandingStamp, Perforation } from "@/components/ledger/paper";
import { PlotSketch } from "@/components/ledger/sketch";
import { PlotTally } from "@/components/ledger/tally";
import { CountUp } from "@/components/motion";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, CopyField, ErrorState, Glyph, PageHeader, SectionTitle, Skeleton } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { api } from "@/lib/api/client";
import { qk, useCampaigns, useCreatePlot, useImportPlots, usePlotsMap, usePortalLink, useSupplier, useValidatePlot } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Campaign, CampaignStage, Commodity, ImportResult, SupplierDetail } from "@/lib/api/types";
import { SUPPLIER_KIND_LABEL, commodityLabel, dateLong, ha, num } from "@/lib/format";
import { absoluteUrl, cn } from "@/lib/utils";

/* ── Request slip: the upload link creation flow, inline on the dossier ─────── */
function RequestSlip({ supplier, canWrite }: { supplier: SupplierDetail; canWrite: boolean }) {
  const link = usePortalLink();
  const url = link.data ? absoluteUrl(link.data.url) : null;
  return (
    <div className="relative border border-ink/50 bg-sheet">
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-ink/50 px-4 py-2.5">
        <span className="label-caps shrink-0 text-ink">Data request slip</span>
        <span className="numerals min-w-0 truncate text-[11px] uppercase text-ink-muted">For {supplier.name}</span>
      </div>
      <div className="grid gap-3 px-4 py-4">
        {url ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px]">Upload link issued. Send it to {supplier.name}.</p>
              <LandingStamp tone="compliant" angle={-5}>
                Issued {stampDate(new Date().toISOString())}
              </LandingStamp>
            </div>
            <CopyField value={url} label="Copy upload link" />
            <p className="text-[14px] italic text-ink-muted">
              Valid until {dateLong(link.data!.expiresAt)}. Any earlier link for this supplier stops working, and a fresh link reopens submissions if they sent plots before.
            </p>
            {supplier.contactEmail ? (
              <Button asChild variant="secondary" className="justify-self-start">
                <a
                  href={`mailto:${supplier.contactEmail}?subject=${encodeURIComponent("Please map your plots for EUDR")}&body=${encodeURIComponent(
                    `Hello,\n\nPlease add your farm plots using this link:\n${url}\n\nThank you.`,
                  )}`}
                >
                  <Mail /> Draft an email to {supplier.contactEmail}
                </a>
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed">
              A private link lets {supplier.name} map their plots from a phone, without an account. Plots are checked against the EUDR location rules as they are drawn.
            </p>
            {link.isError ? (
              <p role="alert" className="flex items-center gap-1.5 text-[14px] text-noncompliant-fg">
                <Glyph tone="noncompliant" /> We couldn’t issue the link. Please try again.
              </p>
            ) : null}
            {canWrite ? (
              <Button variant="primary" className="justify-self-start" loading={link.isPending} onClick={() => link.mutate(supplier.id)}>
                <Link2 /> Create upload link
              </Button>
            ) : (
              <p className="text-[14px] italic text-ink-muted">Ask someone in sourcing to issue a link.</p>
            )}
          </>
        )}
      </div>
      <Perforation label="Stub" className="px-4" />
      <dl className="grid grid-cols-2 gap-x-4 px-4 pb-3 pt-2">
        <div>
          <dt className="label-caps text-ink-subtle">Status</dt>
          <dd className="mt-1">{supplier.status === "active" ? <Badge tone="brand">Plots on file</Badge> : <Badge tone="pending">Invited, nothing sent</Badge>}</dd>
        </div>
        <div>
          <dt className="label-caps text-ink-subtle">Plots on file</dt>
          <dd className="numerals mt-1 text-[12.5px]">{Array.isArray(supplier.plots) ? supplier.plots.length : 0}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ── Route stops: the campaigns this supplier is on ─────────────────────────── */
const STOPS: CampaignStage[] = ["requested", "reminded", "submitted", "assessing", "awaiting_review", "approved"];

function CampaignStops({ supplierId }: { supplierId: string }) {
  const list = useCampaigns();
  const ids = (list.data ?? []).slice(0, 8).map((c) => c.id);
  const details = useQueries({
    queries: ids.map((id) => ({ queryKey: qk.campaign(id), queryFn: () => api.get<Campaign>(`/campaigns/${id}`) })),
  });
  const mine = details
    .map((d) => d.data)
    .filter((c): c is Campaign => !!c)
    .map((c) => ({ c, m: c.members.find((m) => m.supplierId === supplierId) }))
    .filter((x) => !!x.m);
  const loading = list.isPending || details.some((d) => d.isPending);

  return (
    <div>
      <SectionTitle>Data requests</SectionTitle>
      {loading ? (
        <Skeleton className="h-16" />
      ) : !mine.length ? (
        <p className="border border-dashed border-rule-strong px-4 py-5 text-[15px] italic text-ink-muted">Not on any campaign route. Add them to a campaign to send automatic reminders.</p>
      ) : (
        <ul className="grid gap-3">
          {mine.map(({ c, m }) => {
            const at = STAGE_META[m!.stage]?.step ?? 0;
            const trouble = m!.stage === "overdue" || m!.stage === "changes_requested";
            return (
              <li key={c.id}>
                <Link href={`/app/campaigns/${c.id}`} className="block border border-rule bg-sheet px-4 py-3 outline-none transition-colors hover:border-ink focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[16px] font-medium">{c.name}</p>
                    <span className="numerals text-[11.5px] text-ink-muted">
                      DUE {stampDate(c.dueDate)} · {dMinus(c.dueDate)}
                    </span>
                  </div>
                  <ol className="mt-3 flex items-center" aria-label={`Stage: ${STAGE_META[m!.stage].label}`}>
                    {STOPS.map((s, i) => {
                      const done = i < at || m!.stage === "approved";
                      const here = i === at && m!.stage !== "approved";
                      return (
                        <li key={s} className="flex flex-1 items-center last:flex-none">
                          <Glyph tone={done ? "compliant" : here ? (trouble ? (m!.stage === "overdue" ? "noncompliant" : "review") : "brand") : "pending"} size={10} />
                          {i < STOPS.length - 1 ? <span className={cn("mx-1 h-0 flex-1 border-t", done ? "border-ink" : "border-dashed border-rule-strong")} /> : null}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <StageBadge stage={m!.stage} />
                    <span className="numerals text-[11px] text-ink-subtle">
                      {m!.plotsSubmitted} PLOTS SENT · {m!.remindersSent} REMINDERS
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Dialogs: map a plot, import a file ─────────────────────────────────────── */
function MapPlotDialog({ supplier }: { supplier: SupplierDetail }) {
  const [open, setOpen] = useState(false);
  const validate = useValidatePlot();
  const create = useCreatePlot();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PenLine /> Map a plot
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="xl"
          title="Map a plot"
          description={`Stake a plot for ${supplier.name}. It is read against EUDR location rules as you draw, then checked for forest loss once saved.`}
        >
          {open ? (
            <PlotDrawForm
              country={supplier.country}
              commodities={supplier.commodities}
              existing={Array.isArray(supplier.plots) ? supplier.plots : []}
              validate={(body) => validate.mutateAsync(body)}
              create={(d) => create.mutateAsync({ ...d, supplierId: supplier.id, country: supplier.country })}
              saving={create.isPending}
              showProducer
              mapClassName="h-[46dvh] max-h-[440px] min-h-[260px]"
              onSaved={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImportDialog({ supplier }: { supplier: SupplierDetail }) {
  const imp = useImportPlots();
  const [open, setOpen] = useState(false);
  const [commodity, setCommodity] = useState<Commodity>(supplier.commodities[0] ?? "cocoa");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a file to upload.");
    setError(null);
    try {
      setResult(await imp.mutateAsync({ file, supplierId: supplier.id, commodity }));
    } catch {
      /* toast shown by the hook */
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          setResult(null);
          setFile(null);
          setError(null);
        }}
      >
        <FileUp /> Import plots
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Import plots from a file" description={`Add plots for ${supplier.name}. Each line is read against EUDR location rules as it comes in.`}>
          {result ? (
            <>
              <ImportResultView result={result} />
              <DialogFooter>
                <Button onClick={() => setResult(null)}>Import another file</Button>
                <DialogClose asChild>
                  <Button variant="primary">Done</Button>
                </DialogClose>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <Field label="Commodity grown on these plots" htmlFor="imp-commodity">
                <Select id="imp-commodity" value={commodity} onChange={(e) => setCommodity(e.target.value as Commodity)}>
                  {(supplier.commodities.length ? supplier.commodities : (["cocoa"] as Commodity[])).map((c) => (
                    <option key={c} value={c}>
                      {commodityLabel(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="File" htmlFor="imp-file" hint={FILE_HINT} error={error}>
                <input id="imp-file" type="file" accept=".geojson,.json,.kml,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={FILE_INPUT_CLASS} />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Cancel</Button>
                </DialogClose>
                <Button type="submit" variant="primary" loading={imp.isPending}>
                  Import
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── The dossier ────────────────────────────────────────────────────────────── */
export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const q = useSupplier(id);
  const map = usePlotsMap({ supplierId: id });
  const { can } = useSession();
  const s = q.data;
  const geoms = useMemo(() => new Map((map.data?.features ?? []).map((f) => [f.properties.id, f.geometry])), [map.data]);

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="mt-6 h-40" />
        <Skeleton className="mt-6 h-56" />
      </PageContainer>
    );
  if (q.isError || !s)
    return (
      <PageContainer>
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this supplier file" />
      </PageContainer>
    );

  const plots = Array.isArray(s.plots) ? s.plots : [];
  const area = plots.reduce((n, p) => n + (p.areaHa || 0), 0);
  const risk = RISK_META[s.riskTier];

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={
          <>
            <Link href="/app/suppliers">Suppliers</Link>
            <span aria-hidden>/</span>
            <span>Dossier · {s.country}</span>
          </>
        }
        title={s.name}
        description={
          <span className="italic">
            {SUPPLIER_KIND_LABEL[s.kind] ?? s.kind} in {s.countryName}, growing {s.commodities.map(commodityLabel).join(", ").toLowerCase() || "nothing recorded yet"}.
          </span>
        }
        actions={
          can("plots:write") ? (
            <>
              <MapPlotDialog supplier={s} />
              <ImportDialog supplier={s} />
            </>
          ) : null
        }
      />

      {/* Particulars + readiness */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-label="Particulars">
          <SectionTitle>Particulars</SectionTitle>
          <FormGrid className="grid-cols-2 sm:grid-cols-3">
            <FormBox n="1" label="Kind">
              {SUPPLIER_KIND_LABEL[s.kind] ?? s.kind}
            </FormBox>
            <FormBox n="2" label="Country of production">
              <CountryLabel code={s.country} name={s.countryName} />
            </FormBox>
            <FormBox n="3" label="EU benchmark">
              <span className="inline-flex items-center gap-1.5">
                {risk.icon} {risk.label}
              </span>
            </FormBox>
            <FormBox n="4" label="Commodities">
              {s.commodities.map(commodityLabel).join(", ") || "–"}
            </FormBox>
            <FormBox n="5" label="Contact" mono>
              <span className="[overflow-wrap:anywhere]">{s.contactEmail || "NOT GIVEN"}</span>
            </FormBox>
            <FormBox n="6" label="Last upload" mono>
              {s.lastSubmissionAt ? stampDate(s.lastSubmissionAt) : "NONE YET"}
            </FormBox>
          </FormGrid>
        </section>
        <section aria-label="Readiness">
          <SectionTitle>Readiness</SectionTitle>
          <div className="flex items-end gap-4 border-t border-ink/70 pt-3">
            <CountUp value={s.readinessPct} format={(n) => `${Math.round(n)}`} className="numerals text-[56px] leading-[0.9]" />
            <div className="pb-1">
              <p className="numerals text-[18px] text-ink-muted">%</p>
              <p className="text-[14px] italic text-ink-muted">of {plots.length} plots confirmed compliant</p>
            </div>
          </div>
          <div className="mt-3">
            <PlotTally s={s} max={40} />
          </div>
          <ul className="numerals mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] uppercase text-ink-muted">
            {(
              [
                ["compliant", s.compliant, "compliant"],
                ["review", s.needsReview, "to review"],
                ["noncompliant", s.nonCompliant, "non-compliant"],
                ["pending", s.pending, "pending"],
              ] as const
            ).map(([t, n, l]) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Glyph tone={t} size={9} /> {n} {l}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Atlas strip */}
      <section aria-label="Plots on file" className="mt-10">
        <SectionTitle
          action={
            <span className="numerals text-[11.5px] text-ink-muted">
              {plots.length} PLOTS · {ha(area)} SURVEYED
            </span>
          }
        >
          Atlas strip
        </SectionTitle>
        {plots.length ? (
          <ol className="-mx-4 flex snap-x gap-0 overflow-x-auto px-4 pb-2 scrollbar-thin sm:mx-0 sm:px-0">
            {plots.map((p, i) => (
              <li key={p.id} className="w-[188px] shrink-0 snap-start border-y border-l border-rule bg-sheet last:border-r">
                <Link href={`/app/plots/${p.id}`} className="block h-full px-3 pb-3 pt-2 outline-none transition-colors hover:bg-sheet-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <div className="flex items-baseline justify-between">
                    <span className="numerals text-[10.5px] text-ink-subtle">SHEET {String(i + 1).padStart(2, "0")}</span>
                    <span className="numerals text-[10.5px] text-ink-subtle">{p.kind === "point" ? "POINT" : "BOUNDARY"}</span>
                  </div>
                  <div className="my-2 flex justify-center">
                    <PlotSketch geometry={geoms.get(p.id)} verdict={p.verdict} size={124} delay={0.15 + i * 0.18} label={`Outline of plot ${p.reference}`} />
                  </div>
                  <p className="numerals text-[13px] font-medium text-ink">{p.reference}</p>
                  <p className="numerals text-[11.5px] text-ink-muted">{ha(p.areaHa, 2)}</p>
                  <div className="mt-2">
                    <VerdictBadge verdict={p.verdict} />
                  </div>
                  {p.headline ? <p className="mt-1.5 line-clamp-2 text-[13px] italic leading-snug text-ink-muted">{p.headline}</p> : null}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col items-start gap-3 border border-dashed border-rule-strong px-5 py-8 sm:flex-row sm:items-center">
            <Glyph tone="pending" size={14} />
            <p className="flex-1 text-[16px] italic text-ink-muted">No plots on file yet. Send an upload link below, map a plot yourself, or import a file.</p>
          </div>
        )}
        {plots.length ? (
          <p className="mt-2 text-[14px] italic text-ink-muted">
            Each sheet is drawn at the plot’s own scale. Hatching marks forest cleared after 2020; a dashed edge means the check is still pending.{" "}
            <Link href={`/app?plot=${plots[0].id}`} className="not-italic text-marker-ink underline decoration-marker/50 underline-offset-4">
              See them on the atlas
            </Link>
          </p>
        ) : null}
      </section>

      {/* Data request */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-label="Upload link">
          <SectionTitle>Upload link</SectionTitle>
          <RequestSlip supplier={s} canWrite={can("suppliers:write")} />
        </section>
        <CampaignStops supplierId={s.id} />
      </div>
      <p className="numerals mt-8 text-[11px] text-ink-subtle">
        {num(plots.length)} PLOTS · {num(s.compliant)} COMPLIANT · FILED UNDER {s.countryName.toUpperCase()}
      </p>
    </PageContainer>
  );
}
