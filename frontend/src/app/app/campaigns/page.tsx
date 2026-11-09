"use client";

import { ChevronRight, Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { CampaignStatusBadge, CountryLabel } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, LoadingBlock, Meter, PageHeader } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useCampaigns, useCreateCampaign, useSuppliers } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Commodity } from "@/lib/api/types";
import { COMMODITIES, commodityLabel, date, daysUntil, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function StartCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
      <DialogContent
        size="lg"
        title="Start a data request campaign"
        description="Ask suppliers to map their plots. Plotline sends reminders, checks each upload and brings submissions to you for approval."
      >
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
              <Input id="c-due" type="date" value={dueDate} min={isoIn(1)} onChange={(e) => setDueDate(e.target.value)} />
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
              <legend className="text-[13px] font-medium">Suppliers</legend>
              {eligible.length ? (
                <button
                  type="button"
                  className="text-[13px] font-medium text-brand-fg hover:underline"
                  onClick={() => setPicked(picked.length === eligible.length ? [] : eligible.map((s) => s.id))}
                >
                  {picked.length === eligible.length ? "Clear all" : "Select all"}
                </button>
              ) : null}
            </div>
            <div className="max-h-60 overflow-y-auto rounded-md border border-border scrollbar-thin">
              {suppliers.isPending ? (
                <LoadingBlock className="p-3" rows={3} />
              ) : !eligible.length ? (
                <p className="p-4 text-sm text-muted">No suppliers grow {commodityLabel(commodity).toLowerCase()} yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {eligible.map((s) => (
                    <li key={s.id}>
                      <label className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5", picked.includes(s.id) && "bg-brand-soft/50")}>
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--brand)]"
                          checked={picked.includes(s.id)}
                          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.name}</span>
                          <span className="block text-xs text-muted">
                            <CountryLabel code={s.country} name={s.countryName} /> · {s.plots} plots mapped
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {errors.supplierIds ? (
              <p role="alert" className="text-xs text-noncompliant-fg">
                {errors.supplierIds}
              </p>
            ) : (
              <p className="text-xs text-muted">{picked.length} selected. Each supplier gets their own upload link.</p>
            )}
          </fieldset>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Start campaign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignsPage() {
  const q = useCampaigns();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <PageContainer>
      <PageHeader
        title="Campaigns"
        description="Collect plot data from many suppliers at once, with automatic reminders and your approval at the end."
        actions={
          can("campaigns:write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> Start a campaign
            </Button>
          ) : null
        }
      />
      {q.isPending ? (
        <LoadingBlock rows={3} />
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : !q.data.length ? (
        <Card>
          <EmptyState icon={<Megaphone />} title="No campaigns yet" body="Start one to request plot data from your suppliers before the deadline." />
        </Card>
      ) : (
        <ul className="grid gap-3">
          {q.data.map((c) => {
            const left = daysUntil(c.dueDate);
            return (
              <li key={c.id}>
                <Link href={`/app/campaigns/${c.id}`} className="block rounded-lg border border-border bg-surface p-4 outline-none transition-colors duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15px] font-semibold">{c.name}</h2>
                        <CampaignStatusBadge status={c.status} />
                      </div>
                      <p className="mt-1 text-[13px] text-muted">
                        {commodityLabel(c.commodity)} · {c.suppliers} suppliers · due {date(c.dueDate)}
                        {c.status === "running" ? (left >= 0 ? ` (${left} days left)` : " (past due)") : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-subtle" aria-hidden />
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Meter value={c.progressPct} tone="compliant" className="flex-1" label={`${c.name} progress`} />
                    <span className="w-10 text-right text-sm font-semibold tabular">{pct(c.progressPct)}</span>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{c.approved} approved</span>
                    <span>{c.awaitingReview} awaiting review</span>
                    <span className={cn(c.overdue > 0 && "font-medium text-noncompliant-fg")}>{c.overdue} overdue</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <StartCampaignDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
