import { CircleCheck, CircleX, TriangleExclamationPoint } from "lucide-react";
import type { ImportResult, Issue } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function IssueList({ issues, className }: { issues: Issue[]; className?: string }) {
  if (!issues.length) return null;
  return (
    <ul className={cn("grid gap-1.5", className)}>
      {issues.map((i, n) => (
        <li key={`${i.code}-${n}`} className="flex gap-2 text-[13px] leading-snug">
          {i.severity === "error" ? (
            <CircleX className="mt-0.5 size-3.5 shrink-0 text-noncompliant" aria-hidden />
          ) : (
            <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0 text-review" aria-hidden />
          )}
          <span>
            <span className="sr-only">{i.severity === "error" ? "Must fix: " : "Check: "}</span>
            {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ImportResultView({ result }: { result: ImportResult }) {
  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="flex items-center gap-2 rounded-md border border-compliant/25 bg-compliant-soft px-3 py-2 text-sm text-compliant-fg">
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        {result.created.length} {result.created.length === 1 ? "plot" : "plots"} added
      </div>
      {result.rejected.length ? (
        <div className="rounded-md border border-noncompliant/25 bg-noncompliant-soft/50 p-3">
          <p className="text-sm font-medium text-noncompliant-fg">
            {result.rejected.length} {result.rejected.length === 1 ? "plot needs" : "plots need"} correcting
          </p>
          <ul className="mt-2 grid gap-3">
            {result.rejected.map((r, i) => (
              <li key={i}>
                <p className="text-[13px] font-medium">
                  {r.reference ? <span className="font-mono">{r.reference}</span> : "Unnamed plot"}
                  {r.row ? <span className="font-normal text-muted"> · row {r.row}</span> : null}
                </p>
                <IssueList issues={r.issues} className="mt-1" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export const FILE_HINT = "GeoJSON, KML or a CSV with reference, latitude, longitude and optional area_ha columns. Coordinates in WGS84 (GPS) with up to 6 decimals.";
