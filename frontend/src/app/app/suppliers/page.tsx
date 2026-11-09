"use client";

import { ChevronRight, Handshake, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState, type FormEvent } from "react";
import { VerdictBar } from "@/components/domain/readiness";
import { CountryLabel, RiskBadge } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useCountries, useCreateSupplier, useSuppliers } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Commodity, SupplierKind } from "@/lib/api/types";
import { COMMODITIES, SUPPLIER_KIND_LABEL, commodityLabel, pct, relative } from "@/lib/format";

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
      <DialogContent title="Add a supplier" description="Add a cooperative, exporter, farm or trader you buy from. You can then send them a link to map their plots.">
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
            <legend className="mb-1 text-[13px] font-medium">Commodities</legend>
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
              <p role="alert" className="text-xs text-noncompliant-fg">
                {errors.commodities}
              </p>
            ) : null}
          </fieldset>
          <Field label="Contact email" htmlFor="s-email" optional error={errors.contactEmail} hint="Used for reminders during data requests.">
            <Input id="s-email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </Field>
          {errors.form ? <p className="text-sm text-noncompliant-fg">{errors.form}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Add supplier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const list = useSuppliers(q ? { q } : undefined);
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <PageContainer wide>
      <PageHeader
        title="Suppliers"
        description="Who you buy from, where their plots are and how close each one is to being ready."
        actions={
          can("suppliers:write") ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> Add supplier
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="border-b border-border p-4 sm:px-5">
          <Input leading={<Search />} placeholder="Search suppliers" aria-label="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-xs" />
        </div>
        {list.isPending ? (
          <LoadingBlock className="p-5" rows={6} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data.length ? (
          <EmptyState
            icon={<Handshake />}
            title={q ? "No suppliers match your search" : "No suppliers yet"}
            body={q ? "Try a different name." : "Add the cooperatives and exporters you buy from to start collecting plot data."}
            action={
              !q && can("suppliers:write") ? (
                <Button variant="primary" onClick={() => setOpen(true)}>
                  <Plus /> Add supplier
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {list.data.map((s) => (
                <li key={s.id}>
                  <Link href={`/app/suppliers/${s.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{s.name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular">{pct(s.readinessPct)}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted">
                        <CountryLabel code={s.country} name={s.countryName} /> · {s.plots} plots
                      </p>
                      <VerdictBar split={s} className="mt-2" />
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <Table className="hidden md:block">
              <thead>
                <tr>
                  <Th>Supplier</Th>
                  <Th>Country</Th>
                  <Th>Commodities</Th>
                  <Th align="right">Plots</Th>
                  <Th className="w-[22%]">Readiness</Th>
                  <Th>Status</Th>
                  <Th>Last upload</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((s) => (
                  <tr key={s.id} className="cursor-pointer transition-colors duration-150 hover:bg-surface-2/60" onClick={() => router.push(`/app/suppliers/${s.id}`)}>
                    <Td>
                      <Link href={`/app/suppliers/${s.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.name}
                      </Link>
                      <p className="text-xs text-muted">{SUPPLIER_KIND_LABEL[s.kind] ?? s.kind}</p>
                    </Td>
                    <Td>
                      <div className="grid justify-items-start gap-1">
                        <CountryLabel code={s.country} name={s.countryName} />
                        <RiskBadge tier={s.riskTier} className="h-5 text-[11px]" />
                      </div>
                    </Td>
                    <Td className="text-muted">{s.commodities.map(commodityLabel).join(", ")}</Td>
                    <Td align="right">{s.plots}</Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <VerdictBar split={s} className="min-w-20 flex-1" />
                        <span className="w-10 text-right text-sm font-semibold tabular">{pct(s.readinessPct)}</span>
                      </div>
                    </Td>
                    <Td>{s.status === "active" ? <Badge tone="brand">Active</Badge> : <Badge>Invited</Badge>}</Td>
                    <Td className="whitespace-nowrap text-muted">{s.lastSubmissionAt ? relative(s.lastSubmissionAt) : "No uploads yet"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>
      <AddSupplierDialog open={open} onOpenChange={setOpen} />
    </PageContainer>
  );
}
