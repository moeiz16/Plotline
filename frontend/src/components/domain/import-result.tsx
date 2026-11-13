import { Glyph } from "@/components/ui/display";
import type { ImportResult, Issue } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Issues on a plot as field notes: hatched square = must fix, half square = check. */
export function IssueList({ issues, className }: { issues: Issue[]; className?: string }) {
  if (!issues.length) return null;
  return (
    <ul className={cn("grid gap-1.5", className)}>
      {issues.map((i, n) => (
        <li key={`${i.code}-${n}`} className="flex gap-2 text-[14px] leading-snug">
          <Glyph tone={i.severity === "error" ? "noncompliant" : "review"} className="mt-[3px]" />
          <span>
            <span className="sr-only">{i.severity === "error" ? "Must fix: " : "Check: "}</span>
            {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The result of a file import, written as a short receipt: lines accepted, lines to correct. */
export function ImportResultView({ result }: { result: ImportResult }) {
  const ok = result.created.length;
  return (
    <div className="grid gap-0 border border-rule bg-sheet" aria-live="polite">
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-ink/50 px-3 py-2">
        <span className="label-caps text-ink">Import receipt</span>
        <span className="numerals text-[12px] text-ink-muted">
          {ok} accepted · {result.rejected.length} to correct
        </span>
      </div>
      <p className="flex items-center gap-2 border-b border-rule px-3 py-2.5 text-[15px]">
        <Glyph tone={ok ? "compliant" : "pending"} />
        {ok} {ok === 1 ? "plot" : "plots"} added and sent for the forest check
      </p>
      {result.rejected.length ? (
        <ol className="grid">
          {result.rejected.map((r, i) => (
            <li key={i} className="grid gap-1 border-b border-rule px-3 py-2.5 last:border-b-0">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                <Glyph tone="noncompliant" />
                {r.reference ? <span className="numerals text-[13px] font-medium">{r.reference}</span> : <span className="italic">Unnamed plot</span>}
                {r.row ? <span className="numerals text-[11px] text-ink-subtle">ROW {r.row}</span> : null}
              </p>
              <IssueList issues={r.issues} className="pl-4" />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export const FILE_HINT = "GeoJSON, KML or a CSV with reference, latitude, longitude and optional area_ha columns. Coordinates in WGS84 (GPS) with up to 6 decimals.";

/** File picker drawn as a dashed drop slip, used by the import dialog and the supplier upload page. */
export const FILE_INPUT_CLASS =
  "block w-full min-w-0 cursor-pointer border border-dashed border-rule-strong bg-sheet-2/50 p-3 font-mono text-[12.5px] text-ink-muted file:mr-3 file:cursor-pointer file:border file:border-ink file:bg-sheet file:px-2.5 file:py-1 file:font-mono file:text-[11px] file:font-medium file:uppercase file:tracking-[0.07em] file:text-ink hover:border-ink";
