"use client";

import {
  CalendarClock,
  CircleCheck,
  FileUp,
  LoaderCircle,
  Lock,
  MapPin,
  Pentagon,
  Send,
  Trash,
  Undo2,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Logo } from "@/components/brand/logo";
import { FILE_HINT, ImportResultView, IssueList } from "@/components/domain/import-result";
import { CountryLabel, VerdictBadge } from "@/components/domain/status";
import { DrawMap, type DrawMode } from "@/components/map/draw-map";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardBody, CardHeader, EmptyState, ErrorState, Segmented, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlays";
import { ApiError, errorMessage } from "@/lib/api/client";
import {
  usePortal,
  usePortalCreatePlot,
  usePortalDeletePlot,
  usePortalImport,
  usePortalSubmit,
  usePortalValidate,
} from "@/lib/api/hooks";
import type { Commodity, Geometry, ImportResult, Portal, Position, ValidationResult } from "@/lib/api/types";
import { commodityLabel, dateLong, daysUntil, ha } from "@/lib/format";
import { cn } from "@/lib/utils";

function geometryFrom(mode: DrawMode, point: Position | null, vertices: Position[]): Geometry | null {
  if (mode === "point") return point ? { type: "Point", coordinates: point } : null;
  if (vertices.length < 3) return null;
  return { type: "Polygon", coordinates: [[...vertices, vertices[0]]] };
}

function ValidationPanel({ state, result, error }: { state: "idle" | "checking" | "done" | "error"; result: ValidationResult | null; error: string | null }) {
  if (state === "idle") return null;
  if (state === "checking")
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-muted" aria-live="polite">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking your plot…
      </div>
    );
  if (state === "error")
    return (
      <Callout tone="noncompliant" className="py-2.5">
        <span role="alert">{error}</span>
      </Callout>
    );
  if (!result) return null;
  return (
    <div
      className={cn("rounded-md border p-3", result.valid ? "border-compliant/25 bg-compliant-soft" : "border-noncompliant/25 bg-noncompliant-soft")}
      aria-live="polite"
    >
      <p className={cn("flex items-center gap-2 text-sm font-medium", result.valid ? "text-compliant-fg" : "text-noncompliant-fg")}>
        {result.valid ? <CircleCheck className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
        {result.valid
          ? `Looks good: ${result.kind === "point" ? "a point" : "a boundary"} of ${ha(result.areaHa, 2)}`
          : "This plot needs a correction before it can be saved"}
      </p>
      <IssueList issues={result.issues} className="mt-2" />
    </div>
  );
}

