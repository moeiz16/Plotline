import { Glyph, type Tone } from "@/components/ui/display";
import type { SupplierListItem } from "@/lib/api/types";

/** One square per mapped plot, in verdict order: the supplier's tally in the register. */
export function PlotTally({ s, max = 18 }: { s: Pick<SupplierListItem, "compliant" | "needsReview" | "nonCompliant" | "pending">; max?: number }) {
  const marks: Tone[] = [
    ...Array<Tone>(s.compliant).fill("compliant"),
    ...Array<Tone>(s.needsReview).fill("review"),
    ...Array<Tone>(s.nonCompliant).fill("noncompliant"),
    ...Array<Tone>(s.pending).fill("pending"),
  ];
  const label = `${s.compliant} compliant, ${s.needsReview} need review, ${s.nonCompliant} non-compliant, ${s.pending} pending`;
  if (!marks.length)
    return (
      <span className="font-serif text-[14px] italic text-ink-subtle" aria-label="No plots mapped yet">
        no plots mapped
      </span>
    );
  return (
    <span role="img" aria-label={label} className="flex flex-wrap items-center gap-[3px]">
      {marks.slice(0, max).map((t, i) => (
        <Glyph key={i} tone={t} size={11} />
      ))}
      {marks.length > max ? <span className="numerals ml-1 text-[11px] text-ink-subtle">+{marks.length - max}</span> : null}
    </span>
  );
}

