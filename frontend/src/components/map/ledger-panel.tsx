"use client";

import { ArrowUpRight, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { VerdictBar } from "@/components/domain/readiness";
import { VERDICT_META, VERDICT_ORDER } from "@/components/domain/status";
import { CountUp, StaggerItem, StaggerList } from "@/components/motion";
import { Glyph, Segmented, type Tone } from "@/components/ui/display";
import type { Dashboard, Verdict } from "@/lib/api/types";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

type Insight = Dashboard["insights"][number];

/** Field-note glyph: the shape of the problem it points at. */
function noteTone(i: Insight): Tone {
  if (i.tone === "positive") return "compliant";
  if (i.tone === "info") return "pending";
  if (/non_compliant|blocked|cleared/i.test(`${i.href ?? ""} ${i.title}`)) return "noncompliant";
  return "review";
}

const countKey: Record<Verdict, keyof Dashboard["kpis"]> = {
  compliant: "plotsCompliant",
  needs_review: "plotsNeedsReview",
  non_compliant: "plotsNonCompliant",
  pending: "plotsPending",
};

/** A verdict line on the panel doubles as the legend: press it to hide or show those plots. */
function CountLine({ v, n, hidden, onToggle }: { v: Verdict; n: number; hidden: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!hidden}
        aria-label={`${VERDICT_META[v].label}: ${n} plots. ${hidden ? "Hidden on the map; press to show." : "Shown on the map; press to hide."}`}
        className={cn(
          "group flex w-full items-baseline gap-2 rounded-xs py-[5px] text-left outline-none transition-opacity duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-ring",
          hidden && "opacity-45",
        )}
      >
        <Glyph tone={VERDICT_META[v].tone} size={10} className="translate-y-[1px]" />
        <span className={cn("text-[15px] text-ink decoration-ink-subtle group-hover:underline", hidden && "line-through")}>{VERDICT_META[v].label}</span>
        <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-rule-strong" />
        <CountUp value={n} className="numerals text-[14px] text-ink" />
      </button>
    </li>
  );
}

export function LedgerPanel({
  d,
  title,
  areaHa,
  countries,
  hidden,
  onToggle,
  onNote,
  className,
  bare = false,
}: {
  /** Inside the phone sheet: the peek already shows the title switch and readiness. */
  bare?: boolean;
  d: Dashboard;
  title: string;
  areaHa: number;
  countries: number;
  hidden: Verdict[];
  onToggle: (v: Verdict) => void;
  /** Notes that point at plots act on the map (return true when handled). */
  onNote: (i: Insight) => boolean;
  className?: string;
}) {
  const k = d.kpis;
  const split = { compliant: k.plotsCompliant, needsReview: k.plotsNeedsReview, nonCompliant: k.plotsNonCompliant, pending: k.plotsPending };
  const notes = d.insights.filter((i) => !/days until/i.test(i.title)).slice(0, 4);
  return (
    <div className={cn("min-w-0", className)}>
      {!bare ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="label-caps min-w-0 truncate pt-2 text-ink">{title}</p>
            <ViewSwitch />
          </div>
          <p className="numerals mt-1.5 text-[11.5px] uppercase tracking-[0.04em] text-ink-muted">
            {num(k.plots)} plots · {num(areaHa, 1)} ha · {num(countries)} {countries === 1 ? "country" : "countries"}
          </p>

          <div className="mt-4 border-t border-ink/70 pt-2.5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="label-caps text-ink-muted">Readiness</p>
                <p className="mt-0.5 text-[13.5px] italic leading-snug text-ink-muted">Plots confirmed deforestation-free</p>
              </div>
              <p className="numerals text-[38px] leading-none text-ink">
                <CountUp value={k.readinessPct} className="numerals" />
                <span className="ml-0.5 text-[18px] text-ink-muted">%</span>
              </p>
            </div>
            <VerdictBar split={split} height="h-2.5" className="mt-3" />
          </div>
        </>
      ) : null}

      <PanelSection title="On the map">
        <ul aria-label="Plots by verdict. Press a line to hide or show it on the map.">
          {VERDICT_ORDER.map((v) => (
            <CountLine key={v} v={v} n={Number(k[countKey[v]] ?? 0)} hidden={hidden.includes(v)} onToggle={() => onToggle(v)} />
          ))}
        </ul>
      </PanelSection>

      {notes.length ? (
        <PanelSection title="Field notes">
          <StaggerList as="ul" className="grid" delay={0.25}>
            {notes.map((i) => (
              <StaggerItem key={i.id} className="border-b border-rule last:border-b-0">
                <FieldNote i={i} onNote={onNote} />
              </StaggerItem>
            ))}
          </StaggerList>
        </PanelSection>
      ) : null}
    </div>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <h2 className="label-caps shrink-0 text-ink">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-rule-strong" />
      </div>
      {children}
    </section>
  );
}

