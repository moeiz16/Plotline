"use client";

import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, type FormEvent } from "react";
import { CountryLabel, RiskBadge } from "@/components/domain/status";
import { lineNo, stampDate } from "@/components/ledger/format";
import { PlotTally } from "@/components/ledger/tally";
import { CountUp } from "@/components/motion";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Glyph, Ledger, LedgerHead, LedgerRow, LoadingBlock, PageHeader, Segmented } from "@/components/ui/display";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useCountries, useCreateSupplier, useSuppliers } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Commodity, SupplierKind, SupplierListItem } from "@/lib/api/types";
import { COMMODITIES, SUPPLIER_KIND_LABEL, commodityLabel, num, plural } from "@/lib/format";

function AddSupplierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateSupplier();
  const countries = useCountries();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", country: "", kind: "cooperative" as SupplierKind, contactEmail: "", commodities: [] as Commodity[] });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Enter the supplier’s name.";
    if (!form.country) errs.country = "Choose the country where the plots are.";
    if (!form.commodities.length) errs.commodities = "Choose at least one commodity.";
    if (form.contactEmail && !/^\S+@\S+\.\S+$/.test(form.contactEmail)) errs.contactEmail = "Enter a valid email address.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const s = await create.mutateAsync({
        name: form.name.trim(),
        country: form.country,
        kind: form.kind,
        commodities: form.commodities,
        contactEmail: form.contactEmail.trim() || undefined,
      });
      onOpenChange(false);
      setForm({ name: "", country: "", kind: "cooperative", contactEmail: "", commodities: [] });
      router.push(`/app/suppliers/${s.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Open a supplier file" description="A cooperative, exporter, farm or trader you buy from. Once the file is open you can send them a link to map their plots.">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field label="Supplier name" htmlFor="s-name" error={errors.name}>
            <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country of production" htmlFor="s-country" error={errors.country}>
              <Select id="s-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} aria-invalid={!!errors.country}>
                <option value="">Choose a country</option>
                {(countries.data ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="s-kind">
              <Select id="s-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SupplierKind })}>
                {Object.entries(SUPPLIER_KIND_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="label-caps mb-1 text-ink-muted">Commodities</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COMMODITIES.map((c) => (
                <Checkbox
                  key={c}
                  label={commodityLabel(c)}
                  checked={form.commodities.includes(c)}
                  onChange={(v) => setForm({ ...form, commodities: v ? [...form.commodities, c] : form.commodities.filter((x) => x !== c) })}
                />
              ))}
            </div>
            {errors.commodities ? (
              <p role="alert" className="flex items-center gap-1.5 text-[13px] text-noncompliant-fg">
                <Glyph tone="noncompliant" size={8} /> {errors.commodities}
              </p>
            ) : null}
          </fieldset>
          <Field label="Contact email" htmlFor="s-email" optional error={errors.contactEmail} hint="Used for reminders during data requests.">
            <Input id="s-email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </Field>
          {errors.form ? <p className="text-[14px] text-noncompliant-fg">{errors.form}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Open file
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Order = "origin" | "attention";
const COLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.3fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_4.5rem_7.5rem]";

function SupplierLine({ s, i }: { s: SupplierListItem; i: number }) {
  return (
    <LedgerRow index={i} number={lineNo(i)} href={`/app/suppliers/${s.id}`} className={`${COLS} gap-x-4 gap-y-1.5`}>
      <div className="min-w-0">
        <p className="truncate text-[17px] font-medium leading-tight">{s.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="label-caps text-ink-subtle">{SUPPLIER_KIND_LABEL[s.kind] ?? s.kind}</span>
          {s.status === "active" ? null : <Badge tone="pending">Invited · nothing sent</Badge>}
        </p>
      </div>
      <span className="numerals self-start text-right text-[20px] leading-none md:hidden">{s.plots ? `${s.readinessPct}%` : "–"}</span>
      <p className="hidden min-w-0 text-[14.5px] italic text-ink-muted md:block">{s.commodities.map(commodityLabel).join(", ")}</p>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <PlotTally s={s} />
      </div>
      <span className="hidden text-right md:block">
        {s.plots ? <CountUp value={s.readinessPct} format={(n) => `${Math.round(n)}%`} className="numerals text-[18px]" /> : <span className="numerals text-ink-subtle">–</span>}
      </span>
      <span className="numerals col-span-2 text-[11.5px] text-ink-muted md:col-span-1 md:text-right">
        <span className="md:hidden">Last upload </span>
        {s.lastSubmissionAt ? stampDate(s.lastSubmissionAt) : "NO UPLOAD YET"}
      </span>
    </LedgerRow>
  );
}

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const list = useSuppliers(q ? { q } : undefined);
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<Order>("origin");
  const rows = useMemo(() => list.data ?? [], [list.data]);

  const groups = useMemo(() => {
    if (order === "attention") {
      const sorted = [...rows].sort((a, b) => b.nonCompliant + b.needsReview - (a.nonCompliant + a.needsReview) || a.readinessPct - b.readinessPct);
      return [{ key: "all", name: "", tier: null, items: sorted }];
    }
    const m = new Map<string, { key: string; name: string; tier: SupplierListItem["riskTier"] | null; items: SupplierListItem[] }>();
    for (const s of rows) {
      const g = m.get(s.country) ?? { key: s.country, name: s.countryName, tier: s.riskTier, items: [] };
      g.items.push(s);
      m.set(s.country, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, order]);

  const plots = rows.reduce((n, s) => n + s.plots, 0);
  const countries = new Set(rows.map((s) => s.country)).size;
  const invited = rows.filter((s) => s.status !== "active").length;
  let line = 0;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Ledger · Suppliers"
        title="Supplier register"
        description="Everyone you buy from, filed by country of origin. Each square is one plot they mapped, marked with its verdict."
        actions={
          can("suppliers:write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> Add supplier
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <p className="numerals flex flex-wrap gap-x-3 gap-y-1 text-[12px] uppercase tracking-[0.06em] text-ink-muted" aria-live="polite">
          <span className="text-ink">{plural(rows.length, "supplier")}</span>
          <span aria-hidden>·</span>
          <span>{plural(plots, "plot")}</span>
          <span aria-hidden>·</span>
          <span>{plural(countries, "country", "countries")} of origin</span>
          {invited ? (
            <>
              <span aria-hidden>·</span>
              <span className="text-marker-ink">{num(invited)} invited, nothing uploaded</span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input leading={<Search />} placeholder="Find a supplier" aria-label="Find a supplier" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-60" />
          <Segmented<Order>
            label="Order the register"
            value={order}
            onChange={setOrder}
            options={[
              { value: "origin", label: "By origin" },
              { value: "attention", label: "Needs attention" },
            ]}
          />
        </div>
      </div>

      {list.isPending ? (
        <LoadingBlock rows={8} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !rows.length ? (
        <EmptyState
          title={q ? "No supplier by that name" : "The register is empty"}
          body={q ? "Try another spelling." : "Add the cooperatives and exporters you buy from to start collecting plot data."}
          action={
            !q && can("suppliers:write") ? (
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Plus /> Add supplier
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-8">
          <LedgerHead className={`hidden pl-11 pr-1 md:grid ${COLS} gap-x-4`}>
            <span>Supplier</span>
            <span>Grows</span>
            <span>Plots, one square each</span>
            <span className="text-right">Ready</span>
            <span className="text-right">Last upload</span>
          </LedgerHead>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.name || "All suppliers"}>
              {g.name ? (
                <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-[21px] font-medium tracking-[-0.01em]">
                    <CountryLabel code={g.key} name={g.name} />
                  </h2>
                  <RiskBadge tier={g.tier} />
                  <span aria-hidden className="h-px min-w-6 flex-1 self-center bg-rule-strong" />
                  <span className="numerals text-[11.5px] text-ink-muted">{plural(g.items.length, "supplier")}</span>
                </div>
              ) : null}
              <Ledger label={g.name ? `Suppliers in ${g.name}` : "Suppliers"}>
                {g.items.map((s) => (
                  <SupplierLine key={s.id} s={s} i={line++} />
                ))}
              </Ledger>
            </section>
          ))}
        </div>
      )}
      <AddSupplierDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
