"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Fragment } from "react";
import { stampDate } from "@/components/ledger/format";
import { IntegritySeal } from "@/components/ledger/seal";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/display";
import { useAudit, useAuditVerify } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { AuditEntry } from "@/lib/api/types";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A short grouped check code from a fingerprint: first 12 characters, upper case, in fours. */
function checkCode(v: unknown) {
  if (typeof v !== "string" || v.length < 12) return null;
  return v.slice(0, 12).toUpperCase().match(/.{4}/g)!.join("-");
}

/** The human reference an entry is about (plot, shipment, statement), never an internal id. */
function target(a: AuditEntry): { text: string; href: string | null } | null {
  const m = (a.metadata ?? {}) as Record<string, unknown>;
  const text = [m.reference, m.internalRef, m.shipmentReference, m.supplierName, m.name, m.email].find((x) => typeof x === "string") as string | undefined;
  if (!text) return null;
  const id = a.resourceId;
  const base: Record<string, string> = { plot: "/app/plots/", shipment: "/app/shipments/", dds: "/app/statements/", supplier: "/app/suppliers/", campaign: "/app/campaigns/" };
  return { text, href: id && a.resourceType && base[a.resourceType] ? `${base[a.resourceType]}${id}` : null };
}

const time = (v: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(v));

export default function AuditPage() {
  const { can } = useSession();
  const allowed = can("audit:read");
  const q = useAudit(undefined, allowed);
  const verify = useAuditVerify();
  const reduce = useReducedMotion();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const result = verify.data;
  const state = verify.isPending ? "checking" : result ? (result.valid ? "intact" : "broken") : "idle";
  const brokenAt = result && !result.valid ? Number(result.brokenAt) : null;

  if (!allowed)
    return (
      <PageContainer>
        <EmptyState title="The activity log isn’t part of your role" body="Ask an owner or auditor in your organisation if you need access." />
      </PageContainer>
    );

  let lastDay = "";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Account · Activity log"
        title="Chain of custody"
        description="Every sensitive action in your organisation, numbered in order. Each entry is sealed to the one before it, so any later change breaks the chain."
      />

      <div className="mb-10 grid items-center gap-6 border-y border-ink/60 py-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <IntegritySeal state={state} checked={result?.checked} brokenAt={result?.brokenAt} date={stampDate(new Date().toISOString())} />
        <div className="grid gap-3">
          <p className="text-[18px] leading-snug">
            {state === "intact"
              ? `All ${num(result!.checked)} entries were read back against their seals. None has been altered or removed.`
              : state === "broken"
                ? `${num(result!.checked)} entries were read. The chain breaks at entry #${result!.brokenAt}: that entry or one after it was changed. Tell your administrator.`
                : state === "checking"
                  ? "Reading every entry back against its seal…"
                  : "Check the seal to prove that no entry in this log was changed or removed after it was written."}
          </p>
          <div>
            <Button variant="primary" onClick={() => verify.mutate()} loading={verify.isPending}>
              {result ? "Check the seal again" : "Verify integrity"}
            </Button>
          </div>
        </div>
      </div>

      {q.isPending ? (
        <LoadingBlock rows={10} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !items.length ? (
        <EmptyState title="Nothing logged yet" />
      ) : (
        <>
          <ol className="relative" aria-label="Activity log, newest first">
            {/* the chain running down the margin: dashed until the seal is checked, then inked */}
            <span aria-hidden className="absolute bottom-0 left-[5rem] top-0 hidden border-l border-dashed border-rule-strong sm:block" />
            {state === "intact" || state === "broken" ? (
              <motion.span
                aria-hidden
                key={state}
                className={cn("absolute bottom-0 left-[calc(5rem-1px)] top-0 hidden w-[2px] origin-top sm:block", state === "intact" ? "bg-compliant" : "bg-noncompliant")}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 1.1, ease: [0.5, 0, 0.1, 1] }}
              />
            ) : null}
            {items.map((a, i) => {
              const day = stampDate(a.createdAt);
              const head = day !== lastDay;
              lastDay = day;
              const t = target(a);
              const code = checkCode((a.metadata as Record<string, unknown> | null)?.resultHash);
              const n = Number(a.id);
              const bad = brokenAt !== null && Number.isFinite(n) && n >= brokenAt;
              return (
                <Fragment key={a.id}>
                  {head ? (
                    <li aria-hidden className="relative z-10 pb-2 pt-6 first:pt-0">
                      <span className="numerals bg-paper pr-3 text-[11.5px] font-medium tracking-[0.08em] text-ink">{day}</span>
                    </li>
                  ) : null}
                  <li
                    className={cn("ink-in relative grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 border-b border-rule py-2.5 sm:grid-cols-[3.25rem_2rem_3rem_minmax(0,1fr)_minmax(0,11rem)]", bad && "hatch-faint")}
                    style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}
                  >
                    <span className="numerals pt-0.5 text-right text-[11.5px] text-ink-subtle">#{a.id}</span>
                    <span aria-hidden className="relative hidden justify-center pt-1 sm:flex">
                      <span className={cn("z-10 h-3 w-2 border bg-paper", state === "intact" ? "border-compliant" : bad ? "border-noncompliant" : "border-ink/60")} />
                    </span>
                    <span className="numerals hidden pt-0.5 text-[12px] text-ink-muted sm:block">{time(a.createdAt)}</span>
                    <div className="min-w-0">
                      <p className="text-[15.5px] leading-snug">{a.label}</p>
                      <p className="text-[13.5px] italic text-ink-muted">
                        {a.actorName ?? "Plotline, automatically"}
                        <span className="numerals not-italic sm:hidden"> · {time(a.createdAt)}</span>
                      </p>
                    </div>
                    <div className="col-span-2 col-start-2 min-w-0 sm:col-span-1 sm:col-start-auto sm:text-right">
                      {t ? (
                        t.href ? (
                          <Link href={t.href} className="numerals text-[12.5px] underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
                            {t.text}
                          </Link>
                        ) : (
                          <span className="numerals text-[12.5px]">{t.text}</span>
                        )
                      ) : null}
                      {code ? <p className="numerals text-[10.5px] text-ink-subtle">CHECK {code}</p> : null}
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ol>
          {q.hasNextPage ? (
            <div className="mt-4 text-center">
              <Button size="sm" variant="ghost" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Older entries
              </Button>
            </div>
          ) : (
            <p className="numerals mt-4 text-center text-[11px] uppercase text-ink-subtle">First entry · the chain begins here</p>
          )}
        </>
      )}
    </PageContainer>
  );
}
