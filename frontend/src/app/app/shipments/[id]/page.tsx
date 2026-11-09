"use client";

import { ArrowDown, ArrowLeft, ArrowRight, Blend, CircleCheck, FileCheck, Package, Ship } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckIcon, CHECK_META, CountryLabel, DdsBadge, RiskBadge, ShipmentBadge, VerdictBadge, VerdictDot } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardBody, CardHeader, ErrorState, Meter, Skeleton, Table, Td, Th } from "@/components/ui/display";
import { useCreateDds, useShipment, useTrace } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Shipment, Trace, TraceNode } from "@/lib/api/types";
import { commodityLabel, ha, kg, num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

function Node({ node, icon, sub, className }: { node: Pick<TraceNode, "label" | "verdict">; icon?: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2", className)}>
      {icon ? <span className="shrink-0 text-subtle [&_svg]:size-4">{icon}</span> : null}
      {node.verdict ? <VerdictDot verdict={node.verdict} /> : null}
      <div className="min-w-0">
        <p className="break-words text-[13px] font-medium leading-snug">{node.label}</p>
        {sub ? <p className="truncate text-xs text-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center justify-center text-subtle" aria-hidden>
      <ArrowDown className="size-4 lg:hidden" />
      <ArrowRight className="hidden size-4 lg:block" />
    </div>
  );
}

/** Product → shipment → suppliers → plots, as flat columns (stacked on phones). */
function TraceDiagram({ trace }: { trace: Trace }) {
  const byType = (t: TraceNode["type"]) => trace.nodes.filter((n) => n.type === t);
  const product = byType("product")[0];
  const shipment = byType("shipment")[0];
  const suppliers = byType("supplier");
  const plots = byType("plot");
  const qty = new Map(trace.edges.map((e) => [`${e.source}>${e.target}`, e.quantityKg ?? null]));
  const groups = suppliers.map((s) => ({
    supplier: s,
    plots: plots.filter((p) => trace.edges.some((e) => e.source === s.id && e.target === p.id)),
  }));
  const orphans = plots.filter((p) => !groups.some((g) => g.plots.includes(p)));
  if (orphans.length) groups.push({ supplier: { id: "_", type: "supplier", label: "Other suppliers" }, plots: orphans });
  const plotQty = (id: string) => {
    for (const e of trace.edges) if (e.target === id && e.quantityKg) return e.quantityKg;
    return null;
  };

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,2.4fr)]">
      {product ? <Node node={product} icon={<Package />} sub="Product" /> : <div />}
      <Arrow />
      {shipment ? <Node node={shipment} icon={<Ship />} sub="Shipment" /> : <div />}
      <Arrow />
      <ul className="grid gap-2">
        {groups.map((g) => (
          <li key={g.supplier.id} className="rounded-md border border-border bg-surface-2/50 p-2">
            <p className="flex items-center justify-between gap-2 px-1 pb-1.5 text-[13px] font-medium">
              <span className="truncate">{g.supplier.label}</span>
              {shipment && qty.get(`${shipment.id}>${g.supplier.id}`) ? (
                <span className="shrink-0 text-xs font-normal tabular text-muted">{kg(qty.get(`${shipment.id}>${g.supplier.id}`))}</span>
              ) : null}
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {g.plots.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/plots/${p.id}`} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Node node={p} sub={plotQty(p.id) ? kg(plotQty(p.id)) : undefined} className="hover:border-border-strong" />
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Header({ s }: { s: Shipment }) {
  const { can } = useSession();
  const createDds = useCreateDds();
  const router = useRouter();
  return (
    <div className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-semibold sm:text-2xl">{s.reference}</h1>
          <ShipmentBadge status={s.status} />
          {s.ddsStatus ? <DdsBadge status={s.ddsStatus} /> : null}
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {s.productName} · {commodityLabel(s.commodity)} · HS {s.hsCode} · {kg(s.quantityKg)} · harvest {s.harvestYear}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.ddsId ? (
          <Button asChild variant="primary">
            <Link href={`/app/statements/${s.ddsId}`}>
              <FileCheck /> View statement
            </Link>
          </Button>
        ) : s.status === "ready" && can("dds:write") ? (
          <Button
            variant="primary"
            loading={createDds.isPending}
            onClick={async () => {
              const d = await createDds.mutateAsync(s.id).catch(() => null);
              if (d) router.push(`/app/statements/${d.id}`);
            }}
          >
            <FileCheck /> Prepare due diligence statement
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function ShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const q = useShipment(id);
  const trace = useTrace(id);
  const s = q.data;

  if (q.isPending)
    return (
      <PageContainer wide>
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </PageContainer>
    );
  if (q.isError || !s)
    return (
      <PageContainer>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this shipment" />
        </Card>
      </PageContainer>
    );

  const failing = s.checks.filter((c) => c.status === "fail").length;
  const warning = s.checks.filter((c) => c.status === "warn").length;
  const total = s.mixing.verifiedKg + s.mixing.unverifiedKg;

  return (
    <PageContainer wide>
      <Link href="/app/shipments" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Shipments
      </Link>
      <Header s={s} />

      {s.status === "blocked" ? (
        <Callout tone="noncompliant" className="mb-4" icon={CHECK_META.fail.icon} title="This shipment can’t be placed on the EU market yet">
          {failing} {failing === 1 ? "check has" : "checks have"} failed. Resolve them below, then a due diligence statement can be prepared.
        </Callout>
      ) : s.status === "ready" && !s.ddsId ? (
        <Callout tone="compliant" className="mb-4" icon={<CircleCheck />} title="Cleared to ship">
          All checks passed{warning ? ` (${warning} with a warning to note)` : ""}. You can now prepare the due diligence statement.
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
          <Card>
            <CardHeader title="Supply-chain trace" description="From the product back to every plot it came from." />
            <CardBody>
              {trace.isPending ? (
                <Skeleton className="h-32" />
              ) : trace.isError ? (
                <ErrorState error={trace.error} onRetry={() => trace.refetch()} className="py-6" />
              ) : (
                <TraceDiagram trace={trace.data} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Volume check" description="Allocated quantity against what each plot could plausibly produce in a harvest year." />
            <Table>
              <thead>
                <tr>
                  <Th>Plot</Th>
                  <Th align="right">Allocated</Th>
                  <Th align="right">Plausible capacity</Th>
                  <Th className="min-w-36">Use of capacity</Th>
                </tr>
              </thead>
              <tbody>
                {s.massBalance.map((m) => (
                  <tr key={m.plotId}>
                    <Td>
                      <Link href={`/app/plots/${m.plotId}`} className="font-mono text-[13px] font-medium hover:underline">
                        {m.reference}
                      </Link>
                    </Td>
                    <Td align="right">{kg(m.allocatedKg)}</Td>
                    <Td align="right">{kg(m.capacityKg)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Meter value={Math.min(100, m.utilisationPct)} tone={m.ok ? "compliant" : "noncompliant"} className="min-w-16 flex-1" label={`${m.reference} capacity used`} />
                        <span className={cn("w-12 text-right text-xs font-medium tabular", !m.ok && "text-noncompliant-fg")}>{pct(m.utilisationPct)}</span>
                        <span className="sr-only">{m.ok ? "Plausible" : "More than the plot could produce"}</span>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {s.massBalance.some((m) => !m.ok) ? (
              <p className="px-4 py-3 text-xs text-noncompliant-fg sm:px-5">
                Some plots are allocated more than they could plausibly grow. This often means product from other, unmapped land was mixed in.
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Plots in this shipment" />
            <Table>
              <thead>
                <tr>
                  <Th>Plot</Th>
                  <Th>Supplier</Th>
                  <Th>Country</Th>
                  <Th>Verdict</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Area</Th>
                </tr>
              </thead>
              <tbody>
                {s.allocations.map((a) => (
                  <tr key={a.plotId}>
                    <Td>
                      <Link href={`/app/plots/${a.plotId}`} className="font-mono text-[13px] font-medium hover:underline">
                        {a.reference}
                      </Link>
                    </Td>
                    <Td className="max-w-[12rem] truncate">{a.supplierName}</Td>
                    <Td>
                      <CountryLabel code={a.country} />
                    </Td>
                    <Td>
                      <VerdictBadge verdict={a.verdict} />
                    </Td>
                    <Td align="right">{kg(a.quantityKg)}</Td>
                    <Td align="right">{ha(a.areaHa)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <CardHeader title="Checks" description={`${s.checks.length - failing - warning} passed · ${warning} warnings · ${failing} failed`} />
            <ul className="divide-y divide-border">
              {s.checks.map((c) => (
                <li key={c.code} className="flex gap-3 px-4 py-3 sm:px-5">
                  <CheckIcon status={c.status} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {c.label}
                      <span className="sr-only"> ({CHECK_META[c.status].label})</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Verified and unverified product" icon={<Blend />} />
            <CardBody className="grid gap-3">
              {s.mixing.mixed ? (
                <Callout tone="review" title="Mixed product">
                  This shipment combines product from verified plots with product that can’t yet be traced to a compliant plot. Under the regulation, the
                  whole shipment is treated as unverified until this is resolved.
                </Callout>
              ) : (
                <Callout tone="compliant" title="No mixing">
                  All product in this shipment comes from verified plots.
                </Callout>
              )}
              <div className="grid gap-1.5">
                <div className="flex h-2 gap-[2px]" role="img" aria-label={`Verified ${kg(s.mixing.verifiedKg)}, unverified ${kg(s.mixing.unverifiedKg)}`}>
                  {s.mixing.verifiedKg ? <span className="rounded-l-full bg-compliant first:rounded-l-full last:rounded-r-full" style={{ flexGrow: s.mixing.verifiedKg }} /> : null}
                  {s.mixing.unverifiedKg ? <span className="rounded-r-full bg-review first:rounded-l-full last:rounded-r-full" style={{ flexGrow: s.mixing.unverifiedKg }} /> : null}
                  {!total ? <span className="flex-1 rounded-full bg-surface-3" /> : null}
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>
                    <span className="mr-1 inline-block size-2 rounded-full bg-compliant" aria-hidden />
                    Verified {kg(s.mixing.verifiedKg)}
                  </span>
                  <span>
                    <span className="mr-1 inline-block size-2 rounded-full bg-review" aria-hidden />
                    Unverified {kg(s.mixing.unverifiedKg)}
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Country risk" description="EU country benchmarking for the countries of production." />
            <ul className="divide-y divide-border">
              {s.countries.map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <CountryLabel code={c.code} name={c.name} />
                  <RiskBadge tier={c.riskTier} />
                </li>
              ))}
            </ul>
            {s.countries.some((c) => c.riskTier === "high") ? (
              <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">High-risk countries require enhanced checks and closer review of every plot.</p>
            ) : s.countries.length && s.countries.every((c) => c.riskTier === "low") ? (
              <p className="border-t border-border px-4 py-3 text-xs text-muted sm:px-5">All origins are low risk, so simplified due diligence may apply.</p>
            ) : null}
          </Card>
          <p className="px-1 text-xs text-muted">
            {num(s.plots)} plots from {num(s.suppliers)} suppliers.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}
