"use client";

import { ArrowRight, CircleCheck, Scale } from "lucide-react";
import Link from "next/link";
import { ChangeBadge, CountryLabel, VerdictBadge } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/display";
import { useReviews } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import { commodityLabel, ha, relative } from "@/lib/format";

export default function ReviewsPage() {
  const q = useReviews();
  const { can } = useSession();
  return (
    <PageContainer>
      <PageHeader
        title="Review queue"
        description="Plots where the official forest data and the satellite land-change check need a person’s judgement before the plot can be used."
      />
      {!can("plots:review") ? (
        <Callout tone="neutral" icon={<Scale />} className="mb-4" title="You can view this queue">
          Decisions are made by colleagues with the reviewer role.
        </Callout>
      ) : null}
      <Card>
        {q.isPending ? (
          <LoadingBlock className="p-5" rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data.length ? (
          <EmptyState icon={<CircleCheck />} title="Nothing waiting for review" body="New plots that need a decision will appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{p.reference}</span>
                    <VerdictBadge verdict={p.verdict} />
                    <ChangeBadge level={p.changeLevel} prefix="Land change" />
                  </div>
                  {p.headline ? <p className="mt-1.5 text-sm">{p.headline}</p> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                    <span>{p.supplierName}</span>·<span>{commodityLabel(p.commodity)}</span>·<span>{ha(p.areaHa)}</span>·
                    <CountryLabel code={p.country} name={p.countryName} />
                    {p.assessedAt ? <span>· checked {relative(p.assessedAt)}</span> : null}
                  </p>
                </div>
                <Button asChild variant={can("plots:review") ? "primary" : "secondary"} size="sm" className="self-start sm:self-center">
                  <Link href={`/app/plots/${p.id}#review`}>
                    {can("plots:review") ? "Review" : "Open"} <ArrowRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageContainer>
  );
}