function DrawTab({ token, portal }: { token: string; portal: Portal }) {
  const [mode, setMode] = useState<DrawMode>("polygon");
  const [point, setPoint] = useState<Position | null>(null);
  const [vertices, setVertices] = useState<Position[]>([]);
  const [reference, setReference] = useState("");
  const [commodity, setCommodity] = useState<Commodity>(portal.commodities[0] ?? "cocoa");
  const [declared, setDeclared] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const validate = usePortalValidate(token);
  const create = usePortalCreatePlot(token);
  const [vState, setVState] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [vResult, setVResult] = useState<ValidationResult | null>(null);
  const [vError, setVError] = useState<string | null>(null);
  const seq = useRef(0);

  const geometry = useMemo(() => geometryFrom(mode, point, vertices), [mode, point, vertices]);
  const declaredNum = declared ? Number(declared) : undefined;

  // Check the shape against EUDR rules as soon as it is complete (debounced).
  useEffect(() => {
    if (!geometry) {
      setVState("idle");
      setVResult(null);
      return;
    }
    const n = ++seq.current;
    setVState("checking");
    const t = setTimeout(async () => {
      try {
        const r = await validate.mutateAsync({ geometry, country: portal.country, declaredAreaHa: declaredNum });
        if (n !== seq.current) return;
        setVResult(r);
        setVState("done");
      } catch (e) {
        if (n !== seq.current) return;
        setVError(errorMessage(e));
        setVState("error");
      }
    }, 450);
    return () => clearTimeout(t);
    // validate is stable enough; re-run only when inputs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, declaredNum, portal.country]);

  function clear() {
    setPoint(null);
    setVertices([]);
    setVResult(null);
    setVState("idle");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!reference.trim()) return setFormError("Give the plot a reference, for example the farm or field number.");
    if (!geometry) return setFormError(mode === "point" ? "Tap the map to place your plot." : "Tap at least three corners of your plot on the map.");
    if (mode === "point" && !(declaredNum && declaredNum > 0)) return setFormError("Enter the plot’s approximate area in hectares.");
    if (!vResult?.valid) return setFormError("Please correct the plot first.");
    setFormError(null);
    try {
      await create.mutateAsync({ reference: reference.trim(), commodity, geometry: vResult.normalized ?? geometry, declaredAreaHa: declaredNum });
      setReference("");
      setDeclared("");
      clear();
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors?.length) setFormError(err.problem.errors.map((x) => x.message).join(" "));
    }
  }

  return (
    <div className="grid gap-4">
      <Segmented<DrawMode>
        label="How to map the plot"
        value={mode}
        onChange={(m) => {
          setMode(m);
          clear();
        }}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        options={[
          { value: "polygon", label: (<><Pentagon aria-hidden /> Draw boundary</>) },
          { value: "point", label: (<><MapPin aria-hidden /> Single point</>) },
        ]}
      />
      <p className="text-[13px] leading-relaxed text-muted">
        {mode === "polygon"
          ? "Tap each corner of the plot in order. Three or more corners make a shape. Required for plots larger than 4 hectares."
          : "Tap the centre of the plot, or use your location while standing in it. Points are allowed for plots of 4 hectares or less."}
      </p>
      <DrawMap
        mode={mode}
        point={point}
        vertices={vertices}
        onPoint={setPoint}
        onVertices={setVertices}
        country={portal.country}
        existing={portal.plots}
        className="h-[58dvh] max-h-[520px] min-h-[300px] rounded-lg border border-border"
      />
      {mode === "polygon" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[13px] text-muted">
            {vertices.length} {vertices.length === 1 ? "corner" : "corners"} placed
          </span>
          <Button size="sm" onClick={() => setVertices((v) => v.slice(0, -1))} disabled={!vertices.length}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={!vertices.length}>
            Clear
          </Button>
        </div>
      ) : point ? (
        <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
          <span className="tabular">
            {point[1].toFixed(6)}, {point[0].toFixed(6)}
          </span>
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
        </div>
      ) : null}

      <ValidationPanel state={vState} result={vResult} error={vError} />

      <form onSubmit={save} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plot reference" htmlFor="p-ref" hint="Your own name or number for this plot.">
            <Input id="p-ref" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Crop" htmlFor="p-commodity">
            <Select id="p-commodity" value={commodity} onChange={(e) => setCommodity(e.target.value as Commodity)}>
              {(portal.commodities.length ? portal.commodities : (["cocoa"] as Commodity[])).map((c) => (
                <option key={c} value={c}>
                  {commodityLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Approximate area (hectares)"
          htmlFor="p-area"
          optional={mode === "polygon"}
          hint={mode === "point" ? "Required for single points. Up to 4 ha." : "We calculate the area from your boundary."}
        >
          <Input id="p-area" type="number" inputMode="decimal" min={0} step="0.01" value={declared} onChange={(e) => setDeclared(e.target.value)} />
        </Field>
        {formError ? (
          <p role="alert" className="text-sm text-noncompliant-fg">
            {formError}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={create.isPending} disabled={!vResult?.valid || vState !== "done"}>
          Save plot
        </Button>
      </form>
    </div>
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
  const submitted = !!p?.submittedAt;

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
