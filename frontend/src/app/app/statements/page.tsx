"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DdsBadge } from "@/components/domain/status";
import { lineNo, stampDate } from "@/components/ledger/format";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Ledger, LedgerHead, LedgerRow, LoadingBlock, PageHeader, SectionTitle, Stamp } from "@/components/ui/display";
import { useCreateDds, useDdsList, useShipments } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { DdsListItem } from "@/lib/api/types";
import { commodityLabel, kg, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A filed sheet in miniature: ruled lines, a folded corner, the stamp when it has been submitted. */
function SheetThumb({ filed }: { filed: boolean }) {
  return (
    <svg viewBox="0 0 34 44" className="h-11 w-[34px] shrink-0" aria-hidden>
      <path d="M1 1h24l8 8v34H1Z" fill="var(--sheet)" stroke="var(--rule-strong)" />
      <path d="M25 1v8h8" fill="none" stroke="var(--rule-strong)" />
      {[14, 19, 24, 29].map((y) => (
        <path key={y} d={`M6 ${y}h${y === 29 ? 12 : 22}`} stroke="var(--ink-subtle)" strokeWidth="1" opacity="0.6" />
      ))}
      {filed ? <rect x="15" y="31" width="14" height="8" fill="none" stroke="var(--marker)" strokeWidth="1.4" transform="rotate(-8 22 35)" /> : <path d="M6 37h10" stroke="var(--rule-strong)" strokeDasharray="2 2" />}
    </svg>
  );
}

const COLS = "grid-cols-[34px_minmax(0,1fr)_auto] md:grid-cols-[34px_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_7rem_minmax(0,1fr)]";

function StatementLine({ d, i }: { d: DdsListItem; i: number }) {
  const filed = d.status !== "draft";
  return (
    <LedgerRow index={i} number={lineNo(i)} href={`/app/statements/${d.id}`} className={`${COLS} gap-x-4 gap-y-1.5`}>
      <SheetThumb filed={filed} />
      <div className="min-w-0">
        <p className="numerals whitespace-nowrap text-[15px] font-medium">{d.internalRef}</p>
        <p className="text-[14px] italic text-ink-muted">for shipment {d.shipmentReference}</p>
      </div>
      <div className="md:hidden">
        <DdsBadge status={d.status} />
      </div>
      <div className="col-span-3 min-w-0 md:col-span-1">
        <p className="label-caps text-ink-subtle">EU reference · verification</p>
        <p className="numerals text-[13px]">{d.referenceNumber ? `${d.referenceNumber} · ${d.verificationNumber ?? "–"}` : <span className="font-serif text-[14px] italic text-ink-muted">issued on submission</span>}</p>
      </div>
      <div className="hidden md:block">
        <DdsBadge status={d.status} />
      </div>
      <span className="numerals hidden text-[12px] text-ink-muted md:block">{stampDate(d.createdAt)}</span>
      <div className="col-span-3 md:col-span-1">
        {filed ? (
          <Stamp tone={d.status === "rejected" ? "noncompliant" : d.status === "accepted" ? "compliant" : "brand"} angle={-3} size="sm">
            Filed {stampDate(d.submittedAt)}
          </Stamp>
        ) : (
          <span className="text-[14px] italic text-ink-muted">unsigned draft</span>
        )}
      </div>
    </LedgerRow>
  );
}

function ReadyToFile() {
  const ready = useShipments("ready");
  const create = useCreateDds();
  const router = useRouter();
  const { can } = useSession();
  const rows = (ready.data ?? []).filter((s) => !s.ddsId);
  if (!rows.length) return null;
  return (
    <section className="mt-12" aria-label="Cleared shipments without a statement">
      <SectionTitle action={<span className="numerals shrink-0 text-[11px] text-ink-muted">{plural(rows.length, "shipment")}</span>}>In the tray</SectionTitle>
      <p className="-mt-1 mb-3 text-[14.5px] italic text-ink-muted">Cleared to ship, no statement drafted yet.</p>
      <ul className="grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 bg-sheet p-4">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/app/shipments/${s.id}`} className="numerals text-[14px] font-medium hover:underline">
                {s.reference}
              </Link>
              <span className="numerals text-[11px] text-ink-subtle">HS {s.hsCode}</span>
            </div>
            <p className="text-[14.5px] leading-snug">{s.productName}</p>
            <p className="numerals text-[11.5px] text-ink-muted">
              {kg(s.quantityKg)} · {commodityLabel(s.commodity).toUpperCase()}
            </p>
            {can("dds:write") ? (
              <Button
                size="sm"
                className="mt-auto justify-self-start self-start"
                loading={create.isPending && create.variables === s.id}
                onClick={async () => {
                  const d = await create.mutateAsync(s.id).catch(() => null);
                  if (d) router.push(`/app/statements/${d.id}`);
                }}
              >
                Draft statement
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StatementsPage() {
  const q = useDdsList();
  const rows = q.data ?? [];
  const filed = rows.filter((d) => d.status !== "draft").length;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Documents · Statements"
        title="Statement file"
        description="One due diligence statement per shipment placed on the EU market, kept with its evidence pack for five years."
      />
      <p className="mb-6 max-w-3xl border-l-2 border-marker pl-3 text-[15px] italic leading-relaxed text-ink-muted">
        In this workspace, submission to the EU information system (TRACES) is a demo submission. Reference numbers are generated here and nothing is sent to the EU.
      </p>

      {q.isPending ? (
        <LoadingBlock rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="Nothing filed yet" body="When a shipment is cleared to ship, draft its statement from the manifest or from the tray below." />
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="numerals text-[11.5px] uppercase text-ink-muted">
              {plural(rows.length, "statement")} · {filed} filed · {rows.length - filed} draft
            </span>
          </div>
          <LedgerHead className={cn("hidden pl-11 pr-1 md:grid gap-x-4", COLS)}>
            <span />
            <span>Statement</span>
            <span>EU numbers</span>
            <span>Status</span>
            <span>Prepared</span>
            <span>Filed</span>
          </LedgerHead>
          <Ledger label="Statements" className="border-t-0">
            {rows.map((d, i) => (
              <StatementLine key={d.id} d={d} i={i} />
            ))}
          </Ledger>
        </>
      )}
      <ReadyToFile />
    </PageContainer>
  );
}
