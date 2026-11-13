"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { DdsBadge, RiskBadge, SHIPMENT_META, ShipmentBadge, VerdictDot } from "@/components/domain/status";
import { lineNo, stampDate } from "@/components/ledger/format";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, ErrorState, Glyph, Ledger, LedgerHead, LedgerRow, LoadingBlock, PageHeader } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useCreateShipment, usePlots, useProducts, useShipments } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { ShipmentListItem, ShipmentStatus } from "@/lib/api/types";
import { commodityLabel, ha, kg, num, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ── New shipment: a manifest entry form ────────────────────────────────────── */
function NewShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const products = useProducts();
  const create = useCreateShipment();
  const router = useRouter();
  const year = new Date().getFullYear();
  const [reference, setReference] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [harvestYear, setHarvestYear] = useState(String(year));
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const product = products.data?.find((p) => p.id === productId);
  const plots = usePlots(product ? { commodity: product.commodity } : undefined);
  const candidates = product ? (plots.data ?? []) : [];
  const allocated = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const qty = Number(quantity) || 0;
  const risky = candidates.filter((p) => alloc[p.id] !== undefined && p.verdict !== "compliant");
  const off = qty > 0 && Math.abs(allocated - qty) > 0.5;

  function reset() {
    setReference("");
    setProductId("");
    setQuantity("");
    setHarvestYear(String(year));
    setAlloc({});
    setErrors({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!reference.trim()) errs.reference = "Enter a shipment or batch reference.";
    if (!productId) errs.productId = "Choose a product.";
    if (!(qty > 0)) errs.quantityKg = "Enter the shipment quantity in kilograms.";
    const allocations = Object.entries(alloc)
      .map(([plotId, v]) => ({ plotId, quantityKg: Number(v) || 0 }))
      .filter((a) => a.quantityKg > 0);
    if (!allocations.length) errs.allocations = "Trace the shipment to at least one plot.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const s = await create.mutateAsync({ reference: reference.trim(), productId, quantityKg: qty, harvestYear: Number(harvestYear), allocations });
      onOpenChange(false);
      reset();
      router.push(`/app/shipments/${s.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="Enter a shipment" description="Write the consignment on the book and trace each kilogram to the plot it came from. The checks run as soon as it is entered.">
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="1 · Reference" htmlFor="sh-ref" error={errors.reference} hint="Your shipment, batch or contract number.">
              <Input id="sh-ref" value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={!!errors.reference} className="font-mono" />
            </Field>
            <Field label="2 · Product" htmlFor="sh-product" error={errors.productId}>
              <Select
                id="sh-product"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setAlloc({});
                }}
                aria-invalid={!!errors.productId}
              >
                <option value="">Choose a product</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · HS {p.hsCode}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="3 · Net quantity (kg)" htmlFor="sh-qty" error={errors.quantityKg}>
              <Input id="sh-qty" inputMode="decimal" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!errors.quantityKg} className="font-mono" />
            </Field>
            <Field label="4 · Harvest year" htmlFor="sh-year">
              <Select id="sh-year" value={harvestYear} onChange={(e) => setHarvestYear(e.target.value)}>
                {Array.from({ length: year - 2020 }, (_, i) => year - i).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="label-caps mb-1 text-ink">5 · Lines: plots of origin</legend>
            <p className="text-[14px] italic text-ink-muted">
              {product ? `Tick the ${commodityLabel(product.commodity).toLowerCase()} plots this shipment came from and write the kilograms against each.` : "Choose a product to list the matching plots."}
            </p>
            {product ? (
              <div className="max-h-64 overflow-y-auto border border-ink/40 scrollbar-thin">
                {plots.isPending ? (
                  <LoadingBlock className="px-3" rows={3} />
                ) : !candidates.length ? (
                  <p className="p-4 text-[15px] italic text-ink-muted">No plots for this commodity yet.</p>
                ) : (
                  <ul>
                    {candidates.map((p) => {
                      const on = alloc[p.id] !== undefined;
                      return (
                        <li key={p.id} className={cn("flex flex-wrap items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0", on && "bg-marker-soft/50")}>
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) =>
                                setAlloc((a) => {
                                  const n = { ...a };
                                  if (e.target.checked) n[p.id] = "";
                                  else delete n[p.id];
                                  return n;
                                })
                              }
                              className="size-4 accent-[var(--marker-fill)]"
                            />
                            <VerdictDot verdict={p.verdict} />
                            <span className="min-w-0">
                              <span className="numerals block truncate text-[13px] font-medium">{p.reference}</span>
                              <span className="block truncate text-[13px] italic text-ink-muted">
                                {p.supplierName} · {ha(p.areaHa)}
                              </span>
                            </span>
                          </label>
                          <Input
                            aria-label={`Kilograms from ${p.reference}`}
                            type="number"
                            min={0}
                            inputMode="decimal"
                            placeholder="kg"
                            disabled={!on}
                            value={alloc[p.id] ?? ""}
                            onChange={(e) => setAlloc((a) => ({ ...a, [p.id]: e.target.value }))}
                            className="w-28 font-mono"
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            {errors.allocations ? (
              <p role="alert" className="flex items-center gap-1.5 text-[13px] text-noncompliant-fg">
                <Glyph tone="noncompliant" size={8} /> {errors.allocations}
              </p>
            ) : null}
            {product ? (
              <div className="flex items-baseline justify-between gap-3 border-t-[3px] border-double border-ink/50 pt-2">
                <span className="label-caps text-ink-muted">Total traced</span>
                <span className={cn("numerals text-[13px]", off ? "text-review-fg" : "text-ink")}>
                  {kg(allocated)} of {kg(qty)}
                </span>
              </div>
            ) : null}
            {off ? <p className="text-[13.5px] italic text-review-fg">The lines should add up to the shipment quantity.</p> : null}
            {risky.length ? (
              <p className="flex items-start gap-1.5 text-[14px] text-review-fg">
                <Glyph tone="review" className="mt-1" />
                {risky.length} ticked {risky.length === 1 ? "plot is" : "plots are"} not confirmed compliant. The shipment will be blocked until they are cleared.
              </p>
            ) : null}
          </fieldset>
          {errors.form ? <p className="text-[14px] text-noncompliant-fg">{errors.form}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Enter shipment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── The book ───────────────────────────────────────────────────────────────── */
const FILTERS: ("" | ShipmentStatus)[] = ["", "blocked", "ready", "submitted", "draft"];
const RAIL: Record<ShipmentStatus, string> = {
  blocked: "hatch-noncompliant",
  ready: "bg-compliant",
  submitted: "bg-marker",
  draft: "border border-dashed border-pending",
};
const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[6px_minmax(0,1fr)_minmax(0,1.6fr)_7.5rem_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)]";

function ShipmentLine({ s, i }: { s: ShipmentListItem; i: number }) {
  return (
    <LedgerRow index={i} number={lineNo(i)} href={`/app/shipments/${s.id}`} className={`${COLS} items-stretch gap-x-4 gap-y-1`}>
      <span aria-hidden className={cn("hidden w-1.5 self-stretch md:block", RAIL[s.status])} />
      <div className="min-w-0">
        <p className="numerals text-[15px] font-medium text-ink">{s.reference}</p>
        <p className="numerals text-[11px] text-ink-subtle">HARVEST {s.harvestYear}</p>
      </div>
      <span className="numerals self-start text-right text-[14px] md:hidden">{kg(s.quantityKg)}</span>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className="truncate text-[15.5px]">{s.productName}</p>
        <p className="numerals text-[11px] text-ink-subtle">
          {commodityLabel(s.commodity).toUpperCase()} · HS {s.hsCode}
        </p>
      </div>
      <span className="numerals hidden text-right text-[14px] md:block">{num(s.quantityKg)}</span>
      <div className="hidden min-w-0 md:block">
        <p className="numerals text-[12.5px]">
          {num(s.plots)} / {num(s.suppliers)}
        </p>
        <RiskBadge tier={s.riskTier} />
      </div>
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:col-span-1 md:block">
        <ShipmentBadge status={s.status} />
        {s.issues ? <p className="text-[13.5px] italic text-noncompliant-fg md:mt-1">{plural(s.issues, "blocker")} to clear</p> : null}
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        {s.ddsStatus ? (
          <DdsBadge status={s.ddsStatus} />
        ) : s.status === "ready" ? (
          <span className="text-[14px] italic text-ink-muted">ready to draft</span>
        ) : (
          <span className="numerals text-[12px] text-ink-subtle">—</span>
        )}
        <p className="numerals mt-1 hidden text-[10.5px] text-ink-subtle md:block">UPDATED {stampDate(s.updatedAt)}</p>
      </div>
    </LedgerRow>
  );
}

export default function ShipmentsPage() {
  const [status, setStatus] = useState<"" | ShipmentStatus>("");
  const all = useShipments();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => (all.data ?? []).filter((s) => !status || s.status === status), [all.data, status]);
  const count = (f: "" | ShipmentStatus) => (all.data ?? []).filter((s) => !f || s.status === f).length;
  const totalKg = rows.reduce((n, s) => n + s.quantityKg, 0);

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Ledger · Shipments"
        title="Consignment book"
        description="Every shipment written as a manifest and traced to the plots it was grown on. A blocked line cannot carry a statement until its blockers are cleared."
        actions={
          can("shipments:write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> New shipment
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Chip key={f || "all"} active={status === f} onClick={() => setStatus(f)} icon={f ? <Glyph tone={SHIPMENT_META[f].tone} /> : undefined}>
              {f ? SHIPMENT_META[f].label : "All"} <span className="numerals opacity-70">{count(f)}</span>
            </Chip>
          ))}
        </div>
        <p className="numerals text-[11.5px] uppercase text-ink-muted" aria-live="polite">
          {plural(rows.length, "consignment")} · {kg(totalKg)} net
        </p>
      </div>

      {all.isPending ? (
        <LoadingBlock rows={8} />
      ) : all.isError ? (
        <ErrorState error={all.error} onRetry={() => all.refetch()} />
      ) : !rows.length ? (
        <EmptyState title={status ? "Nothing on the book with this status" : "The consignment book is empty"} body="Enter a shipment and trace it to the plots it came from." />
      ) : (
        <>
          <LedgerHead className={`hidden pl-11 pr-1 md:grid ${COLS} gap-x-4`}>
            <span />
            <span>Ref.</span>
            <span>Description of goods</span>
            <span className="text-right">Net kg</span>
            <span>Plots / suppl. · origin</span>
            <span>Clearance</span>
            <span>Statement</span>
          </LedgerHead>
          <Ledger label="Shipments" className="border-t-0">
            {rows.map((s, i) => (
              <ShipmentLine key={s.id} s={s} i={i} />
            ))}
          </Ledger>
          <div className="mt-1 flex justify-end border-t-[3px] border-double border-ink/60 pt-2">
            <span className="numerals text-[12.5px]">TOTAL {kg(totalKg)}</span>
          </div>
        </>
      )}
      <NewShipmentDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
