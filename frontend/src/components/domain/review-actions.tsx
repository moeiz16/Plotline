"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Glyph, type Tone } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import { useReviewPlot } from "@/lib/api/hooks";
import type { Assessment, ReviewDecision, Verdict } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const DECISIONS: Record<ReviewDecision, { short: string; title: string; help: string; tone: Tone }> = {
  confirm_compliant: {
    short: "Compliant",
    title: "Record this plot as compliant",
    help: "You have checked the evidence and are satisfied no forest on this plot was cleared after 31 December 2020.",
    tone: "compliant",
  },
  confirm_non_compliant: {
    short: "Non-compliant",
    title: "Record this plot as non-compliant",
    help: "Product from this plot will be blocked from shipments to the EU market.",
    tone: "noncompliant",
  },
  request_information: {
    short: "Ask the supplier",
    title: "Ask the supplier for more information",
    help: "The supplier is asked to explain or correct the plot. It stays in review until they respond.",
    tone: "review",
  },
};

/**
 * What the official forest maps point to. The land-change signal is a second opinion, so the
 * suggested decision follows the forest maps: loss after the cut-off means non-compliant.
 */
export function suggestedDecision(verdict: Verdict, a: Pick<Assessment, "lossAfter2020Ha"> | null | undefined): ReviewDecision {
  if (verdict === "non_compliant") return "confirm_non_compliant";
  if (verdict === "compliant") return "confirm_compliant";
  return (a?.lossAfter2020Ha ?? 0) > 0 ? "confirm_non_compliant" : "confirm_compliant";
}
export const opposite = (d: ReviewDecision): ReviewDecision => (d === "confirm_non_compliant" ? "confirm_compliant" : "confirm_non_compliant");

/** The reviewer's note card: a decision is never recorded without a short note for the record. */
export function ReviewDialog({
  plotId,
  reference,
  decision,
  onClose,
  onDone,
}: {
  plotId: string;
  reference: string;
  decision: ReviewDecision | null;
  onClose: () => void;
  onDone?: (d: ReviewDecision) => void;
}) {
  const review = useReviewPlot(plotId);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (decision) {
      setNote("");
      setError(null);
    }
  }, [decision]);
  const meta = decision ? DECISIONS[decision] : null;
  return (
    <Dialog open={!!decision} onOpenChange={(o) => !o && onClose()}>
      {meta && decision ? (
        <DialogContent title={meta.title} description={meta.help} size="sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (note.trim().length < 3) {
                setError("Add a short note explaining your decision. It is kept in the plot’s history.");
                return;
              }
              try {
                await review.mutateAsync({ decision, note: note.trim() });
                onDone?.(decision);
                onClose();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "We couldn’t save your decision.");
              }
            }}
          >
            <p className="numerals mb-3 flex items-center gap-2 text-[12.5px] text-ink-muted">
              <Glyph tone={meta.tone} size={10} /> {reference}
            </p>
            <Field label={decision === "request_information" ? "What do you need from the supplier?" : "Note for the record"} htmlFor={`review-note-${plotId}`} error={error}>
              <Textarea id={`review-note-${plotId}`} value={note} onChange={(e) => setNote(e.target.value)} autoFocus rows={4} aria-invalid={!!error} />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button type="submit" variant={decision === "confirm_non_compliant" ? "danger" : "primary"} loading={review.isPending}>
                {decision === "request_information" ? "Send request" : `Record ${meta.short.toLowerCase()}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * Reviewer actions for one plot: confirm what the forest maps show (primary), overturn it, or ask the
 * supplier. Each opens the note card. `hint` shows the keyboard keys on the review queue.
 */
export function ReviewActions({
  plotId,
  reference,
  verdict,
  assessment,
  className,
  size = "sm",
  hint = false,
  stacked = false,
}: {
  plotId: string;
  reference: string;
  verdict: Verdict;
  assessment: Pick<Assessment, "lossAfter2020Ha"> | null | undefined;
  className?: string;
  size?: "sm" | "md";
  hint?: boolean;
  stacked?: boolean;
}) {
  const [open, setOpen] = useState<ReviewDecision | null>(null);
  const main = suggestedDecision(verdict, assessment);
  const other = opposite(main);
  const key = (d: ReviewDecision) => (hint ? <kbd className="ml-1 font-mono text-[10px] opacity-70">{d === "confirm_compliant" ? "A" : "R"}</kbd> : null);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", stacked && "grid grid-cols-1", className)}>
      <Button variant="primary" size={size} onClick={() => setOpen(main)} className={cn(stacked && "w-full justify-between")}>
        Confirm {DECISIONS[main].short.toLowerCase()}
        {key(main)}
      </Button>
      <Button variant={other === "confirm_non_compliant" ? "danger-outline" : "secondary"} size={size} onClick={() => setOpen(other)} className={cn(stacked && "w-full justify-between")}>
        Overturn: {DECISIONS[other].short.toLowerCase()}
        {key(other)}
      </Button>
      <Button variant="link" onClick={() => setOpen("request_information")} className={cn("text-[14px]", stacked && "justify-self-start")}>
        Ask the supplier
      </Button>
      <ReviewDialog plotId={plotId} reference={reference} decision={open} onClose={() => setOpen(null)} />
    </div>
  );
}
