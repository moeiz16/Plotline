"use client";

import { Lock, ScrollText, ShieldCheck, ShieldX } from "lucide-react";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/display";
import { useAudit, useAuditVerify } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import { dateTime, num } from "@/lib/format";

export default function AuditPage() {
  const { can } = useSession();
  const allowed = can("audit:read");
  const q = useAudit(undefined, allowed);
  const verify = useAuditVerify();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  if (!allowed)
    return (
      <PageContainer>
        <Card>
          <EmptyState icon={<Lock />} title="The activity log isn’t part of your role" body="Ask an owner or auditor in your organisation if you need access." />
        </Card>
      </PageContainer>
    );

  return (
    <PageContainer>
      <PageHeader
        title="Activity log"
        description="Every sensitive action in your organisation, in order. Each entry is linked to the one before it, so any later change would be detected."
        actions={
          <Button onClick={() => verify.mutate()} loading={verify.isPending}>
            {!verify.isPending ? <ShieldCheck /> : null} Verify integrity
          </Button>
        }
      />
      {verify.data ? (
        verify.data.valid ? (
          <Callout tone="compliant" icon={<ShieldCheck />} className="mb-4" title="The log is intact">
            All {num(verify.data.checked)} entries were checked. None has been altered or removed.
          </Callout>
        ) : (
          <Callout tone="noncompliant" icon={<ShieldX />} className="mb-4" title="The log has been altered">
            {num(verify.data.checked)} entries were checked. The chain breaks at entry {String(verify.data.brokenAt)}. Contact your administrator.
          </Callout>
        )
      ) : null}
      <Card>
        {q.isPending ? (
          <LoadingBlock className="p-5" rows={8} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !items.length ? (
          <EmptyState icon={<ScrollText />} title="No activity yet" />
        ) : (
          <>
            <ol className="divide-y divide-border">
              {items.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.label}</p>
                    <p className="text-xs text-muted">{a.actorName ?? "Plotline (automatic)"}</p>
                  </div>
                  <time className="shrink-0 text-xs tabular text-muted" dateTime={a.createdAt}>
                    {dateTime(a.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
            {q.hasNextPage ? (
              <div className="border-t border-border p-3 text-center">
                <Button size="sm" variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                  Show older entries
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </PageContainer>
  );
}
