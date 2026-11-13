"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LossChart } from "@/components/charts/loss-chart";
import { checkCode } from "@/components/domain/check-code";
import { ImageCompare } from "@/components/domain/image-compare";
import { ReviewActions, ReviewDialog } from "@/components/domain/review-actions";
import { ChangeBadge, CountryLabel, VERDICT_META, VerdictDot } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { DefinitionList, EmptyState, ErrorState, Glyph, LoadingBlock, PageHeader, Skeleton } from "@/components/ui/display";
import { usePlot, useReviews } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { ChangeLevel, PlotListItem, ReviewDecision } from "@/lib/api/types";
import { commodityLabel, ha, relative, share } from "@/lib/format";
import { cn } from "@/lib/utils";

const signalRank: Record<ChangeLevel, number> = { high: 0, elevated: 1, low: 2 };

/** Riskiest first: non-compliant, then the strongest land-change signal, then the largest plot. */
function triage(list: PlotListItem[]) {
  return [...list].sort(
    (a, b) =>
      Number(b.verdict === "non_compliant") - Number(a.verdict === "non_compliant") ||
      (signalRank[a.changeLevel ?? "low"] ?? 3) - (signalRank[b.changeLevel ?? "low"] ?? 3) ||
      b.areaHa - a.areaHa,
  );
}

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-rule-strong bg-sheet px-1 font-mono text-[10.5px] text-ink">{children}</kbd>;
}

