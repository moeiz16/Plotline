"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { CampaignStatusBadge, CountryLabel } from "@/components/domain/status";
import { dMinus, stampDate } from "@/components/ledger/format";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Glyph, LoadingBlock, PageHeader, type Tone } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useCampaigns, useCreateCampaign, useSuppliers } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { CampaignListItem, Commodity } from "@/lib/api/types";
import { COMMODITIES, commodityLabel, daysUntil, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ── Plan a route: start a campaign ─────────────────────────────────────────── */
function PlanRouteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateCampaign();
  const suppliers = useSuppliers();
  const router = useRouter();
  const [name, setName] = useState("");
  const [commodity, setCommodity] = useState<Commodity>("cocoa");
  const [dueDate, setDueDate] = useState(isoIn(28));
  const [every, setEvery] = useState("7");
  const [picked, setPicked] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const eligible = useMemo(() => (suppliers.data ?? []).filter((s) => s.commodities.includes(commodity)), [suppliers.data, commodity]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Give the campaign a name, for example “Cocoa main crop 2026”.";
    if (!picked.length) errs.supplierIds = "Choose at least one supplier.";
    if (!dueDate || daysUntil(dueDate) < 1) errs.dueDate = "Choose a due date in the future.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const c = await create.mutateAsync({ name: name.trim(), commodity, supplierIds: picked, dueDate, reminderEveryDays: Number(every) });
      onOpenChange(false);
      router.push(`/app/campaigns/${c.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title="Plan a data request route" description="Each supplier becomes a stop. Plotline sends their link, reminds them on schedule, checks every upload and brings each stop to you for approval.">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Campaign name" htmlFor="c-name" error={errors.name}>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Commodity" htmlFor="c-commodity">
              <Select
                id="c-commodity"
                value={commodity}
                onChange={(e) => {
                  setCommodity(e.target.value as Commodity);
                  setPicked([]);
                }}
              >
                {COMMODITIES.map((c) => (
                  <option key={c} value={c}>
                    {commodityLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="c-due" error={errors.dueDate}>
              <Input id="c-due" type="date" value={dueDate} min={isoIn(1)} onChange={(e) => setDueDate(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Reminders" htmlFor="c-every">
              <Select id="c-every" value={every} onChange={(e) => setEvery(e.target.value)}>
                <option value="3">Every 3 days</option>
                <option value="7">Every week</option>
                <option value="14">Every 2 weeks</option>
              </Select>
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <legend className="label-caps text-ink">Stops on the route</legend>
              {eligible.length ? (
                <Button type="button" variant="link" onClick={() => setPicked(picked.length === eligible.length ? [] : eligible.map((s) => s.id))}>
                  {picked.length === eligible.length ? "Clear all" : "Select all"}
                </Button>
              ) : null}
            </div>
            <div className="max-h-60 overflow-y-auto border border-ink/40 scrollbar-thin">
              {suppliers.isPending ? (
                <LoadingBlock className="px-3" rows={3} />
              ) : !eligible.length ? (
                <p className="p-4 text-[15px] italic text-ink-muted">No suppliers grow {commodityLabel(commodity).toLowerCase()} yet.</p>
              ) : (
                <ol>
                  {eligible.map((s) => {
                    const at = picked.indexOf(s.id);
                    return (
                      <li key={s.id} className="border-b border-rule last:border-b-0">
                        <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5", at >= 0 && "bg-marker-soft/50")}>
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--marker-fill)]"
                            checked={at >= 0}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                          />
                          <span className="numerals w-7 text-[11px] text-ink-subtle">{at >= 0 ? String(at + 1).padStart(2, "0") : "··"}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px]">{s.name}</span>
                            <span className="block text-[13px] italic text-ink-muted">
                              <CountryLabel code={s.country} name={s.countryName} /> · {plural(s.plots, "plot")} mapped
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            {errors.supplierIds ? (
              <p role="alert" className="flex items-center gap-1.5 text-[13px] text-noncompliant-fg">
                <Glyph tone="noncompliant" size={8} /> {errors.supplierIds}
              </p>
            ) : (
              <p className="text-[13.5px] italic text-ink-muted">{plural(picked.length, "stop")} planned. Each supplier gets their own upload link.</p>
            )}
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Start the route
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── A campaign drawn as a route line: one stop per supplier ────────────────── */
function RouteLine({ c }: { c: CampaignListItem }) {
  const waiting = Math.max(0, c.suppliers - c.approved - c.awaitingReview - c.overdue);
  const stops: Tone[] = [
    ...Array<Tone>(c.approved).fill("compliant"),
    ...Array<Tone>(c.awaitingReview).fill("review"),
    ...Array<Tone>(waiting).fill("pending"),
    ...Array<Tone>(c.overdue).fill("noncompliant"),
  ];
  return (
    <ol className="flex items-center" aria-label={`${c.approved} approved, ${c.awaitingReview} awaiting review, ${waiting} on the way, ${c.overdue} overdue`}>
      {stops.map((t, i) => (
        <li key={i} className="flex flex-1 items-center last:flex-none">
          <span className="ink-in" style={{ animationDelay: `${i * 70}ms` }}>
            <Glyph tone={t} size={14} />
          </span>
          {i < stops.length - 1 ? <span aria-hidden className={cn("mx-1.5 h-0 flex-1 border-t-2", t === "compliant" ? "border-ink" : "border-dashed border-rule-strong")} /> : null}
        </li>
      ))}
      <li aria-hidden className="ml-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-marker-ink">
        <svg viewBox="0 0 10 14" className="h-3.5 w-2.5">
          <path d="M1.5 13V1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.5 1 9 3.2 1.5 5.4Z" fill="var(--marker)" />
        </svg>
        Due
      </li>
    </ol>
  );
}

export default function CampaignsPage() {
  const q = useCampaigns();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Routes · Campaigns"
        title="Data request routes"
        description="Each campaign is a route through your suppliers. A stop is reached when the supplier has sent plots and you approve them."
        actions={
          can("campaigns:write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> Plan a route
            </Button>
          ) : null
        }
      />
      {q.isPending ? (
        <LoadingBlock rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState title="No routes planned" body="Plan one to request plot data from your suppliers before the deadline." />
      ) : (
        <ol className="grid border-t border-ink/60">
          {q.data.map((c, i) => {
            const running = c.status === "running";
            const late = running && daysUntil(c.dueDate) < 0;
            return (
              <li key={c.id} className="ink-in" style={{ animationDelay: `${i * 35}ms` }}>
                <Link href={`/app/campaigns/${c.id}`} className="grid gap-4 border-b border-rule px-1 py-5 outline-none transition-colors hover:bg-sheet-2/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="numerals text-[11px] text-ink-subtle">ROUTE {String(i + 1).padStart(2, "0")}</span>
                      <h2 className="text-[21px] font-medium leading-tight tracking-[-0.01em]">{c.name}</h2>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-[14.5px] italic text-ink-muted">
                      {commodityLabel(c.commodity)} · {plural(c.suppliers, "stop")} · started {stampDate(c.createdAt).toLowerCase()}
                    </p>
                    <div className="mt-4">
                      <RouteLine c={c} />
                    </div>
                    <p className="numerals mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] uppercase text-ink-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <Glyph tone="compliant" size={9} /> {c.approved} approved
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Glyph tone="review" size={9} /> {c.awaitingReview} awaiting review
                      </span>
                      <span className={cn("inline-flex items-center gap-1.5", c.overdue > 0 && "text-noncompliant-fg")}>
                        <Glyph tone="noncompliant" size={9} /> {c.overdue} overdue
                      </span>
                    </p>
                  </div>
                  <div className="flex items-start gap-4 sm:flex-col sm:items-end sm:text-right">
                    <span className={cn("inline-flex items-stretch border font-mono text-[11px] font-medium uppercase tracking-[0.08em]", late ? "border-noncompliant" : "border-ink")}>
                      <span className={cn("numerals px-2 py-1", late ? "bg-noncompliant text-paper" : "bg-ink text-paper")}>{running ? dMinus(c.dueDate) : "Closed"}</span>
                      <span className="numerals px-2 py-1">{stampDate(c.dueDate)}</span>
                    </span>
                    <span className="numerals text-[28px] leading-none">
                      {c.progressPct}
                      <span className="text-[14px] text-ink-muted">%</span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <PlanRouteDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
