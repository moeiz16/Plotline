"use client";

import { BellRing, Check, Copy, MessageSquareText } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CampaignStatusBadge, CountryLabel, StageBadge, STAGE_META } from "@/components/domain/status";
import { dMinus, logTime, stampDate } from "@/components/ledger/format";
import { MarginNote } from "@/components/ledger/paper";
import { CountUp } from "@/components/motion";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, ErrorState, Glyph, PageHeader, SectionTitle, Skeleton, type Tone } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useCampaign, useCampaignDecision, useCampaignEvents, useCancelCampaign, useRemindSupplier } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Campaign, CampaignMember, CampaignStage } from "@/lib/api/types";
import { commodityLabel, plural, relative } from "@/lib/format";
import { absoluteUrl, cn, copyText } from "@/lib/utils";

const STEPS: { key: CampaignStage; label: string }[] = [
  { key: "requested", label: "Requested" },
  { key: "reminded", label: "Reminded" },
  { key: "submitted", label: "Submitted" },
  { key: "assessing", label: "Checked" },
  { key: "awaiting_review", label: "Review" },
  { key: "approved", label: "Approved" },
];

const EASE = [0.5, 0, 0.1, 1] as const;

function reached(stage: CampaignStage) {
  if (stage === "approved") return STEPS.length;
  return STAGE_META[stage]?.step ?? 0;
}

function stopTone(stage: CampaignStage): Tone {
  return STAGE_META[stage]?.tone ?? "pending";
}

/**
 * The stage ruler under each stop: six segments that fill left to right. Mounted in its final
 * state; when the stage moves on (decision, reminder, live update) the new segments draw in.
 */