/** The evidence for one queued plot, beside the ledger (desktop) or under its line (phone). */
function Inspector({ item, canReview, compact }: { item: PlotListItem; canReview: boolean; compact?: boolean }) {
  const q = usePlot(item.id);
  const p = q.data;
  const a = p?.latestAssessment ?? null;
  if (q.isPending)
    return (
      <div role="status" aria-label="Opening plot">
        <Skeleton className="aspect-square w-full" />
        <LoadingBlock rows={4} className="mt-4" />
      </div>
    );
  if (q.isError || !p) return <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-8" />;
  return (
    <div className="fade-in" key={p.id}>
      {!compact ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="numerals text-[18px] text-ink">{p.reference}</p>
              <p className="mt-0.5 text-[14px] italic text-ink-muted">
                {p.supplierName} · {commodityLabel(p.commodity)} · <CountryLabel code={p.country} name={p.countryName} className="not-italic" />
              </p>
            </div>
            <Link href={`/app/plots/${p.id}`} className="label-caps inline-flex shrink-0 items-center gap-1 pt-1 text-ink-muted outline-none hover:text-marker-ink focus-visible:ring-2 focus-visible:ring-ring">
              Record <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <p className="mt-3 border-y border-rule py-2.5 text-[18px] leading-snug text-ink">{a?.headline ?? p.headline}</p>
        </>
      ) : null}
      <ImageCompare plotId={p.id} version={a?.id} compact className="mt-4" />
      {a ? (
        <>
          <DefinitionList
            className="mt-4 [&>div]:py-2 [&>div]:text-[14px]"
            items={[
              { label: "Forest at end of 2020", value: <span className="numerals text-[13px]">{ha(a.forest2020Ha, 1)} ({share(a.forest2020Share)})</span> },
              { label: "Lost after the cut-off", value: <span className={cn("numerals text-[13px]", (a.lossAfter2020Ha ?? 0) > 0 && "text-noncompliant-fg")}>{ha(a.lossAfter2020Ha, 2)}</span> },
              { label: "Land-change signal", value: <ChangeBadge level={a.changeLevel} /> },
              { label: "Signals agree", value: <span className="text-[14px] italic">{a.signalsAgree === null ? "Too cloudy to tell" : a.signalsAgree ? "Yes" : "No: a person decides"}</span> },
              { label: "Check code", value: <span className="numerals text-[13px]">{checkCode(a.resultHash)}</span> },
            ]}
          />
          <div className="mt-4">
            <LossChart byYear={a.lossByYear} compact />
          </div>
        </>
      ) : null}
      {canReview ? (
        <div className="mt-5 border-t border-ink/60 pt-4">
          <ReviewActions plotId={p.id} reference={p.reference} verdict={p.verdict} assessment={a} hint={!compact} />
        </div>
      ) : (
        <p className="mt-5 border-t border-ink/60 pt-4 text-[14px] italic text-ink-muted">You can read this queue. Decisions are recorded by colleagues with the reviewer role.</p>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  const q = useReviews();
  const { can } = useSession();
  const canReview = can("plots:review");
  const router = useRouter();
  const desktop = useDesktop();
  const list = useMemo(() => triage(q.data ?? []), [q.data]);
  const [focus, setFocus] = useState(0);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.min(focus, Math.max(0, list.length - 1));
  const current = list[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [role=dialog], [role=slider]")) return;
      if (!list.length) return;
      const k = e.key.toLowerCase();
      let next: number | null = null;
      if (k === "j" || k === "arrowdown") next = Math.min(list.length - 1, index + 1);
      else if (k === "k" || k === "arrowup") next = Math.max(0, index - 1);
      else if (k === "enter" && current && !t?.closest("a, button")) router.push(`/app/plots/${current.id}`);
      else if (k === "a" && canReview) setDecision("confirm_compliant");
      else if (k === "r" && canReview) setDecision("confirm_non_compliant");
      else return;
      e.preventDefault();
      if (next !== null) {
        setFocus(next);
        rows.current[next]?.focus({ preventScroll: true });
        rows.current[next]?.scrollIntoView({ block: "nearest" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, index, current, canReview, router]);

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Reviews · triage"
        title="Review queue"
        description="Plots where the official forest maps and the land-change signal need a person’s judgement. Riskiest first."
        actions={
          list.length ? (
            <p className="numerals text-[12px] uppercase tracking-[0.04em] text-ink-muted" aria-live="polite">
              {list.length} waiting
            </p>
          ) : null
        }
      />

      {q.isPending ? (
        <LoadingBlock rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <EmptyState title="Nothing waits for a reviewer." body="New plots that need a decision will appear here, riskiest first." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0">
            <p className="mb-3 hidden flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] italic text-ink-muted lg:flex">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> move
              </span>
              {canReview ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>A</Kbd> record compliant
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>R</Kbd> record non-compliant
                  </span>
                </>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↵</Kbd> full record
              </span>
              <span>Every decision asks for a note first.</span>
            </p>
            <ol className="border-t border-ink/60" aria-label="Plots waiting for a reviewer">
              <li aria-hidden className="label-caps hidden grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_5rem_6.5rem] gap-3 border-b-[3px] border-double border-ink/60 px-1 py-2 text-ink-muted sm:grid">
                <span>#</span>
                <span>Plot</span>
                <span>Signal</span>
                <span className="text-right">Area</span>
                <span>Checked</span>
              </li>
              {list.map((p, i) => {
                const on = i === index;
                return (
                  <li key={p.id} className="ink-in" style={{ animationDelay: `${Math.min(i, 14) * 35}ms` }}>
                    <button
                      ref={(el) => {
                        rows.current[i] = el;
                      }}
                      type="button"
                      onClick={() => setFocus(i)}
                      onDoubleClick={() => router.push(`/app/plots/${p.id}`)}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "relative grid w-full grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 border-b border-rule px-1 py-3 text-left outline-none transition-colors duration-[var(--dur-fast)] hover:bg-sheet-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[2.25rem_minmax(0,1fr)_7.5rem_5rem_6.5rem]",
                        on && "bg-marker-soft/60 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-marker hover:bg-marker-soft/70",
                      )}
                    >
                      <span className="numerals pt-0.5 text-[11px] text-ink-subtle">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <VerdictDot verdict={p.verdict} />
                          <span className="numerals text-[13.5px] font-medium text-ink">{p.reference}</span>
                          <span className="sr-only">{VERDICT_META[p.verdict].label}</span>
                        </span>
                        <span className="mt-0.5 block text-[15px] leading-snug text-ink">{p.headline}</span>
                        <span className="mt-0.5 block truncate text-[13.5px] italic text-ink-muted">
                          {p.supplierName} · {commodityLabel(p.commodity)} · <CountryLabel code={p.country} name={p.countryName} className="not-italic" />
                        </span>
                      </span>
                      <span className="hidden pt-0.5 sm:block">
                        <ChangeBadge level={p.changeLevel} short />
                      </span>
                      <span className="numerals hidden pt-0.5 text-right text-[13px] sm:block">{ha(p.areaHa)}</span>
                      <span className="hidden pt-0.5 text-[13.5px] text-ink-muted sm:block">{p.assessedAt ? relative(p.assessedAt) : "Not yet"}</span>
                    </button>
                    {!desktop && on ? (
                      <div className="border-b border-rule bg-sheet px-3 pb-5 pt-1">
                        <Inspector item={p} canReview={canReview} compact />
                        <Link href={`/app/plots/${p.id}`} className="label-caps mt-4 inline-flex items-center gap-1 text-ink-muted hover:text-marker-ink">
                          Open the full record <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>

          {desktop && current ? (
            <aside aria-label="Evidence for the selected plot" className="relative">
              <div className="sticky top-[calc(var(--masthead-h)+20px)] max-h-[calc(100dvh-var(--masthead-h)-40px)] overflow-y-auto border border-ink/60 bg-sheet p-5 shadow-pop scrollbar-thin">
                <p className="label-caps mb-3 flex items-center gap-2 text-ink-muted">
                  <Glyph tone="brand" size={8} /> Line {String(index + 1).padStart(2, "0")} of {String(list.length).padStart(2, "0")}
                </p>
                <Inspector item={current} canReview={canReview} />
              </div>
            </aside>
          ) : null}
        </div>
      )}

      {current ? (
        <ReviewDialog plotId={current.id} reference={current.reference} decision={decision} onClose={() => setDecision(null)} />
      ) : null}
    </PageContainer>
  );
}
