import { cn } from "@/lib/utils";

type Kind = "compliant" | "review" | "noncompliant" | "pending";

const PARCELS: { d: string; kind: Kind }[] = [
  { d: "M40 64 170 42 190 140 70 162Z", kind: "compliant" },
  { d: "M192 40 320 30 332 120 206 138Z", kind: "compliant" },
  { d: "M334 30 452 52 442 150 348 124Z", kind: "review" },
  { d: "M70 172 200 150 216 260 90 282Z", kind: "compliant" },
  { d: "M212 146 336 128 352 240 226 262Z", kind: "noncompliant" },
  { d: "M354 132 442 158 432 272 364 246Z", kind: "pending" },
  { d: "M96 292 226 270 236 340 106 346Z", kind: "compliant" },
  { d: "M238 270 356 250 362 332 246 344Z", kind: "compliant" },
];

const style: Record<Kind, { fill: string; stroke: string; dash?: string }> = {
  compliant: { fill: "var(--compliant-soft)", stroke: "var(--compliant)" },
  review: { fill: "var(--review-soft)", stroke: "var(--review)" },
  noncompliant: { fill: "var(--noncompliant-soft)", stroke: "var(--noncompliant)" },
  pending: { fill: "var(--surface)", stroke: "var(--pending)", dash: "5 4" },
};

/** A calm, static illustration: surveyed parcels over terrain contours, each with its verdict. */
export function ParcelArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 490 380" className={cn("h-auto", className)} role="img" aria-label="Illustration: farm plots outlined on a map, each marked compliant, needs review, non-compliant or pending">
      <defs>
        <pattern id="pl-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--noncompliant)" strokeWidth="2" opacity="0.55" />
        </pattern>
      </defs>
      <g fill="none" stroke="var(--border-strong)" strokeWidth="1">
        <path d="M-10 110C80 70 150 120 240 90S400 40 500 80" />
        <path d="M-10 150C70 120 160 170 250 135S410 90 500 125" opacity="0.8" />
        <path d="M-10 230C90 200 170 250 260 215S420 170 500 205" opacity="0.8" />
        <path d="M-10 300C100 270 180 320 270 290S430 250 500 280" />
        <path d="M-10 360C110 330 190 370 280 345S440 310 500 335" opacity="0.7" />
      </g>
      {PARCELS.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={style[p.kind].fill}
          stroke={style[p.kind].stroke}
          strokeWidth="1.6"
          strokeDasharray={style[p.kind].dash}
          strokeLinejoin="round"
        />
      ))}
      <path d="M262 170 318 160 326 214 270 226Z" fill="url(#pl-hatch)" />
      {[
        [40, 64],
        [170, 42],
        [190, 140],
        [70, 162],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="var(--surface)" stroke="var(--compliant)" strokeWidth="1.6" />
      ))}
      <g fontFamily="inherit" fontSize="11.5">
        <g transform="translate(250 186)">
          <rect x="0" y="0" width="150" height="40" rx="7" fill="var(--surface)" stroke="var(--border-strong)" />
          <circle cx="13" cy="14" r="4" fill="var(--noncompliant)" />
          <text x="23" y="18" fill="var(--fg)" fontWeight="600">CI-NAW-0007</text>
          <text x="10" y="32" fill="var(--fg-muted)">2.4 ha cleared in 2022</text>
        </g>
        <g transform="translate(58 92)">
          <rect x="0" y="0" width="118" height="40" rx="7" fill="var(--surface)" stroke="var(--border-strong)" />
          <circle cx="13" cy="14" r="4" fill="var(--compliant)" />
          <text x="23" y="18" fill="var(--fg)" fontWeight="600">GH-ASH-0012</text>
          <text x="10" y="32" fill="var(--fg-muted)">No forest lost</text>
        </g>
      </g>
    </svg>
  );
}
