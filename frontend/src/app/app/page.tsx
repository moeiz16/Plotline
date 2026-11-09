"use client";

import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Info,
  Lightbulb,
  MapIcon,
  Pentagon,
  Ship,
  TriangleExclamationPoint,
  Trees,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer } from "@/components/shell/app-shell";
import { CountryLabel, RiskBadge, VerdictBadge } from "@/components/domain/status";
import { ReadinessRow, VerdictLegend } from "@/components/domain/readiness";
import { PlotMap } from "@/components/map/plot-map";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Meter,
  PageHeader,
  Segmented,
  Skeleton,
  Stat,
} from "@/components/ui/display";
import { useDashboard, usePlotsMap } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Dashboard } from "@/lib/api/types";
import { commodityLabel, dateLong, ha, num, pct, plural, relative } from "@/lib/format";
import { cn, firstName } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading overview" className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-96 lg:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

const insightIcon = {
  warning: <TriangleExclamationPoint className="size-4 text-review" aria-hidden />,
  positive: <CircleCheck className="size-4 text-compliant" aria-hidden />,
  info: <Info className="size-4 text-brand" aria-hidden />,
};

function Readiness({ d }: { d: Dashboard }) {
  const [by, setBy] = useState<"supplier" | "commodity" | "country">("supplier");
  return (
    <Card>
      <CardHeader
        title="Readiness"
        description="Share of plots confirmed compliant"
        action={
          <Segmented
            label="Group readiness by"
            value={by}
            onChange={setBy}
            options={[
              { value: "supplier", label: "Supplier" },
              { value: "commodity", label: "Commodity" },
              { value: "country", label: "Country" },
            ]}
          />
        }
      />
      <CardBody className="pt-2">
        {by === "supplier" ? (
          d.bySupplier.length ? (
            d.bySupplier.map((s) => (
              <ReadinessRow
                key={s.id}
                href={`/app/suppliers/${s.id}`}
                label={s.name}
                meta={<CountryLabel code={s.country} />}
                split={s}
                plots={s.plots}
                readinessPct={s.readinessPct}
              />
            ))
          ) : (
            <EmptyState title="No suppliers yet" className="py-8" />
          )
        ) : by === "commodity" ? (
          d.byCommodity.map((c) => <ReadinessRow key={c.key} label={c.label || commodityLabel(c.key)} split={c} plots={c.plots} readinessPct={c.readinessPct} />)
        ) : (
          d.byCountry.map((c) => (
            <ReadinessRow
              key={c.key}
              label={<CountryLabel code={c.key} name={c.label} />}
              meta={<RiskBadge tier={c.riskTier} className="h-5 text-[11px]" />}
              split={c}
              plots={c.plots}
              readinessPct={c.readinessPct}
            />
          ))
        )}
        <VerdictLegend className="mt-3 border-t border-border pt-3" />
      </CardBody>
    </Card>
  );
}

