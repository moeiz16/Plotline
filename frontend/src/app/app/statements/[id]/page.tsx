"use client";

import { ArrowLeft, Download, ExternalLink, FileText, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { DdsBadge, RISK_META } from "@/components/domain/status";
import { logTime, stampDate } from "@/components/ledger/format";
import { FormBox, FormGrid, LandingStamp } from "@/components/ledger/paper";
import { PlotSketch } from "@/components/ledger/sketch";
import { Reveal } from "@/components/motion";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { CopyField, ErrorState, Glyph, Paper, Skeleton } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/overlays";
import { fileUrl } from "@/lib/api/client";
import { useCountries, useDds, useSubmitDds } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Geometry } from "@/lib/api/types";
import { countryName, num } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ── Reading the EU submission data ─────────────────────────────────────────── */
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** The EU format carries each producer's plots as a base64-encoded GeoJSON FeatureCollection. */
function decodeGeojson(v: unknown): { features?: { geometry?: Geometry; properties?: Rec }[] } | null {
  if (typeof v !== "string" || v.length < 16) return null;
  try {
    const bytes = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

interface Producer {
  name: string;
  country: string;
  plots: { ref: string; geometry: Geometry | undefined; area: number | null }[];
}

function readStatement(payload: unknown) {
  const st = rec(rec(payload).statement);
  const op = rec(st.operator);
  const na = rec(op.nameAndAddress);
  const ids = arr(op.referenceNumber).map(rec);
  const eori = ids.find((x) => str(x.identifierType).toLowerCase() === "eori");
  const commodities = arr(st.commodities).map((c) => {
    const r = rec(c);
    const desc = rec(r.descriptors);
    const species = rec(r.speciesInfo);
    const producers: Producer[] = arr(r.producers).map((p) => {
      const pr = rec(p);
      const fc = decodeGeojson(pr.geometryGeojson);
      return {
        name: str(pr.name),
        country: str(pr.country),
        plots: (fc?.features ?? []).map((f, i) => {
          const props = rec(f.properties);
          const area = Number(props.Area ?? props.area ?? NaN);
          return { ref: str(props.ProductionPlace) || `Plot ${i + 1}`, geometry: f.geometry, area: Number.isFinite(area) ? area : null };
        }),
      };
    });
    return {
      hs: str(r.hsHeading),
      description: str(desc.descriptionOfGoods),
      netWeight: Number(rec(desc.goodsMeasure).netWeight ?? 0),
      scientific: str(species.scientificName),
      common: str(species.commonName),
      producers,
    };
  });
  return {
    activity: str(st.activityType),
    operatorName: str(na.name),
    operatorAddress: str(na.address),
    operatorCountry: str(na.country),
    eori: eori ? str(eori.identifierValue) : "",
    countryOfActivity: str(st.countryOfActivity),
    associated: arr(st.associatedStatements),
    comment: str(st.comment),
    commodities,
  };
}

const ACTIVITY: Record<string, string> = { IMPORT: "Import (placing on the EU market)", EXPORT: "Export", DOMESTIC: "Domestic production" };

/* ── Document section ───────────────────────────────────────────────────────── */
function Section({ n, title, children, className }: { n: number; title: string; children: ReactNode; className?: string }) {
  return (
    <Reveal as="section" className={cn("grid gap-3 border-b border-rule py-6 sm:grid-cols-[3rem_minmax(0,1fr)]", className)}>
      <span className="numerals text-[22px] leading-none text-ink-subtle">{n}</span>
      <div className="min-w-0">
        <h2 className="label-caps mb-3 text-ink">{title}</h2>
        {children}
      </div>
    </Reveal>
  );
}

const FILED_TONE = { submitted: "brand", accepted: "compliant", rejected: "noncompliant", draft: "neutral" } as const;

export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  const q = useDds(id);
  const submit = useSubmitDds(id);
  const countries = useCountries();
  const { can } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [fresh, setFresh] = useState(false);
  const d = q.data;
  const doc = useMemo(() => readStatement(d?.payload), [d?.payload]);
  const tier = useMemo(() => new Map((countries.data ?? []).map((c) => [c.code, c.riskTier])), [countries.data]);

  if (q.isPending)
    return (
      <PageContainer>
        <Skeleton className="mx-auto h-[720px] max-w-[820px]" />
      </PageContainer>
    );
  if (q.isError || !d)
    return (
      <PageContainer>
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this statement" />
      </PageContainer>
    );

  const filed = d.status !== "draft";
  const origins = [...new Set(doc.commodities.flatMap((c) => c.producers.map((p) => p.country)))].filter(Boolean);
  const plotCount = doc.commodities.reduce((n, c) => n + c.producers.reduce((m, p) => m + p.plots.length, 0), 0);
  let sketch = 0;

  return (
    <PageContainer bleed className="graticule min-h-[calc(100dvh-var(--masthead-h)-var(--tabbar-h))] print:bg-none">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Actions above the paper */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/app/statements" className="label-caps inline-flex items-center gap-1.5 text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="size-3.5" aria-hidden /> Statement file
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a href={fileUrl(`/dds/${d.id}/payload.json`)} download>
                <Download /> EU file · JSON
              </a>
            </Button>
            <Button asChild size="sm">
              <a href={fileUrl(`/dds/${d.id}/evidence.html`)} target="_blank" rel="noopener">
                <ExternalLink /> Evidence · HTML
              </a>
            </Button>
            <Button asChild size="sm">
              <a href={fileUrl(`/dds/${d.id}/evidence.pdf`)} target="_blank" rel="noopener">
                <FileText /> Evidence · PDF
              </a>
            </Button>
            {d.status === "draft" && can("dds:submit") ? (
              <Button variant="primary" onClick={() => setConfirm(true)}>
                <Send /> Submit to EU system (demo)
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,820px)_minmax(0,1fr)]">
          <Paper className="mx-auto w-full max-w-[820px] px-5 pb-8 pt-7 sm:px-10 sm:pt-10 print:shadow-none">
            {/* Head */}
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
              <div className="min-w-0">
                <p className="label-caps text-ink">Due diligence statement</p>
                <p className="mt-1 text-[14.5px] italic text-ink-muted">Regulation (EU) 2023/1115 · Article 4(2) · Annex II</p>
              </div>
              <div className="text-right">
                <p className="label-caps text-ink-subtle">Ref.</p>
                <p className="numerals text-[14px]">{d.internalRef}</p>
              </div>
            </header>
            <div className="relative mt-6 flex min-h-[64px] flex-wrap items-end justify-between gap-4">
              <h1 className="text-[28px] font-medium leading-[1.1] tracking-[-0.015em] sm:text-[34px]">
                {doc.commodities[0]?.description || "Relevant products"}
                <span className="block text-[17px] font-normal italic text-ink-muted">shipment {d.shipmentReference}</span>
              </h1>
              {filed ? (
                <LandingStamp tone={FILED_TONE[d.status]} angle={-8} land={fresh} size="lg" className="sm:mr-4">
                  {d.status === "rejected" ? "Rejected" : "Submitted (demo)"} · {stampDate(d.submittedAt)}
                </LandingStamp>
              ) : (
                <span className="border-2 border-dashed border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-subtle">Draft · not submitted</span>
              )}
            </div>
            <div className="mt-6 h-[3px] border-y border-ink/70" aria-hidden />

            <Section n={1} title="Operator">
              <FormGrid className="grid-cols-1 sm:grid-cols-2">
                <FormBox label="Name" className="sm:col-span-2">
                  {doc.operatorName || "–"}
                </FormBox>
                <FormBox label="Address" className="sm:col-span-2">
                  {doc.operatorAddress || "–"}
                  {doc.operatorCountry ? `, ${countryName(doc.operatorCountry)}` : ""}
                </FormBox>
                <FormBox label="EORI number" mono>
                  {doc.eori || "–"}
                </FormBox>
                <FormBox label="Activity">{ACTIVITY[doc.activity] ?? (doc.activity || "–")}</FormBox>
              </FormGrid>
            </Section>

            <Section n={2} title="Relevant products">
              {doc.commodities.map((c, i) => (
                <FormGrid key={i} className="grid-cols-2 sm:grid-cols-4">
                  <FormBox label="HS heading" mono>
                    {c.hs || "–"}
                  </FormBox>
                  <FormBox label="Net weight" mono>
                    {num(c.netWeight)} KG
                  </FormBox>
                  <FormBox label="Description" className="col-span-2">
                    {c.description || "–"}
                  </FormBox>
                  <FormBox label="Species" className="col-span-2 sm:col-span-4">
                    {c.common || "–"}
                    {c.scientific ? <span className="italic text-ink-muted"> ({c.scientific})</span> : null}
                  </FormBox>
                </FormGrid>
              ))}
            </Section>

            <Section n={3} title="Country of production">
              <ul className="grid gap-1.5">
                {origins.map((code) => {
                  const t = tier.get(code);
                  return (
                    <li key={code} className="flex flex-wrap items-baseline gap-x-3 text-[16px]">
                      {countryName(code)}
                      {t ? (
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-muted">
                          {RISK_META[t].icon} {RISK_META[t].label} under the EU benchmark
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Section>

            <Section n={4} title="Geolocation of the plots of land">
              <p className="mb-4 text-[15px] italic text-ink-muted">
                {plotCount} {plotCount === 1 ? "plot" : "plots"} from {doc.commodities.reduce((n, c) => n + c.producers.length, 0)} producers, each drawn at its own scale.
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {doc.commodities.flatMap((c) => c.producers).map((p, pi) => (
                  <div key={pi}>
                    <p className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-1">
                      <span className="text-[16px] font-medium">{p.name}</span>
                      <span className="numerals text-[11px] text-ink-muted">{p.country}</span>
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-3">
                      {p.plots.map((pl) => (
                        <li key={pl.ref} className="grid w-[112px] justify-items-center gap-1 border border-rule bg-paper/40 px-2 pb-2 pt-1.5">
                          <PlotSketch geometry={pl.geometry} verdict="compliant" size={84} delay={0.2 + sketch++ * 0.15} label={`Outline of plot ${pl.ref}`} />
                          <span className="numerals text-[11px]">{pl.ref}</span>
                          {pl.area ? <span className="numerals text-[10px] text-ink-subtle">{num(pl.area, 2)} HA</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            <Section n={5} title="Reference to existing statements">
              <p className="text-[15.5px]">{doc.associated.length ? `${doc.associated.length} statements referenced.` : "None. This statement covers the full due diligence for this shipment."}</p>
            </Section>

            <Section n={6} title="Conclusion">
              <p className="text-[16.5px] leading-[1.65]">{d.summary}</p>
              <blockquote className="mt-4 border-l-2 border-ink pl-4 text-[15.5px] italic leading-relaxed text-ink-muted">
                By submitting this due diligence statement the operator confirms that due diligence in accordance with Regulation (EU) 2023/1115 was carried out and that no or only a negligible
                risk was found that the relevant products do not comply with Article 3, point (a) or (b), of that Regulation.
              </blockquote>
            </Section>

            <Section n={7} title="Signature" className="border-b-0">
              <FormGrid className="grid-cols-1 sm:grid-cols-2">
                <FormBox label="Signed for and on behalf of">{doc.operatorName || "–"}</FormBox>
                <FormBox label="Date" mono>
                  {filed ? stampDate(d.submittedAt) : "ON SUBMISSION"}
                </FormBox>
                <FormBox label="EU reference number" mono>
                  {d.referenceNumber ?? <span className="font-serif text-[14px] italic text-ink-muted">issued on submission</span>}
                </FormBox>
                <FormBox label="Verification number" mono>
                  {d.verificationNumber ?? <span className="font-serif text-[14px] italic text-ink-muted">issued on submission</span>}
                </FormBox>
              </FormGrid>
              <p className="mt-3 text-[13.5px] italic text-ink-muted">
                Demo submission: Plotline simulates the EU information system (TRACES). The numbers above were generated in this workspace and were not issued by the EU.
              </p>
            </Section>
          </Paper>

          {/* Margin log */}
          <aside className="grid gap-6 print:hidden xl:sticky xl:top-[calc(var(--masthead-h)+1.5rem)]">
            <div className="border border-rule bg-sheet/90 p-4">
              <p className="label-caps mb-3 text-ink">Margin log</p>
              <ol className="grid">
                <MarginEntry at={d.createdAt} tone="neutral" title="Prepared" note={`Drafted from shipment ${d.shipmentReference}.`} />
                {d.submissions.map((s) => (
                  <MarginEntry
                    key={s.id}
                    at={s.at}
                    tone={s.status === "rejected" ? "noncompliant" : s.status === "submitted" || s.status === "accepted" ? "brand" : "pending"}
                    title={s.status.replace(/_/g, " ")}
                    note={s.message}
                    ref_={s.referenceNumber}
                  />
                ))}
                {!d.submissions.length ? <li className="py-2 text-[14px] italic text-ink-muted">Not submitted yet.</li> : null}
              </ol>
            </div>
            {d.referenceNumber ? (
              <div className="grid gap-2 border border-rule bg-sheet/90 p-4">
                <p className="label-caps text-ink">For the customs declaration</p>
                <CopyField value={d.referenceNumber} label="Copy EU reference number" />
                {d.verificationNumber ? <CopyField value={d.verificationNumber} label="Copy verification number" /> : null}
              </div>
            ) : null}
            <div className="border border-rule bg-sheet/90 p-4">
              <p className="label-caps mb-2 text-ink">Status</p>
              <DdsBadge status={d.status} />
              <p className="mt-2 text-[14px] italic text-ink-muted">Kept with its evidence pack for five years, as Article 12 requires.</p>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit this statement?"
        description="This is a demo submission. Plotline simulates the EU information system (TRACES): the reference numbers are generated here and nothing is sent to the EU."
        confirmLabel="Submit (demo)"
        loading={submit.isPending}
        onConfirm={async () => {
          const ok = await submit
            .mutateAsync()
            .then(() => true)
            .catch(() => false);
          setConfirm(false);
          if (ok) {
            setFresh(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
      />
    </PageContainer>
  );
}

function MarginEntry({ at, title, note, tone, ref_ }: { at: string; title: string; note: string; tone: "neutral" | "brand" | "pending" | "noncompliant"; ref_?: string | null }) {
  return (
    <li className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-2.5 border-b border-rule py-2.5 last:border-b-0">
      <Glyph tone={tone} className="mt-1" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]">{title}</span>
          <span className="numerals text-[10.5px] text-ink-subtle">{logTime(at)}</span>
        </p>
        <p className="mt-0.5 text-[14px] leading-snug text-ink-muted">{note}</p>
        {ref_ ? <p className="numerals mt-0.5 text-[11px] text-ink">{ref_}</p> : null}
      </div>
    </li>
  );
}

