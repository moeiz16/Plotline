"use client";

import { ChevronRight, FileCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DdsBadge } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Callout, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { useDdsList } from "@/lib/api/hooks";
import { date } from "@/lib/format";

export default function StatementsPage() {
  const q = useDdsList();
  const router = useRouter();
  return (
    <PageContainer wide>
      <PageHeader
        title="Due diligence statements"
        description="One statement per shipment placed on the EU market, with its evidence pack and submission record. Kept for five years."
      />
      <Callout tone="neutral" className="mb-4" title="Demo submissions">
        In this workspace, submission to the EU information system (TRACES) is simulated. Reference numbers are generated for demonstration and nothing is
        sent to the EU.
      </Callout>
      <Card>
        {q.isPending ? (
          <LoadingBlock className="p-5" rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data.length ? (
          <EmptyState
            icon={<FileCheck />}
            title="No statements yet"
            body="When a shipment is cleared to ship, prepare its due diligence statement from the shipment page."
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {q.data.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/statements/${d.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[13px] font-medium">{d.internalRef}</span>
                        <DdsBadge status={d.status} />
                      </div>
                      <p className="mt-1 truncate text-[13px] text-muted">
                        Shipment {d.shipmentReference} · {d.referenceNumber ?? "No reference yet"}
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
                  <Th>Statement</Th>
                  <Th>Shipment</Th>
                  <Th>Status</Th>
                  <Th>Reference number</Th>
                  <Th>Verification number</Th>
                  <Th>Prepared</Th>
                  <Th>Submitted</Th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((d) => (
                  <tr key={d.id} className="cursor-pointer transition-colors duration-150 hover:bg-surface-2/60" onClick={() => router.push(`/app/statements/${d.id}`)}>
                    <Td>
                      <Link href={`/app/statements/${d.id}`} className="font-mono text-[13px] font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {d.internalRef}
                      </Link>
                    </Td>
                    <Td className="font-mono text-[13px]">{d.shipmentReference}</Td>
                    <Td>
                      <DdsBadge status={d.status} />
                    </Td>
                    <Td className="font-mono text-[13px]">{d.referenceNumber ?? <span className="font-sans text-muted">Assigned on submission</span>}</Td>
                    <Td className="font-mono text-[13px]">{d.verificationNumber ?? <span className="font-sans text-muted">–</span>}</Td>
                    <Td className="whitespace-nowrap text-muted">{date(d.createdAt)}</Td>
                    <Td className="whitespace-nowrap text-muted">{d.submittedAt ? date(d.submittedAt) : "–"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