export default function OverviewPage() {
  const { me } = useSession();
  const q = useDashboard();
  const map = usePlotsMap();
  const router = useRouter();
  const d = q.data;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={me?.activeOrg?.name}
        title={`${greeting()}${me ? `, ${firstName(me.user.fullName)}` : ""}`}
        description="Where your supply chain stands against the EU Deforestation Regulation today."
        actions={
          <Button asChild>
            <Link href="/app/map">
              <MapIcon /> Open the map
            </Link>
          </Button>
        }
      />

      {q.isPending ? (
        <DashboardSkeleton />
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : d ? (
        <div className="grid gap-4">
          {/* Headline numbers */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-brand/25 bg-brand-soft p-4">
              <div className="flex items-center justify-between text-[13px] text-brand-fg">
                <span>Days to the EUDR deadline</span>
                <CalendarClock className="size-4" aria-hidden />
              </div>
              <div className="mt-2 text-3xl font-semibold tabular tracking-[-0.02em] text-fg">{num(d.deadline.daysLeft)}</div>
              <div className="mt-1 text-xs text-muted">
                {dateLong(d.deadline.date)} · {d.deadline.operatorSize === "sme" ? "micro and small enterprises" : "medium and large operators"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between text-[13px] text-muted">
                <span>Overall readiness</span>
                <CircleCheck className="size-4 text-subtle" aria-hidden />
              </div>
              <div className="mt-2 text-3xl font-semibold tabular tracking-[-0.02em]">{pct(d.kpis.readinessPct)}</div>
              <Meter value={d.kpis.readinessPct} tone="compliant" className="mt-3" label="Overall readiness" />
            </div>
            <Stat
              label="Plots at risk"
              icon={<TriangleExclamationPoint />}
              value={num(d.kpis.plotsNeedsReview + d.kpis.plotsNonCompliant)}
              sub={`${num(d.kpis.plotsNonCompliant)} non-compliant · ${num(d.kpis.plotsNeedsReview)} need review`}
              href="/app/reviews"
            />
            <Stat
              label="Shipments cleared to ship"
              icon={<Ship />}
              value={
                <>
                  {num(d.kpis.shipmentsReady)}
                  <span className="text-base font-normal text-muted"> of {num(d.kpis.shipments)}</span>
                </>
              }
              sub={`${num(d.kpis.shipmentsBlocked)} blocked · ${plural(d.kpis.shipmentsSubmitted, "statement")} filed`}
              href="/app/shipments"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Plots compliant" icon={<Pentagon />} value={`${num(d.kpis.plotsCompliant)} / ${num(d.kpis.plots)}`} sub={`${num(d.kpis.plotsPending)} not checked yet`} href="/app/plots" />
            <Stat label="Suppliers ready" icon={<Users />} value={`${num(d.kpis.suppliersReady)} / ${num(d.kpis.suppliers)}`} sub="All plots confirmed compliant" href="/app/suppliers" />
            <Stat label="Area mapped" icon={<MapIcon />} value={ha(d.kpis.areaHa)} sub="Across all supplier plots" />
            <Stat label="Forest cleared since 2021" icon={<Trees />} value={ha(d.kpis.deforestedHa)} sub="Found on mapped plots" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
              <Card className="overflow-hidden">
                <CardHeader
                  title="All plots"
                  description="Coloured by verdict. Select a plot for details."
                  action={
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/app/map">
                        Full map <ArrowRight />
                      </Link>
                    </Button>
                  }
                />
                <PlotMap
                  data={map.data}
                  compact
                  showBasemapToggle={false}
                  className="h-72 sm:h-80"
                  onSelect={(id) => {
                    if (id) router.push(`/app/plots/${id}`);
                  }}
                />
                <div className="border-t border-border px-4 py-2.5 sm:px-5">
                  <VerdictLegend />
                </div>
              </Card>
              <Readiness d={d} />
            </div>

            <div className="grid min-w-0 content-start gap-4">
              <Card>
                <CardHeader title="Insights" icon={<Lightbulb />} />
                <CardBody className="py-2">
                  {d.insights.length ? (
                    <ul className="divide-y divide-border">
                      {d.insights.map((i) => {
                        const body = (
                          <div className="flex gap-2.5 py-3">
                            <span className="mt-0.5 shrink-0">{insightIcon[i.tone] ?? insightIcon.info}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{i.title}</p>
                              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.body}</p>
                            </div>
                          </div>
                        );
                        return (
                          <li key={i.id}>
                            {i.href ? (
                              <Link href={i.href} className="-mx-2 block rounded-md px-2 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">
                                {body}
                              </Link>
                            ) : (
                              body
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-4 text-sm text-muted">Nothing needs your attention right now.</p>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Plots at risk"
                  action={
                    <Link href="/app/reviews" className="text-[13px] font-medium text-brand-fg hover:underline">
                      Review queue
                    </Link>
                  }
                />
                {d.plotsAtRisk.length ? (
                  <ul className="divide-y divide-border">
                    {d.plotsAtRisk.slice(0, 6).map((p) => (
                      <li key={p.id}>
                        <Link href={`/app/plots/${p.id}`} className="block px-4 py-3 outline-none hover:bg-surface-2 focus-visible:bg-surface-2 sm:px-5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-[13px] font-medium">{p.reference}</span>
                            <VerdictBadge verdict={p.verdict} />
                          </div>
                          <p className="mt-1 text-[13px] text-fg">{p.headline}</p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {p.supplierName} · {commodityLabel(p.commodity)} · {ha(p.areaHa)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={<CircleCheck />} title="No plots at risk" body="Every checked plot is compliant." className="py-8" />
                )}
              </Card>

              <Card>
                <CardHeader title="Recent activity" />
                <CardBody className="py-2">
                  {d.recentActivity.length ? (
                    <ol className="relative grid gap-0">
                      {d.recentActivity.slice(0, 8).map((a, i, arr) => (
                        <li key={a.id} className="relative flex gap-3 py-2.5">
                          <span className="relative mt-1.5 flex flex-col items-center">
                            <span className="size-2 rounded-full bg-border-strong" aria-hidden />
                            {i < arr.length - 1 ? <span className="absolute top-3 h-[calc(100%+4px)] w-px bg-border" aria-hidden /> : null}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13px]">{a.label}</p>
                            <p className="text-xs text-muted">
                              {a.actorName ? `${a.actorName} · ` : ""}
                              {relative(a.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="py-4 text-sm text-muted">No activity yet.</p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      ) : null}
      <p className={cn("mt-8 text-center text-xs text-subtle")}>
        Plotline is designed to support your due diligence under EUDR (Regulation (EU) 2023/1115). Decisions remain with your organisation.
      </p>
    </PageContainer>
  );
}
