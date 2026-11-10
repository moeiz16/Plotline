"use client";

import { ArrowLeft, Download, ExternalLink, FileText, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DdsBadge } from "@/components/domain/status";
import { PlotMap } from "@/components/map/plot-map";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardBody, CardHeader, CopyField, ErrorState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/overlays";
import { fileUrl } from "@/lib/api/client";
import { useDds, useSubmitDds } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Geometry, PlotFeatureCollection } from "@/lib/api/types";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACRONYMS = new Set(["hs", "eori", "id", "eu", "dds", "ha", "kg", "iso", "url", "vat"]);

/** Plain names for the EU information system's field names. */
const LABELS: Record<string, string> = {
  geometryGeojson: "Plot locations",
  geoLocationConfidential: "Locations kept confidential",
  borderCrossCountry: "Border crossing country",
  internalReferenceNumber: "Internal reference",
  netWeight: "Net weight (kg)",
  hsHeading: "HS heading",
  speciesInfo: "Species",
  referenceNumber: "Operator identifiers",
  descriptors: "Goods",
  goodsMeasure: "Quantity",
};

const VALUE_LABELS: Record<string, string> = { eori: "EORI", OPERATOR: "Operator", IMPORT: "Import", EXPORT: "Export", DOMESTIC: "Domestic" };

/** The EU format carries each producer's plots as a base64-encoded GeoJSON FeatureCollection. */
function decodeGeojson(v: unknown): { type: string; features?: unknown[] } | null {
  if (typeof v !== "string" || v.length < 16) return null;
  try {
    const bin = atob(v);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes)) as { type?: string; features?: unknown[] };
    return obj && typeof obj.type === "string" ? (obj as { type: string; features?: unknown[] }) : null;
  } catch {
    return null;
  }
}

function PlotLocations({ fc }: { fc: { type: string; features?: unknown[] } }) {
  const feats = (fc.features ?? []) as { geometry?: { type?: string }; properties?: Record<string, unknown> }[];
  const points = feats.filter((f) => f.geometry?.type === "Point").length;
  const refs = feats.map((f) => f.properties?.ProductionPlace).filter((r): r is string => typeof r === "string");
  return (
    <span className="grid justify-items-end gap-0.5">
      <span>
        {feats.length} {feats.length === 1 ? "plot" : "plots"}
        {points ? ` (${points} as ${points === 1 ? "a point" : "points"})` : ""}
      </span>
      {refs.length ? <span className="font-mono text-xs font-normal text-muted [overflow-wrap:anywhere]">{refs.join(", ")}</span> : null}
    </span>
  );
}

function humanize(key: string) {
  if (LABELS[key]) return LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()));
  if (!words.length) return key;
  const last = words[words.length - 1];
  if (words.length > 1 && (last === "KG" || last === "HA")) words.splice(-1, 1, `(${last.toLowerCase()})`);
  const first = words[0];
  words[0] = first === first.toUpperCase() ? first : first[0].toUpperCase() + first.slice(1);
  return words.join(" ");
}

function isGeometry(v: unknown): v is { type: string; coordinates: unknown } {
  return !!v && typeof v === "object" && "type" in v && "coordinates" in v;
}

function countPositions(c: unknown): number {
  if (!Array.isArray(c)) return 0;
  if (typeof c[0] === "number") return 1;
  return c.reduce((s: number, x) => s + countPositions(x), 0);
}

