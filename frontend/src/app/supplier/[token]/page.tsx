"use client";

import { CalendarClock, CircleCheck, FileUp, Lock, MapPin, Pentagon, Send, Trash } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { FILE_HINT, ImportResultView } from "@/components/domain/import-result";
import { PlotDrawForm } from "@/components/domain/plot-draw-form";
import { CountryLabel, VerdictBadge } from "@/components/domain/status";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import {
  usePortal,
  usePortalCreatePlot,
  usePortalDeletePlot,
  usePortalImport,
  usePortalSubmit,
  usePortalValidate,
} from "@/lib/api/hooks";
import type { Commodity, ImportResult, Portal } from "@/lib/api/types";
import { commodityLabel, dateLong, daysUntil, ha } from "@/lib/format";

function DrawTab({ token, portal }: { token: string; portal: Portal }) {
  const validate = usePortalValidate(token);
  const create = usePortalCreatePlot(token);
  return (
    <PlotDrawForm
      country={portal.country}
      commodities={portal.commodities}
      existing={portal.plots}
      validate={(body) => validate.mutateAsync(body)}
      create={({ reference, commodity, geometry, declaredAreaHa }) => create.mutateAsync({ reference, commodity, geometry, declaredAreaHa })}
      saving={create.isPending}
    />
  );
}