function FieldNote({ i, onNote }: { i: Insight; onNote: (i: Insight) => boolean }) {
  const body = (
    <>
      <Glyph tone={noteTone(i)} size={10} className="mt-[6px]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] leading-snug text-ink group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">{i.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-[13px] italic leading-snug text-ink-muted">{i.body}</span>
      </span>
      <ArrowUpRight aria-hidden className="mt-1 size-3.5 shrink-0 text-ink-subtle transition-transform duration-[var(--dur-fast)] group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-marker-ink" />
    </>
  );
  const cls = "group flex w-full items-start gap-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (!i.href) return <div className={cls}>{body}</div>;
  return (
    <Link
      href={i.href}
      className={cls}
      onClick={(e) => {
        if (!e.metaKey && !e.ctrlKey && onNote(i)) e.preventDefault();
      }}
    >
      {body}
    </Link>
  );
}

/** MAP ⇄ LEDGER: the plot ledger is the same atlas, as rows. */
export function ViewSwitch({ value = "map", className }: { value?: "map" | "ledger"; className?: string }) {
  const router = useRouter();
  return (
    <Segmented
      label="View"
      value={value}
      onChange={(v) => {
        if (v !== value) router.push(v === "ledger" ? "/app/plots" : "/app");
      }}
      options={[
        { value: "map", label: "Map" },
        { value: "ledger", label: "Ledger" },
      ]}
      className={cn("shrink-0", className)}
    />
  );
}

/** Phone peek of the panel: readiness, the bar and the counts in 96 px. */
export function LedgerPeek({ d, open, onToggle }: { d: Dashboard; open: boolean; onToggle: () => void }) {
  const k = d.kpis;
  const split = { compliant: k.plotsCompliant, needsReview: k.plotsNeedsReview, nonCompliant: k.plotsNonCompliant, pending: k.plotsPending };
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full px-4 pb-3 pt-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <span aria-hidden className="mx-auto mb-2 block h-1 w-10 bg-rule-strong" />
      <span className="flex items-baseline justify-between gap-3">
        <span className="label-caps text-ink">Readiness</span>
        <span className="flex items-center gap-2">
          <span className="numerals text-[22px] leading-none">{num(k.readinessPct)}%</span>
          <ChevronUp aria-hidden className={cn("size-4 text-ink-subtle transition-transform duration-[var(--dur)]", open && "rotate-180")} />
        </span>
      </span>
      <VerdictBar split={split} height="h-2" className="mt-2" />
      <span className="mt-2 flex items-center justify-between gap-2">
        {VERDICT_ORDER.map((v) => (
          <span key={v} className="numerals flex items-center gap-1.5 text-[12px] text-ink-muted">
            <Glyph tone={VERDICT_META[v].tone} size={9} />
            {num(Number(k[countKey[v]] ?? 0))}
            <span className="sr-only">{VERDICT_META[v].label}</span>
          </span>
        ))}
      </span>
    </button>
  );
}