function Scalar({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-subtle">–</span>;
  if (typeof v === "boolean") return <span>{v ? "Yes" : "No"}</span>;
  const text = String(v);
  return <span className="[overflow-wrap:anywhere]">{VALUE_LABELS[text] ?? text}</span>;
}

/** Renders the EU submission data as nested, readable sections instead of raw code. */
function DataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (isGeometry(value)) {
    const n = countPositions(value.coordinates);
    return (
      <span>
        {value.type === "Point" ? "Point location" : `${value.type} boundary`} · {n} {n === 1 ? "coordinate" : "coordinates"}
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-subtle">None</span>;
    if (value.every((x) => typeof x !== "object" || x === null)) return <span className="break-words">{value.map(String).join(", ")}</span>;
    return (
      <ol className="grid gap-2">
        {value.map((item, i) => (
          <li key={i} className="rounded-md border border-border bg-surface p-2.5">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.05em] text-subtle">Item {i + 1}</p>
            <DataView value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  if (value && typeof value === "object") {
    return (
      <dl className={cn("grid gap-0", depth > 0 && "text-[13px]")}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => {
          const nested = v !== null && typeof v === "object" && !isGeometry(v) && !(Array.isArray(v) && v.every((x) => typeof x !== "object"));
          return nested ? (
            <div key={k} className="border-t border-border py-2.5 first:border-t-0">
              <dt className="mb-2 text-[13px] font-semibold">{humanize(k)}</dt>
              <dd className={cn(depth < 2 && "border-l-2 border-border pl-3")}>
                <DataView value={v} depth={depth + 1} />
              </dd>
            </div>
          ) : (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-border py-2 first:border-t-0">
              <dt className="text-muted">{humanize(k)}</dt>
              <dd className="min-w-0 text-right font-medium">
                {isGeometry(v) ? (
                  <DataView value={v} />
                ) : /geojson/i.test(k) && decodeGeojson(v) ? (
                  <PlotLocations fc={decodeGeojson(v)!} />
                ) : (
                  <Scalar v={Array.isArray(v) ? v.join(", ") : v} />
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }
  return <Scalar v={value} />;
}

/** Every plot location declared in the statement, found anywhere in the submission data. */
function declaredPlots(payload: unknown): PlotFeatureCollection {
  const features: PlotFeatureCollection["features"] = [];
  const walk = (v: unknown, label: string | null) => {
    if (typeof v === "string") {
      const fc = decodeGeojson(v);
      if (fc) walk(fc, label);
      return;
    }
    if (!v || typeof v !== "object") return;
    if (isGeometry(v) && ["Point", "Polygon", "MultiPolygon"].includes(v.type)) {
      const n = features.length + 1;
      features.push({
        type: "Feature",
        geometry: v as Geometry,
        properties: { id: `declared-${n}`, reference: label ?? `Plot ${n}`, verdict: "compliant", commodity: "cocoa", supplierName: "", areaHa: 0, kind: v.type === "Point" ? "point" : "polygon" },
      });
      return;
    }
    const rec = v as Record<string, unknown>;
    const props = (rec.properties ?? {}) as Record<string, unknown>;
    const pick = [rec.reference, rec.plotReference, rec.productionPlace, props.ProductionPlace, props.reference].find((x) => typeof x === "string");
    const ref = typeof pick === "string" ? pick : label;
    for (const x of Array.isArray(v) ? v : Object.values(rec)) walk(x, ref);
  };
  walk(payload, null);
  return { type: "FeatureCollection", features };
}

function EvidencePreview({ id }: { id: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      {!loaded ? <Skeleton className="absolute inset-0 h-[640px]" /> : null}
      <iframe
        title="Evidence pack preview"
        src={fileUrl(`/dds/${id}/evidence.html`)}
        sandbox="allow-same-origin"
        onLoad={() => setLoaded(true)}
        className="h-[640px] w-full rounded-md border border-border bg-white"
      />
    </div>
  );
}

export default function StatementPage() {
  const { id } = useParams<{ id: string }>();
  const q = useDds(id);
  const submit = useSubmitDds(id);
  const { can } = useSession();
  const [confirm, setConfirm] = useState(false);
  const d = q.data;
  const plots = useMemo(() => declaredPlots(d?.payload), [d?.payload]);

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-6 h-96" />
      </PageContainer>
    );
  if (q.isError || !d)
    return (
      <PageContainer>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this statement" />
        </Card>
      </PageContainer>
    );

  return (
    <PageContainer wide>
      <Link href="/app/statements" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Statements
      </Link>
      <div className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold sm:text-2xl">{d.internalRef}</h1>
            <DdsBadge status={d.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">
            Due diligence statement for shipment{" "}
            <Link href={`/app/shipments/${d.shipmentId}`} className="font-mono font-medium text-fg hover:underline">
              {d.shipmentReference}
            </Link>{" "}
            · prepared {dateTime(d.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={fileUrl(`/dds/${d.id}/payload.json`)} download>
              <Download /> Download EU submission file
            </a>
          </Button>
          {d.status === "draft" && can("dds:submit") ? (
            <Button variant="primary" onClick={() => setConfirm(true)}>
              <Send /> Submit
            </Button>
          ) : null}
        </div>
      </div>

      {d.status !== "draft" ? (
        <Callout tone="brand" className="mb-4" icon={<Send />} title={d.status === "submitted" ? "Submitted (demo submission)" : d.status === "accepted" ? "Accepted (demo submission)" : "Rejected (demo submission)"}>
          Submission to the EU information system (TRACES) is simulated in this workspace. The reference and verification numbers below are for
          demonstration and were not issued by the EU.
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed">{d.summary}</p>
            </CardBody>
          </Card>
          {plots.features.length ? (
            <Card className="overflow-hidden">
              <CardHeader title="Declared plots" description={`${plots.features.length} ${plots.features.length === 1 ? "location" : "locations"} included in this statement.`} />
              <PlotMap data={plots} compact hoverCard={false} maxFitZoom={15} className="h-64 sm:h-80" ariaLabel="Map of the plots declared in this statement" />
            </Card>
          ) : null}
          <Card>
            <Tabs defaultValue="data">
              <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-border px-2 sm:px-3">
                <TabsList className="border-b-0">
                  <TabsTrigger value="data">Statement contents</TabsTrigger>
                  <TabsTrigger value="evidence">Evidence pack</TabsTrigger>
                </TabsList>
                <Button asChild size="sm" variant="ghost">
                  <a href={fileUrl(`/dds/${d.id}/payload.json`)} download>
                    <Download /> Download
                  </a>
                </Button>
              </div>
              <TabsContent value="data" className="outline-none">
                <CardBody className="text-sm">
                  <p className="mb-3 text-[13px] text-muted">What the statement contains, in the structure the EU information system expects.</p>
                  {d.payload ? <DataView value={d.payload} /> : <p className="text-muted">Not available.</p>}
                </CardBody>
              </TabsContent>
              <TabsContent value="evidence" className="outline-none">
                <CardBody>
                  <EvidencePreview id={d.id} />
                </CardBody>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader title="Reference numbers" />
            <CardBody className="grid gap-4">
              <div className="grid gap-1.5">
                <p className="text-[13px] text-muted">Reference number</p>
                {d.referenceNumber ? <CopyField value={d.referenceNumber} label="Copy reference number" /> : <p className="text-sm text-muted">Assigned when the statement is submitted.</p>}
              </div>
              <div className="grid gap-1.5">
                <p className="text-[13px] text-muted">Verification number</p>
                {d.verificationNumber ? <CopyField value={d.verificationNumber} label="Copy verification number" /> : <p className="text-sm text-muted">Assigned when the statement is submitted.</p>}
              </div>
              <p className="text-xs text-muted">Customs declarations quote these numbers when the goods are placed on the market.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Evidence pack" description="Everything behind this statement, for your records and for auditors." />
            <CardBody className="grid gap-2">
              <Button asChild className="justify-start">
                <a href={fileUrl(`/dds/${d.id}/evidence.html`)} target="_blank" rel="noopener">
                  <ExternalLink /> Open printable evidence pack
                </a>
              </Button>
              <Button asChild className="justify-start">
                <a href={fileUrl(`/dds/${d.id}/evidence.pdf`)} target="_blank" rel="noopener">
                  <FileText /> Download as PDF
                </a>
              </Button>
              <p className="text-xs text-muted">Kept for five years, as the regulation requires.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Submission log" />
            {d.submissions.length ? (
              <ol className="divide-y divide-border">
                {d.submissions.map((s) => (
                  <li key={s.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium capitalize">{s.status.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted">{dateTime(s.at)}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">{s.message}</p>
                    {s.referenceNumber ? <p className="mt-0.5 font-mono text-xs text-muted">{s.referenceNumber}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-4 text-sm text-muted">Not submitted yet.</p>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Submit this statement?"
        description="This is a demo submission. Plotline simulates the EU information system (TRACES): reference numbers are generated here and nothing is sent to the EU."
        confirmLabel="Submit statement"
        loading={submit.isPending}
        onConfirm={async () => {
          await submit.mutateAsync().catch(() => null);
          setConfirm(false);
        }}
      />
    </PageContainer>
  );
}
