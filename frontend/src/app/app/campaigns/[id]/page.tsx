"use client";

import { ArrowLeft, BellRing, CircleCheck, CirclePause, Copy, MessageSquareText, Radio } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CampaignStatusBadge, CountryLabel, StageBadge, STAGE_META } from "@/components/domain/status";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardBody, CardHeader, ErrorState, Meter, Skeleton } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogFooter, Tooltip } from "@/components/ui/overlays";
import { useCampaign, useCampaignDecision, useCampaignEvents, useCancelCampaign, useRemindSupplier } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { CampaignMember, CampaignStage } from "@/lib/api/types";
import { commodityLabel, dateLong, daysUntil, pct, relative } from "@/lib/format";
import { absoluteUrl, cn, copyText } from "@/lib/utils";

const STEPS: { key: CampaignStage; label: string }[] = [
  { key: "requested", label: "Requested" },
  { key: "reminded", label: "Reminded" },
  { key: "submitted", label: "Submitted" },
  { key: "assessing", label: "Checking" },
  { key: "awaiting_review", label: "Review" },
  { key: "approved", label: "Approved" },
];

function stepIndex(stage: CampaignStage) {
  return STAGE_META[stage]?.step ?? 0;
}

/** Six-step progress strip; the final step shows "changes requested" or "overdue" in their own colours. */
function StageTimeline({ stage }: { stage: CampaignStage }) {
  const at = stepIndex(stage);
  const problem = stage === "overdue" || stage === "changes_requested";
  return (
    <ol className="flex items-center gap-1" aria-label={`Stage: ${STAGE_META[stage]?.label ?? stage}`}>
      {STEPS.map((s, i) => {
        const done = i < at || (i === at && stage === "approved");
        const current = i === at;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col gap-1">
            <span
              className={cn(
                "h-1.5 rounded-full",
                done
                  ? "bg-compliant"
                  : current
                    ? problem
                      ? stage === "overdue"
                        ? "bg-noncompliant"
                        : "bg-review"
                      : "bg-brand"
                    : "bg-surface-3",
              )}
              aria-hidden
            />
            <span className={cn("hidden truncate text-[11px] sm:block", current ? "font-medium text-fg" : "text-subtle")}>
              {current && problem ? STAGE_META[stage].label : s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DecisionDialog({
  campaignId,
  member,
  approve,
  onClose,
}: {
  campaignId: string;
  member: CampaignMember | null;
  approve: boolean;
  onClose: () => void;
}) {
  const decide = useCampaignDecision(campaignId);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      {member ? (
        <DialogContent
          size="sm"
          title={approve ? `Approve ${member.supplierName}` : `Request changes from ${member.supplierName}`}
          description={
            approve
              ? "Their plots are accepted for this campaign. Plots that still need review stay in the review queue."
              : "The supplier is asked to correct their plots using the same upload link."
          }
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!approve && note.trim().length < 3) return setError("Tell the supplier what to change.");
              try {
                await decide.mutateAsync({ supplierId: member.supplierId, approve, note: note.trim() });
                setNote("");
                onClose();
              } catch {
                /* toast shown by the hook */
              }
            }}
          >
            <Field label={approve ? "Note" : "What should the supplier change?"} htmlFor="decision-note" optional={approve} error={error}>
              <Textarea id="decision-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" loading={decide.isPending}>
                {approve ? "Approve" : "Request changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
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
  const c = q.data;

  if (q.isPending)
    return (
      <PageContainer>
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-6 h-40" />
        <Skeleton className="mt-4 h-96" />
      </PageContainer>
    );
  if (q.isError || !c)
    return (
      <PageContainer>
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="We couldn’t open this campaign" />
        </Card>
      </PageContainer>
    );

  const left = daysUntil(c.dueDate);
  const running = c.status === "running";

  return (
    <PageContainer>
      <Link href="/app/campaigns" className="inline-flex items-center gap-1 rounded-sm text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" aria-hidden /> Campaigns
      </Link>
      <div className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em] sm:text-2xl">{c.name}</h1>
            <CampaignStatusBadge status={c.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {commodityLabel(c.commodity)} · due {dateLong(c.dueDate)}
            {running ? (left >= 0 ? ` (${left} days left)` : " (past due)") : ""} · reminders every {c.reminderEveryDays} days
          </p>
        </div>
        {running && can("campaigns:write") ? (
          <Button variant="danger-outline" onClick={() => setConfirmStop(true)} disabled={!c.engineOnline}>
            Stop campaign
          </Button>
        ) : null}
      </div>

      {running && !c.engineOnline ? (
        <Callout tone="review" icon={<CirclePause />} className="mb-4" title="Automatic follow-ups are paused">
          Progress is saved and nothing is lost. Reminders, approvals and stopping the campaign are available again as soon as follow-ups resume.
        </Callout>
      ) : null}

      <Card className="mb-4">
        <CardBody className="grid gap-4 sm:grid-cols-[1.4fr_1fr] sm:items-center">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] text-muted">Progress</p>
              {running ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Radio className="size-3.5 text-brand" aria-hidden /> Live
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-3xl font-semibold tabular">{pct(c.progressPct)}</p>
            <Meter value={c.progressPct} tone="compliant" className="mt-3" label="Campaign progress" />
          </div>
          <dl className="grid grid-cols-4 gap-2 text-center sm:grid-cols-2 sm:text-left">
            {[
              ["Suppliers", c.suppliers, ""],
              ["Approved", c.approved, "text-compliant-fg"],
              ["To review", c.awaitingReview, "text-review-fg"],
              ["Overdue", c.overdue, c.overdue ? "text-noncompliant-fg" : ""],
            ].map(([l, v, cls]) => (
              <div key={l as string} className="rounded-md bg-surface-2/60 px-2 py-2 sm:px-3">
                <dt className="text-[11px] text-muted sm:text-xs">{l}</dt>
                <dd className={cn("text-lg font-semibold tabular", cls as string)}>{v}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Suppliers" description="Where each supplier is in the request." />
        <ul className="divide-y divide-border">
          {c.members.map((m) => {
            const canRemind = running && can("campaigns:write") && ["requested", "reminded", "overdue", "changes_requested"].includes(m.stage);
            const canDecide = can("campaigns:approve") && m.stage === "awaiting_review";
            return (
              <li key={m.supplierId} className="grid gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{m.supplierName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                      <CountryLabel code={m.country} /> · {m.plotsSubmitted} plots submitted · {m.remindersSent}{" "}
                      {m.remindersSent === 1 ? "reminder" : "reminders"} sent
                      {m.lastEventAt ? ` · updated ${relative(m.lastEventAt)}` : ""}
                    </p>
                  </div>
                  <StageBadge stage={m.stage} />
                </div>
                <StageTimeline stage={m.stage} />
                {m.plotsSubmitted ? (
                  <p className="text-xs text-muted">
                    <span className="text-compliant-fg">{m.verdictSummary.compliant} compliant</span> ·{" "}
                    <span className="text-review-fg">{m.verdictSummary.needsReview} need review</span> ·{" "}
                    <span className="text-noncompliant-fg">{m.verdictSummary.nonCompliant} non-compliant</span>
                  </p>
                ) : null}
                {canDecide || canRemind || m.portalUrl ? (
                  <div className="flex flex-wrap gap-2">
                    {canDecide ? (
                      <>
                        <Button size="sm" variant="primary" onClick={() => setDecision({ member: m, approve: true })} disabled={!c.engineOnline}>
                          <CircleCheck /> Approve
                        </Button>
                        <Button size="sm" onClick={() => setDecision({ member: m, approve: false })} disabled={!c.engineOnline}>
                          <MessageSquareText /> Request changes
                        </Button>
                      </>
                    ) : null}
                    {canRemind ? (
                      <Button size="sm" loading={remind.isPending && remind.variables === m.supplierId} onClick={() => remind.mutate(m.supplierId)} disabled={!c.engineOnline}>
                        <BellRing /> Send reminder
                      </Button>
                    ) : null}
                    {m.portalUrl ? (
                      <Tooltip content="Copy this supplier’s upload link">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await copyText(absoluteUrl(m.portalUrl!));
                            if (ok) toast.success("Upload link copied");
                            else toast.error("Couldn’t copy the link");
                          }}
                        >
                          <Copy /> Copy upload link
                        </Button>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Timeline" description="Everything that has happened in this campaign, newest first." />
        <CardBody>
          {c.timeline.length ? (
            <ol className="grid">
              {[...c.timeline]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((t, i, arr) => (
                  <li key={`${t.at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className="relative mt-1.5 flex flex-col items-center">
                      <span className="size-2 rounded-full bg-brand" aria-hidden />
                      {i < arr.length - 1 ? <span className="absolute top-3 h-[calc(100%-2px)] w-px bg-border" aria-hidden /> : null}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm">
                        {t.supplierName && !t.message.includes(t.supplierName) ? <span className="font-medium">{t.supplierName}: </span> : null}
                        {t.message}
                      </p>
                      <p className="text-xs text-muted">{relative(t.at)}</p>
                    </div>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nothing has happened yet.</p>
          )}
        </CardBody>
      </Card>

      <DecisionDialog campaignId={id} member={decision?.member ?? null} approve={decision?.approve ?? true} onClose={() => setDecision(null)} />
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        tone="danger"
        title="Stop this campaign?"
        description="No more reminders will be sent. Plots suppliers have already submitted are kept."
        confirmLabel="Stop campaign"
        loading={cancel.isPending}
        onConfirm={async () => {
          await cancel.mutateAsync().catch(() => null);
          setConfirmStop(false);
        }}
      />
    </PageContainer>
  );
}
