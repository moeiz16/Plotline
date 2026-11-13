"use client";

import { MapPin, Pentagon, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { IssueList } from "@/components/domain/import-result";
import { DrawMap, type DrawMode } from "@/components/map/draw-map";
import { Button } from "@/components/ui/button";
import { Callout, Glyph, Segmented } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api/client";
import type { Commodity, Geometry, PlotListItem, Position, ValidationResult } from "@/lib/api/types";
import { commodityLabel, ha } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PlotDraft {
  reference: string;
  commodity: Commodity;
  geometry: Geometry;
  declaredAreaHa?: number;
  producerName?: string;
}

function geometryFrom(mode: DrawMode, point: Position | null, vertices: Position[]): Geometry | null {
  if (mode === "point") return point ? { type: "Point", coordinates: point } : null;
  if (vertices.length < 3) return null;
  return { type: "Polygon", coordinates: [[...vertices, vertices[0]]] };
}

type CheckState = "idle" | "checking" | "done" | "error";

export function ValidationPanel({ state, result, error }: { state: CheckState; result: ValidationResult | null; error: string | null }) {
  if (state === "idle") return null;
  if (state === "checking")
    return (
      <div className="flex items-center gap-2.5 border border-dashed border-rule-strong bg-sheet-2/50 px-3 py-2.5 text-[14.5px] italic text-ink-muted" aria-live="polite">
        <span aria-hidden className="skeleton h-2 w-10" />
        Reading the plot against EUDR location rules…
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
    <div className={cn("border border-l-[3px] border-rule bg-sheet p-3", result.valid ? "border-l-compliant" : "border-l-noncompliant")} aria-live="polite">
      <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
        <Glyph tone={result.valid ? "compliant" : "noncompliant"} />
        {result.valid
          ? `Location is precise enough: ${result.kind === "point" ? "a point" : "a boundary"} of ${ha(result.areaHa, 2)}`
          : "This plot needs a correction before it can be saved"}
      </p>
      <IssueList issues={result.issues} className="mt-2" />
    </div>
  );
}

/**
 * Draw a plot on the map (boundary or single point), check it against the EUDR geolocation rules as it
 * takes shape, then save it. Used on the supplier upload link and by the compliance team in the app.
 */
export function PlotDrawForm({
  country,
  commodities,
  existing,
  validate,
  create,
  saving,
  showProducer = false,
  mapClassName = "h-[58dvh] max-h-[520px] min-h-[300px]",
  submitLabel = "Save plot",
  onSaved,
}: {
  country: string;
  commodities: Commodity[];
  existing?: PlotListItem[];
  validate: (body: { geometry: Geometry; country: string; declaredAreaHa?: number }) => Promise<ValidationResult>;
  create: (draft: PlotDraft) => Promise<unknown>;
  saving: boolean;
  showProducer?: boolean;
  mapClassName?: string;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const crops = commodities.length ? commodities : (["cocoa"] as Commodity[]);
  const [mode, setMode] = useState<DrawMode>("polygon");
  const [point, setPoint] = useState<Position | null>(null);
  const [vertices, setVertices] = useState<Position[]>([]);
  const [reference, setReference] = useState("");
  const [producer, setProducer] = useState("");
  const [commodity, setCommodity] = useState<Commodity>(crops[0]);
  const [declared, setDeclared] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [vState, setVState] = useState<CheckState>("idle");
  const [vResult, setVResult] = useState<ValidationResult | null>(null);
  const [vError, setVError] = useState<string | null>(null);
  const seq = useRef(0);
  const validateRef = useRef(validate);
  validateRef.current = validate;

  const geometry = useMemo(() => geometryFrom(mode, point, vertices), [mode, point, vertices]);
  const declaredNum = declared ? Number(declared) : undefined;

  // Check the shape against the EUDR rules as soon as it is complete (debounced).
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
        const r = await validateRef.current({ geometry, country, declaredAreaHa: declaredNum });
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
  }, [geometry, declaredNum, country]);

  function clear() {
    setPoint(null);
    setVertices([]);
    setVResult(null);
    setVState("idle");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!reference.trim()) return setFormError("Give the plot a reference, for example the farm or field number.");
    if (!geometry) return setFormError(mode === "point" ? "Tap the map to place the plot." : "Tap at least three corners of the plot on the map.");
    if (mode === "point" && !(declaredNum && declaredNum > 0)) return setFormError("Enter the plot’s approximate area in hectares.");
    if (!vResult?.valid) return setFormError("Please correct the plot first.");
    setFormError(null);
    try {
      await create({
        reference: reference.trim(),
        commodity,
        geometry: vResult.normalized ?? geometry,
        declaredAreaHa: declaredNum,
        producerName: showProducer && producer.trim() ? producer.trim() : undefined,
      });
      setReference("");
      setProducer("");
      setDeclared("");
      clear();
      onSaved?.();
    } catch (err) {
      if (err instanceof ApiError && err.problem.errors?.length) setFormError(err.problem.errors.map((x) => x.message).join(" "));
      else setFormError(errorMessage(err));
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
      <p className="text-[14.5px] italic leading-relaxed text-ink-muted">
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
        country={country}
        existing={existing ?? []}
        className={cn("border border-ink/50", mapClassName)}
      />
      {mode === "polygon" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="numerals mr-auto text-[12px] uppercase text-ink-muted" aria-live="polite">
            {vertices.length} {vertices.length === 1 ? "corner" : "corners"} staked
          </span>
          <Button size="sm" onClick={() => setVertices((v) => v.slice(0, -1))} disabled={!vertices.length}>
            <Undo2 /> Undo
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={!vertices.length}>
            Clear
          </Button>
        </div>
      ) : point ? (
        <div className="flex items-center justify-between gap-2 text-ink-muted">
          <span className="numerals text-[12px]">
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
              {crops.map((c) => (
                <option key={c} value={c}>
                  {commodityLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className={cn("grid gap-4", showProducer && "sm:grid-cols-2")}>
          <Field
            label="Approximate area (hectares)"
            htmlFor="p-area"
            optional={mode === "polygon"}
            hint={mode === "point" ? "Required for single points. Up to 4 ha." : "Calculated from the boundary."}
          >
            <Input id="p-area" type="number" inputMode="decimal" min={0} step="0.01" value={declared} onChange={(e) => setDeclared(e.target.value)} />
          </Field>
          {showProducer ? (
            <Field label="Producer reference" htmlFor="p-producer" optional hint="A farmer ID or code. Avoid full names where you can.">
              <Input id="p-producer" value={producer} onChange={(e) => setProducer(e.target.value)} autoComplete="off" />
            </Field>
          ) : null}
        </div>
        {formError ? (
          <p role="alert" className="flex items-center gap-1.5 text-[14px] text-noncompliant-fg">
            <Glyph tone="noncompliant" />
            {formError}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={saving} disabled={!vResult?.valid || vState !== "done"}>
          {submitLabel}
        </Button>
      </form>
    </div>
  );
}
