"use client";

import { ArrowLeft, FileUp, Link2, Mail, Pentagon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FILE_HINT, ImportResultView } from "@/components/domain/import-result";
import { VerdictBar, VerdictLegend } from "@/components/domain/readiness";
import { PlotTable } from "@/components/domain/plot-table";
import { CountryLabel, RiskBadge } from "@/components/domain/status";
import { PlotMap } from "@/components/map/plot-map";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, CardHeader, CopyField, DefinitionList, EmptyState, ErrorState, Skeleton } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useImportPlots, usePlotsMap, usePortalLink, useSupplier } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Commodity, ImportResult, SupplierDetail } from "@/lib/api/types";
import { SUPPLIER_KIND_LABEL, commodityLabel, dateLong, pct, relative } from "@/lib/format";
import { absoluteUrl } from "@/lib/utils";

function LinkDialog({ supplier }: { supplier: SupplierDetail }) {
  const link = usePortalLink();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="primary"
        onClick={() => {
          setOpen(true);
          link.reset();
        }}
      >
        <Link2 /> Create upload link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Supplier upload link" description={`Send this link to ${supplier.name}. They can map and upload plots from a phone without creating an account.`}>
          {link.data ? (
            <div className="grid gap-3">
              <CopyField value={absoluteUrl(link.data.url)} label="Copy upload link" />
              <p className="text-[13px] text-muted">Valid until {dateLong(link.data.expiresAt)}. Any earlier link for this supplier no longer works.</p>
              {supplier.contactEmail ? (
                <Button asChild variant="secondary" className="justify-self-start">
                  <a
                    href={`mailto:${supplier.contactEmail}?subject=${encodeURIComponent("Please map your plots for EUDR")}&body=${encodeURIComponent(
                      `Hello,\n\nPlease add your farm plots using this link:\n${absoluteUrl(link.data.url)}\n\nThank you.`,
                    )}`}
                  >
                    <Mail /> Email to {supplier.contactEmail}
                  </a>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-muted">Creating a new link replaces any earlier link you sent to this supplier.</p>
              {link.isError ? <p className="text-sm text-noncompliant-fg">We couldn’t create the link. Please try again.</p> : null}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button>{link.data ? "Done" : "Cancel"}</Button>
            </DialogClose>
            {!link.data ? (
              <Button variant="primary" loading={link.isPending} onClick={() => link.mutate(supplier.id)}>
                Create link
              </Button>
            ) : null}
          </DialogFooter>
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
        <DialogContent title="Import plots from a file" description={`Add plots for ${supplier.name}. Each plot is checked against EUDR geolocation rules as it is imported.`}>
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
                <input
                  id="imp-file"
                  type="file"
                  accept=".geojson,.json,.kml,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full min-w-0 rounded-md border border-dashed border-border-strong bg-surface-2/50 p-3 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-[13px] file:font-medium file:text-fg"
                />
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

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const q = useSupplier(id);
  const map = usePlotsMap({ supplierId: id });
  const { can } = useSession();
  const s = q.data;

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </PageContainer>
    );
  if (q.isError || !s)
    return (
      <PageContainer>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this supplier" />
        </Card>
      </PageContainer>
    );

  const plots = Array.isArray(s.plots) ? s.plots : [];

  return (
    <PageContainer wide>
      <Link href="/app/suppliers" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Suppliers
      </Link>
      <div className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] sm:text-2xl">{s.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>{SUPPLIER_KIND_LABEL[s.kind] ?? s.kind}</span>
            <span aria-hidden>·</span>
            <CountryLabel code={s.country} name={s.countryName} />
            <RiskBadge tier={s.riskTier} />
            {s.status === "active" ? <Badge tone="brand">Active</Badge> : <Badge>Invited</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("plots:write") ? <ImportDialog supplier={s} /> : null}
          {can("suppliers:write") ? <LinkDialog supplier={s} /> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col overflow-hidden lg:col-span-2">
          <PlotMap data={map.data} compact className="h-72 sm:h-80 lg:h-auto lg:min-h-80 lg:flex-1" fitKey={id} />
          <div className="border-t border-border px-4 py-2.5 sm:px-5">
            <VerdictLegend />
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader title="Readiness" />
            <CardBody>
              <p className="text-3xl font-semibold tabular">{pct(s.readinessPct)}</p>
              <p className="text-[13px] text-muted">of plots confirmed compliant</p>
              <VerdictBar split={s} className="mt-4" height="h-2.5" />
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Compliant", s.compliant],
                  ["Needs review", s.needsReview],
                  ["Non-compliant", s.nonCompliant],
                  ["Pending", s.pending],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <dt className="text-xs text-muted">{l}</dt>
                    <dd className="font-semibold tabular">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody className="py-1">
              <DefinitionList
                items={[
                  { label: "Commodities", value: s.commodities.map(commodityLabel).join(", ") || "–" },
                  { label: "Contact", value: s.contactEmail || "Not given" },
                  { label: "Last upload", value: s.lastSubmissionAt ? relative(s.lastSubmissionAt) : "No uploads yet" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Plots" description={`${plots.length} ${plots.length === 1 ? "plot" : "plots"} mapped by this supplier`} />
        {plots.length ? (
          <PlotTable plots={plots} showSupplier={false} />
        ) : (
          <EmptyState
            icon={<Pentagon />}
            title="No plots yet"
            body="Send the supplier an upload link, or import their plots from a file."
          />
        )}
      </Card>
    </PageContainer>
  );
}