function UploadTab({ token, portal }: { token: string; portal: Portal }) {
  const imp = usePortalImport(token);
  const [file, setFile] = useState<File | null>(null);
  const [commodity, setCommodity] = useState<Commodity>(portal.commodities[0] ?? "cocoa");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return setError("Choose a file first.");
        setError(null);
        try {
          setResult(await imp.mutateAsync({ file, commodity }));
        } catch {
          /* toast shown by the hook */
        }
      }}
    >
      <p className="text-[13px] leading-relaxed text-muted">If your plots are already mapped, for example by a cooperative survey or a GPS app, upload the file here.</p>
      <Field label="Crop" htmlFor="u-commodity">
        <Select id="u-commodity" value={commodity} onChange={(e) => setCommodity(e.target.value as Commodity)}>
          {(portal.commodities.length ? portal.commodities : (["cocoa"] as Commodity[])).map((c) => (
            <option key={c} value={c}>
              {commodityLabel(c)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="File" htmlFor="u-file" hint={FILE_HINT} error={error}>
        <input
          id="u-file"
          type="file"
          accept=".geojson,.json,.kml,.csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
          className="block w-full min-w-0 rounded-md border border-dashed border-border-strong bg-surface-2/50 p-3 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-[13px] file:font-medium file:text-fg"
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={imp.isPending}>
        <FileUp /> Upload and check
      </Button>
      {result ? <ImportResultView result={result} /> : null}
    </form>
  );
}

export default function SupplierPortalPage() {
  const { token } = useParams<{ token: string }>();
  const q = usePortal(token);
  const del = usePortalDeletePlot(token);
  const submit = usePortalSubmit(token);
  const [confirm, setConfirm] = useState(false);
  const p = q.data;
  const submitted = p?.status === "submitted";

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden /> Private upload link
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto grid max-w-2xl gap-4 px-4 py-6">
        {q.isPending ? (
          <>
            <Skeleton className="h-36" />
            <Skeleton className="h-96" />
          </>
        ) : q.isError || !p ? (
          q.error instanceof ApiError && [401, 403, 404, 410].includes(q.error.status) ? (
            <Card>
              <EmptyState
                icon={<Lock />}
                title="This link is no longer valid"
                body="It may have expired or been replaced by a newer link. Ask the company that sent it for a new one."
              />
            </Card>
          ) : (
            <Card>
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            </Card>
          )
        ) : (
          <>
            <Card>
              <CardBody>
                <p className="text-[13px] text-muted">Request from {p.orgName}</p>
                <h1 className="mt-1 text-xl font-semibold leading-snug">Hello {p.supplierName}, please map the plots you grow on</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  EU rules on deforestation-free products ask buyers to know exactly where crops were grown. Adding your plots here lets {p.orgName} keep
                  buying from you. Only plot locations are needed; no personal details.
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {p.dueDate ? (
                    <div>
                      <dt className="text-xs text-muted">Please reply by</dt>
                      <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                        <CalendarClock className="size-3.5 text-brand" aria-hidden />
                        {dateLong(p.dueDate)}
                      </dd>
                      {!submitted && daysUntil(p.dueDate) >= 0 ? <dd className="text-xs text-muted">{daysUntil(p.dueDate)} days left</dd> : null}
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs text-muted">Crops</dt>
                    <dd className="mt-0.5 font-medium">{p.commodities.map(commodityLabel).join(", ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Country</dt>
                    <dd className="mt-0.5 font-medium">
                      <CountryLabel code={p.country} />
                    </dd>
                  </div>
                </dl>
                {p.campaignName ? <p className="mt-3 text-xs text-subtle">Request: {p.campaignName}</p> : null}
              </CardBody>
            </Card>

            {submitted ? (
              <Callout tone="compliant" icon={<CircleCheck />} title="Thank you, your plots were sent for review">
                Sent on {dateLong(p.submittedAt)}. {p.orgName} will contact you if anything needs to change.
              </Callout>
            ) : (
              <Card>
                <CardHeader title="1. Add a plot" />
                <CardBody>
                  <Tabs defaultValue="draw">
                    <TabsList className="mb-4">
                      <TabsTrigger value="draw">
                        <Pentagon className="size-4" aria-hidden /> On the map
                      </TabsTrigger>
                      <TabsTrigger value="upload">
                        <FileUp className="size-4" aria-hidden /> Upload a file
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="draw" className="outline-none">
                      <DrawTab token={token} portal={p} />
                    </TabsContent>
                    <TabsContent value="upload" className="outline-none">
                      <UploadTab token={token} portal={p} />
                    </TabsContent>
                  </Tabs>
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader title={submitted ? "Your plots" : "2. Your plots"} description={`${p.plots.length} ${p.plots.length === 1 ? "plot" : "plots"} added`} />
              {p.plots.length ? (
                <ul className="divide-y divide-border">
                  {p.plots.map((pl) => (
                    <li key={pl.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[13px] font-medium">{pl.reference}</p>
                        <p className="text-xs text-muted">
                          {commodityLabel(pl.commodity)} · {pl.kind === "point" ? "Point" : "Boundary"} · {ha(pl.areaHa, 2)}
                        </p>
                      </div>
                      <VerdictBadge verdict={pl.verdict} />
                      {!submitted ? (
                        <Button size="icon-sm" variant="ghost" aria-label={`Remove plot ${pl.reference}`} onClick={() => del.mutate(pl.id)} disabled={del.isPending}>
                          <Trash />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<MapPin />} title="No plots yet" body="Add your first plot above." className="py-8" />
              )}
            </Card>

            {!submitted ? (
              <Card>
                <CardHeader title="3. Send for review" />
                <CardBody className="grid gap-3">
                  <p className="text-sm text-muted">When all your plots are added, send them to {p.orgName}. You can’t change them after sending.</p>
                  <Button variant="primary" size="lg" disabled={!p.plots.length} onClick={() => setConfirm(true)}>
                    <Send /> Submit for review
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              title="Send your plots for review?"
              description={`${p.plots.length} ${p.plots.length === 1 ? "plot" : "plots"} will be sent to ${p.orgName}. You won’t be able to change them afterwards.`}
              confirmLabel="Submit for review"
              loading={submit.isPending}
              onConfirm={async () => {
                await submit.mutateAsync().catch(() => null);
                setConfirm(false);
              }}
            />
          </>
        )}
        <p className="py-4 text-center text-xs leading-relaxed text-subtle">
          Plot locations are used only for EU deforestation due diligence (Regulation (EU) 2023/1115). Powered by Plotline.
        </p>
      </main>
    </div>
  );
}