function StageRuler({ stage }: { stage: CampaignStage }) {
  const reduce = useReducedMotion();
  const done = reached(stage);
  const trouble = stage === "overdue" || stage === "changes_requested";
  const prev = useRef(done);
  const from = prev.current;
  useEffect(() => {
    prev.current = done;
  }, [done]);
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label={`Stage: ${STAGE_META[stage]?.label ?? stage}`}>
      {STEPS.map((s, i) => {
        const filled = i < done;
        const current = i === done && stage !== "approved";
        return (
          <li key={s.key} className="min-w-0">
            <span className={cn("relative block h-1.5 overflow-hidden", current && trouble ? (stage === "overdue" ? "hatch-noncompliant" : "bg-review/40") : "bg-sheet-3")}>
              <motion.span
                className="absolute inset-0 origin-left bg-ink"
                initial={false}
                animate={{ scaleX: filled ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.52, ease: EASE, delay: Math.max(0, i - from) * 0.12 }}
              />
              {current && !trouble ? <span className="absolute inset-y-0 left-0 w-1/2 bg-marker" /> : null}
            </span>
            <span className={cn("mt-1 hidden truncate font-mono text-[9.5px] uppercase tracking-[0.08em] sm:block", current ? "text-ink" : filled ? "text-ink-muted" : "text-ink-subtle")}>
              {current && trouble ? STAGE_META[stage].label : s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The stop's node on the route: a square glyph that stamps down again whenever the stage changes. */
function StopNode({ stage }: { stage: CampaignStage }) {
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  return (
    <span className="relative z-10 flex size-6 items-center justify-center border border-ink bg-sheet">
      <motion.span
        key={stage}
        initial={first.current || reduce ? false : { scale: 2.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 24 }}
        className="flex"
      >
        <Glyph tone={stopTone(stage)} size={12} />
      </motion.span>
    </span>
  );
}

function DecisionDialog({ campaignId, member, approve, onClose, onDone }: { campaignId: string; member: CampaignMember | null; approve: boolean; onClose: () => void; onDone: (m: CampaignMember, approve: boolean) => void }) {
  const decide = useCampaignDecision(campaignId);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      {member ? (
        <DialogContent
          size="sm"
          title={approve ? `Approve ${member.supplierName}` : `Send ${member.supplierName} back`}
          description={approve ? "Their plots are accepted for this route. Plots that still need a reviewer stay in the review queue." : "The supplier is asked to correct their plots through the same upload link."}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!approve && note.trim().length < 3) return setError("Tell the supplier what to change.");
              try {
                await decide.mutateAsync({ supplierId: member.supplierId, approve, note: note.trim() });
                setNote("");
                onDone(member, approve);
                onClose();
              } catch {
                /* toast shown by the hook */
              }
            }}
          >
            <Field label={approve ? "Note for the log" : "What should the supplier change?"} htmlFor="decision-note" optional={approve} error={error}>
              <Textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" loading={decide.isPending}>
                {approve ? "Approve stop" : "Request changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* ── One stop on the route ─────────────────────────────────────────────────── */
function Stop({
  c,
  m,
  i,
  last,
  note,
  onDecide,
  onRemind,
  reminding,
}: {
  c: Campaign;
  m: CampaignMember;
  i: number;
  last: boolean;
  note: string | null;
  onDecide: (approve: boolean) => void;
  onRemind: () => void;
  reminding: boolean;
}) {
  const { can } = useSession();
  const running = c.status === "running";
  const canRemind = running && can("campaigns:write") && ["requested", "reminded", "overdue", "changes_requested"].includes(m.stage);
  const canDecide = can("campaigns:approve") && m.stage === "awaiting_review";
  const done = m.stage === "approved";
  return (
    <li className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0">
      {/* the route line to the next stop */}
      {!last ? <span aria-hidden className={cn("absolute bottom-0 left-[11px] top-6 w-0 border-l-2", done ? "border-ink" : "border-dashed border-rule-strong")} /> : null}
      <StopNode stage={m.stage} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="numerals text-[11px] text-ink-subtle">STOP {String(i + 1).padStart(2, "0")}</span>
          <h3 className="text-[19px] font-medium leading-tight">{m.supplierName}</h3>
          <span className="text-[14px] text-ink-muted">
            <CountryLabel code={m.country} />
          </span>
          <span className="ml-auto">
            <StageBadge stage={m.stage} />
          </span>
        </div>
        <div className="mt-3">
          <StageRuler stage={m.stage} />
        </div>
        <p className="numerals mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] uppercase text-ink-muted">
          <span>{plural(m.plotsSubmitted, "plot")} sent</span>
          {m.plotsSubmitted ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <Glyph tone="compliant" size={9} />
                {m.verdictSummary.compliant}
              </span>
              <span className="inline-flex items-center gap-1">
                <Glyph tone="review" size={9} />
                {m.verdictSummary.needsReview}
              </span>
              <span className="inline-flex items-center gap-1">
                <Glyph tone="noncompliant" size={9} />
                {m.verdictSummary.nonCompliant}
              </span>
            </span>
          ) : null}
          <span>
            Reminded ×<CountUp value={m.remindersSent} className="numerals" />
          </span>
          {m.lastEventAt ? <span className="normal-case">last event {relative(m.lastEventAt)}</span> : null}
        </p>
        <MarginNote show={!!note} className="mt-2">
          <Glyph tone="brand" size={9} /> {note}
        </MarginNote>
        {canDecide || canRemind || m.portalUrl ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {canDecide ? (
              <>
                <Button size="sm" variant="ink" onClick={() => onDecide(true)} disabled={!c.engineOnline}>
                  <Check /> Approve
                </Button>
                <Button size="sm" onClick={() => onDecide(false)} disabled={!c.engineOnline}>
                  <MessageSquareText /> Request changes
                </Button>
              </>
            ) : null}
            {canRemind ? (
              <Button size="sm" loading={reminding} onClick={onRemind} disabled={!c.engineOnline}>
                <BellRing /> Send reminder
              </Button>
            ) : null}
            {m.portalUrl ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await copyText(absoluteUrl(m.portalUrl!));
                  if (ok) toast.success("Upload link copied");
                  else toast.error("Couldn’t copy the link");
                }}
              >
                <Copy /> Copy link
              </Button>
            ) : null}
            <Link href={`/app/suppliers/${m.supplierId}`} className="label-caps inline-flex h-8 items-center px-1 text-ink-muted underline-offset-4 hover:text-ink hover:underline">
              Dossier →
            </Link>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* ── Field log: live, newest on top, new lines ink in ───────────────────────── */
function FieldLog({ c }: { c: Campaign }) {
  const reduce = useReducedMotion();
  const items = [...c.timeline].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div>
      <SectionTitle
        action={
          c.status === "running" ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-marker-ink">
              <Glyph tone="brand" size={9} /> Live
            </span>
          ) : null
        }
      >
        Field log
      </SectionTitle>
      {items.length ? (
        <ol className="grid border-l border-ink/50 pl-4" aria-live="polite">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <motion.li
                key={`${t.at}-${t.kind}-${t.supplierName ?? ""}`}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, clipPath: "inset(0 100% 0 0)" }}
                animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 0.52, ease: EASE }}
                className="relative border-b border-rule py-2.5 last:border-b-0"
              >
                <span aria-hidden className="absolute -left-[21px] top-[15px] size-[9px] border border-ink bg-sheet" />
                <p className="numerals text-[10.5px] text-ink-subtle">{logTime(t.at)}</p>
                <p className="mt-0.5 text-[14.5px] leading-snug">{t.message}</p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="text-[15px] italic text-ink-muted">Nothing logged yet.</p>
      )}
    </div>
  );
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const q = useCampaign(id);
  useCampaignEvents(id);
  const remind = useRemindSupplier(id);
  const cancel = useCancelCampaign(id);
  const { can } = useSession();
  const [decision, setDecision] = useState<{ member: CampaignMember; approve: boolean } | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState(false);
  const c = q.data;

  function note(supplierId: string, text: string) {
    setNotes((n) => ({ ...n, [supplierId]: text }));
    setTimeout(() => setNotes((n) => {
      const next = { ...n };
      delete next[supplierId];
      return next;
    }), 7000);
  }

  async function sendReminder(m: CampaignMember) {
    try {
      await remind.mutateAsync(m.supplierId);
      note(m.supplierId, `Reminder sent · ${logTime(new Date().toISOString())}`);
    } catch {
      /* toast shown by the hook */
    }
  }

  if (q.isPending)
    return (
      <PageContainer>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="mt-8 h-[480px]" />
      </PageContainer>
    );
  if (q.isError || !c)
    return (
      <PageContainer>
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this route" />
      </PageContainer>
    );

  const running = c.status === "running";
  const waiting = c.members.filter((m) => ["requested", "reminded", "overdue", "changes_requested"].includes(m.stage));

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={
          <>
            <Link href="/app/campaigns">Campaigns</Link>
            <span aria-hidden>/</span>
            <span>
              Due {stampDate(c.dueDate)} {running ? `(${dMinus(c.dueDate)})` : ""}
            </span>
          </>
        }
        title={c.name}
        description={
          <span className="italic">
            {commodityLabel(c.commodity)} · {plural(c.suppliers, "stop")} · reminders every {c.reminderEveryDays} days
          </span>
        }
        actions={
          <>
            <CampaignStatusBadge status={c.status} />
            {running && can("campaigns:write") && waiting.length ? (
              <Button
                loading={bulk}
                disabled={!c.engineOnline}
                onClick={async () => {
                  setBulk(true);
                  for (const m of waiting) await sendReminder(m);
                  setBulk(false);
                }}
              >
                <BellRing /> Remind {waiting.length} waiting
              </Button>
            ) : null}
            {running && can("campaigns:write") ? (
              <Button variant="danger-outline" onClick={() => setConfirmStop(true)} disabled={!c.engineOnline}>
                Stop route
              </Button>
            ) : null}
          </>
        }
      />

      {running && !c.engineOnline ? (
        <Callout tone="review" className="mb-6" title="Automatic follow-ups are paused">
          Progress is saved and nothing is lost. Reminders, approvals and stopping the route come back as soon as follow-ups resume.
        </Callout>
      ) : null}

      <div className="mb-8 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p className="label-caps text-ink-muted">Distance covered</p>
          <p className="mt-1">
            <CountUp value={c.progressPct} format={(n) => `${Math.round(n)}`} className="numerals text-[44px] leading-none" />
            <span className="numerals text-[18px] text-ink-muted">%</span>
          </p>
        </div>
        <ul className="numerals flex flex-wrap gap-x-6 gap-y-2 pb-1 text-[12px] uppercase text-ink-muted">
          <li className="inline-flex items-center gap-1.5">
            <Glyph tone="compliant" /> {c.approved} approved
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Glyph tone="review" /> {c.awaitingReview} awaiting review
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Glyph tone="pending" /> {waiting.length} on the way
          </li>
          <li className={cn("inline-flex items-center gap-1.5", c.overdue && "text-noncompliant-fg")}>
            <Glyph tone="noncompliant" /> {c.overdue} overdue
          </li>
        </ul>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Route">
          <SectionTitle>Route · {plural(c.members.length, "stop")}</SectionTitle>
          <ol className="pt-2">
            {c.members.map((m, i) => (
              <Stop
                key={m.supplierId}
                c={c}
                m={m}
                i={i}
                last={i === c.members.length - 1}
                note={notes[m.supplierId] ?? null}
                onDecide={(approve) => setDecision({ member: m, approve })}
                onRemind={() => sendReminder(m)}
                reminding={remind.isPending && remind.variables === m.supplierId}
              />
            ))}
            <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-4 pt-2">
              <svg viewBox="0 0 10 14" className="ml-1.5 h-5 w-3.5" aria-hidden>
                <path d="M1.5 13V1" stroke="var(--ink)" strokeWidth="1.4" />
                <path d="M1.5 1 9 3.2 1.5 5.4Z" fill="var(--marker)" />
              </svg>
              <span className="numerals text-[11.5px] uppercase text-marker-ink">
                Due {stampDate(c.dueDate)} {running ? `· ${dMinus(c.dueDate)}` : ""}
              </span>
            </li>
          </ol>
        </section>
        <aside className="lg:sticky lg:top-[calc(var(--masthead-h)+1.5rem)]">
          <FieldLog c={c} />
        </aside>
      </div>

      <DecisionDialog
        campaignId={id}
        member={decision?.member ?? null}
        approve={decision?.approve ?? true}
        onClose={() => setDecision(null)}
        onDone={(m, approve) => note(m.supplierId, approve ? `Approved · ${logTime(new Date().toISOString())}` : "Sent back for changes")}
      />
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        tone="danger"
        title="Stop this route?"
        description="No more reminders will be sent. Plots suppliers have already sent are kept."
        confirmLabel="Stop route"
        loading={cancel.isPending}
        onConfirm={async () => {
          await cancel.mutateAsync().catch(() => null);
          setConfirmStop(false);
        }}
      />
    </PageContainer>
  );
}
