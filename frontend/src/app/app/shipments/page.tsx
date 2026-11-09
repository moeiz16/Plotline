"use client";

import { ChevronRight, Plus, Ship, TriangleExclamationPoint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { DdsBadge, RiskBadge, SHIPMENT_META, ShipmentBadge, VerdictBadge } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useCreateShipment, usePlots, useProducts, useShipments } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { ShipmentStatus } from "@/lib/api/types";
import { commodityLabel, ha, kg, num, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

function CreateShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
    if (!allocations.length) errs.allocations = "Allocate the shipment to at least one plot.";
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
      <DialogContent size="lg" title="New shipment" description="Record a shipment and the plots its product came from. Plotline then runs the traceability checks.">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference" htmlFor="sh-ref" error={errors.reference} hint="Your shipment, batch or contract number.">
              <Input id="sh-ref" value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={!!errors.reference} />
            </Field>
            <Field label="Product" htmlFor="sh-product" error={errors.productId}>
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
            <Field label="Quantity (kg)" htmlFor="sh-qty" error={errors.quantityKg}>
              <Input id="sh-qty" inputMode="decimal" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-invalid={!!errors.quantityKg} />
            </Field>
            <Field label="Harvest year" htmlFor="sh-year">
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
            <legend className="text-[13px] font-medium">Plots of origin</legend>
            <p className="text-xs text-muted">
              {product ? `Showing ${commodityLabel(product.commodity).toLowerCase()} plots. Enter how many kilograms came from each.` : "Choose a product to see matching plots."}
            </p>
            {product ? (
              <div className="max-h-64 overflow-y-auto rounded-md border border-border scrollbar-thin">
                {plots.isPending ? (
                  <LoadingBlock className="p-3" rows={3} />
                ) : !candidates.length ? (
                  <p className="p-4 text-sm text-muted">No plots for this commodity yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {candidates.map((p) => {
                      const on = alloc[p.id] !== undefined;
                      return (
                        <li key={p.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", on && "bg-brand-soft/50")}>
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
                              className="size-4 accent-[var(--brand)]"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-mono text-[13px] font-medium">{p.reference}</span>
                              <span className="block truncate text-xs text-muted">
                                {p.supplierName} · {ha(p.areaHa)}
                              </span>
                            </span>
                          </label>
                          <VerdictBadge verdict={p.verdict} />
                          <Input
                            aria-label={`Kilograms from ${p.reference}`}
                            type="number"
                            min={0}
                            inputMode="decimal"
                            placeholder="kg"
                            disabled={!on}
                            value={alloc[p.id] ?? ""}
                            onChange={(e) => setAlloc((a) => ({ ...a, [p.id]: e.target.value }))}
                            className="w-28"
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            {errors.allocations ? (
              <p role="alert" className="text-xs text-noncompliant-fg">
                {errors.allocations}
              </p>
            ) : null}
            {product ? (
              <p className={cn("text-xs tabular", qty && Math.abs(allocated - qty) > 0.5 ? "text-review-fg" : "text-muted")}>
                Allocated {kg(allocated)} of {kg(qty)}
                {qty && Math.abs(allocated - qty) > 0.5 ? " · allocations should add up to the shipment quantity" : ""}
              </p>
            ) : null}
            {risky.length ? (
              <p className="flex items-start gap-1.5 text-xs text-review-fg">
                <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {risky.length} selected {risky.length === 1 ? "plot is" : "plots are"} not confirmed compliant. The shipment will be blocked until resolved.
              </p>
            ) : null}
          </fieldset>
          {errors.form ? <p className="text-sm text-noncompliant-fg">{errors.form}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create shipment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FILTERS: ("" | ShipmentStatus)[] = ["", "ready", "blocked", "draft", "submitted"];

export default function ShipmentsPage() {
  const [status, setStatus] = useState<"" | ShipmentStatus>("");
  const q = useShipments(status || undefined);
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const rows = useMemo(() => q.data ?? [], [q.data]);

  return (
    <PageContainer wide>
      <PageHeader
        title="Shipments"
        description="Each shipment traced to the plots it came from, with the checks that decide whether it can be placed on the EU market."
        actions={
          can("shipments:write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> New shipment
            </Button>
          ) : null
        }
      />
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Chip key={f || "all"} active={status === f} onClick={() => setStatus(f)}>
            {f ? SHIPMENT_META[f].label : "All shipments"}
          </Chip>
        ))}
      </div>
      <Card>
        {q.isPending ? (
          <LoadingBlock className="p-5" rows={6} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          <EmptyState icon={<Ship />} title={status ? "No shipments with this status" : "No shipments yet"} body="Create a shipment and allocate it to the plots it came from." />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/shipments/${s.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[13px] font-medium">{s.reference}</span>
                        <ShipmentBadge status={s.status} />
                      </div>
                      <p className="mt-1 truncate text-[13px] text-muted">
                        {s.productName} · {kg(s.quantityKg)} · {s.plots} plots
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <Table className="hidden md:block">
              <thead>
                <tr>
                  <Th>Shipment</Th>
                  <Th>Product</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Plots</Th>
                  <Th>Country risk</Th>
                  <Th>Status</Th>
                  <Th>Statement</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="cursor-pointer transition-colors duration-150 hover:bg-surface-2/60" onClick={() => router.push(`/app/shipments/${s.id}`)}>
                    <Td>
                      <Link href={`/app/shipments/${s.id}`} className="font-mono text-[13px] font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.reference}
                      </Link>
                      <p className="text-xs text-muted">Harvest {s.harvestYear}</p>
                    </Td>
                    <Td>
                      {s.productName}
                      <p className="text-xs text-muted">
                        {commodityLabel(s.commodity)} · HS {s.hsCode}
                      </p>
                    </Td>
                    <Td align="right">{kg(s.quantityKg)}</Td>
                    <Td align="right">
                      {num(s.plots)}
                      <p className="text-xs text-muted">{plural(s.suppliers, "supplier")}</p>
                    </Td>
                    <Td>
                      <RiskBadge tier={s.riskTier} />
                    </Td>
                    <Td>
                      <ShipmentBadge status={s.status} />
                      {s.issues ? <p className="mt-1 text-xs text-muted">{plural(s.issues, "issue")}</p> : null}
                    </Td>
                    <Td>{s.ddsStatus ? <DdsBadge status={s.ddsStatus} /> : <span className="text-xs text-muted">Not prepared</span>}</Td>
                    <Td className="whitespace-nowrap text-muted">{relative(s.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>
      <CreateShipmentDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}

function plural(n: number, w: string) {
  return `${num(n)} ${n === 1 ? w : `${w}s`}`;
}
