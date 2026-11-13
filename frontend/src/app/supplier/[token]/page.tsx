"use client";

import { FileUp, Send, Trash } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/brand/logo";
import { FILE_HINT, FILE_INPUT_CLASS, ImportResultView } from "@/components/domain/import-result";
import { PlotDrawForm } from "@/components/domain/plot-draw-form";
import { CountryLabel, VerdictBadge } from "@/components/domain/status";
import { dMinus, lineNo, stampDate } from "@/components/ledger/format";
import { LandingStamp } from "@/components/ledger/paper";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, SectionTitle, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/display";
import { Field, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { usePortal, usePortalCreatePlot, usePortalDeletePlot, usePortalImport, usePortalSubmit, usePortalValidate } from "@/lib/api/hooks";
import type { Commodity, ImportResult, Portal } from "@/lib/api/types";
import { commodityLabel, daysUntil, ha, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

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
      submitLabel="Add this plot"
      mapClassName="h-[52dvh] max-h-[480px] min-h-[300px]"
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
      <p className="text-[15px] italic leading-relaxed text-ink-muted">If your plots are already mapped, for example by a cooperative survey or a GPS app, send the file here.</p>
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
          className={FILE_INPUT_CLASS}
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
  const [fresh, setFresh] = useState(false);
  const p = q.data;
  // "Already sent" is decided by the portal status alone (a fresh link reopens submissions).
  const submitted = p?.status === "submitted";
  const left = p?.dueDate ? daysUntil(p.dueDate) : null;

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-ink/70 bg-sheet">
        <div className="mx-auto flex h-11 max-w-xl items-center gap-2 px-4">
          <Mark className="h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-ink">
            Plotline{p ? <span className="text-ink-muted"> · for {p.orgName}</span> : null}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-subtle">Private link</span>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-xl gap-8 px-4 pb-10 pt-6">
        {q.isPending ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-96" />
          </>
        ) : q.isError || !p ? (
          q.error instanceof ApiError && [401, 403, 404, 410].includes(q.error.status) ? (
            <EmptyState
              title="This link has expired"
              body="It may have run out or been replaced by a newer link. Ask the company that sent it to you for a new one."
              className="border border-dashed border-rule-strong"
            />
          ) : (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          )
        ) : (
          <>
            {/* Title block */}
            <section>
              <p className="label-caps text-ink-muted">Request from {p.orgName}</p>
              <h1 className="mt-1.5 text-[28px] font-medium leading-[1.1] tracking-[-0.015em]">{p.supplierName}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {p.dueDate && !submitted ? (
                  <span className="inline-flex h-7 items-stretch border border-ink font-mono text-[11px] font-medium uppercase tracking-[0.08em]">
                    <span className={cn("numerals flex items-center px-2", left !== null && left < 0 ? "bg-noncompliant text-paper" : "bg-ink text-paper")}>{dMinus(p.dueDate)}</span>
                    <span className="numerals flex items-center px-2">BY {stampDate(p.dueDate)}</span>
                  </span>
                ) : null}
                <span className="text-[15px] text-ink-muted">
                  <CountryLabel code={p.country} /> · {p.commodities.map(commodityLabel).join(", ")}
                </span>
              </div>
              <p className="mt-4 text-[16px] leading-relaxed">
                EU rules on deforestation-free products ask buyers to know where crops were grown. Share your farm plots here so {p.orgName} can keep buying from you. Only plot
                locations are needed, no personal details.
              </p>
              {p.campaignName ? <p className="mt-2 text-[14px] italic text-ink-muted">Request: {p.campaignName}</p> : null}
            </section>

            {submitted ? (
              <section className="grid justify-items-start gap-3 border-y border-ink/60 py-6">
                <LandingStamp tone="compliant" angle={-4} land={fresh} size="lg" className="mb-3 ml-1 mt-1">
                  Sent · {stampDate(p.submittedAt ?? new Date().toISOString())}
                </LandingStamp>
                <p className="text-[18px] leading-snug">Thank you. Your plots are with {p.orgName} for review.</p>
                <p className="text-[15px] italic text-ink-muted">They will contact you if anything needs to change. If they send you a new link, you can add more plots.</p>
              </section>
            ) : (
              <section>
                <Tabs defaultValue="draw">
                  <TabsList className="mb-5">
                    <TabsTrigger value="draw">1 · Map a plot</TabsTrigger>
                    <TabsTrigger value="upload">2 · Upload a file</TabsTrigger>
                  </TabsList>
                  <TabsContent value="draw" className="outline-none">
                    <DrawTab token={token} portal={p} />
                  </TabsContent>
                  <TabsContent value="upload" className="outline-none">
                    <UploadTab token={token} portal={p} />
                  </TabsContent>
                </Tabs>
              </section>
            )}

            <section aria-label="Your plots">
              <SectionTitle action={<span className="numerals text-[11px] text-ink-muted">{plural(p.plots.length, "plot")}</span>}>Your plots</SectionTitle>
              {p.plots.length ? (
                <ol className="border-t border-ink/60">
                  {p.plots.map((pl, i) => (
                    <li key={pl.id} className="ink-in grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-rule py-3" style={{ animationDelay: `${i * 35}ms` }}>
                      <span className="numerals text-[11px] text-ink-subtle">{lineNo(i)}</span>
                      <div className="min-w-0">
                        <p className="numerals truncate text-[13.5px] font-medium">{pl.reference}</p>
                        <p className="numerals text-[11px] text-ink-muted">
                          {pl.kind === "point" ? "POINT" : "BOUNDARY"} · {ha(pl.areaHa, 2)}
                        </p>
                        <div className="mt-1">
                          <VerdictBadge verdict={pl.verdict} />
                        </div>
                      </div>
                      {!submitted ? (
                        <Button size="icon" variant="ghost" aria-label={`Remove plot ${pl.reference}`} onClick={() => del.mutate(pl.id)} disabled={del.isPending}>
                          <Trash />
                        </Button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="border border-dashed border-rule-strong px-4 py-6 text-center text-[15px] italic text-ink-muted">No plots yet. Map your first plot above.</p>
              )}
            </section>

            {!submitted ? (
              <section className="grid gap-3 border-t-[3px] border-double border-ink/60 pt-5">
                <p className="text-[15px] text-ink-muted">When every plot is added, send them to {p.orgName}. You can’t change them after sending.</p>
                <Button variant="primary" size="lg" disabled={!p.plots.length} onClick={() => setConfirm(true)}>
                  <Send /> Send to {p.orgName.split(" ")[0]}
                </Button>
              </section>
            ) : null}

            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              title="Send your plots?"
              description={`${plural(p.plots.length, "plot")} will go to ${p.orgName} for review. You won’t be able to change them afterwards.`}
              confirmLabel="Send plots"
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
          </>
        )}
        <p className="text-center text-[13px] italic leading-relaxed text-ink-subtle">
          Plot locations are used only for EU deforestation due diligence (Regulation (EU) 2023/1115). Powered by Plotline.
        </p>
      </main>
    </div>
  );
}
