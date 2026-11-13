/* Status vocabulary for Plotline. Every status renders as a GLYPH (shape) + mono caps label: never colour alone, never a pill. */
import type { ReactNode } from "react";
import { Badge, Glyph, type Tone } from "@/components/ui/display";
import type {
  CampaignStage,
  CampaignStatus,
  ChangeLevel,
  Check,
  DdsStatus,
  RiskTier,
  ShipmentStatus,
  Verdict,
} from "@/lib/api/types";
import { countryName, flag } from "@/lib/format";
import { cn } from "@/lib/utils";

type Meta = { label: string; tone: Tone; icon: ReactNode };

/* ── Plot verdict ───────────────────────────────────────────────────────── */
export const VERDICT_META: Record<Verdict, Meta & { short: string; description: string }> = {
  compliant: {
    label: "Compliant",
    short: "Compliant",
    tone: "compliant",
    icon: <Glyph tone="compliant" />,
    description: "No forest on this plot was cleared after 31 December 2020.",
  },
  needs_review: {
    label: "Needs review",
    short: "Review",
    tone: "review",
    icon: <Glyph tone="review" />,
    description: "Something needs a closer look by a reviewer before this plot can be used.",
  },
  non_compliant: {
    label: "Non-compliant",
    short: "Non-compliant",
    tone: "noncompliant",
    icon: <Glyph tone="noncompliant" />,
    description: "Forest on this plot was cleared after 31 December 2020. Product from it cannot be placed on the EU market.",
  },
  pending: {
    label: "Pending",
    short: "Pending",
    tone: "pending",
    icon: <Glyph tone="pending" />,
    description: "Not checked yet, or evidence is still missing.",
  },
};

export const VERDICT_ORDER: Verdict[] = ["compliant", "needs_review", "non_compliant", "pending"];

/** Hex colours for map layers (canvas cannot read CSS variables). Readable on light, dark and satellite basemaps. */
export const VERDICT_MAP_COLOR: Record<Verdict, string> = {
  compliant: "#3f8f55",
  needs_review: "#d9a035",
  non_compliant: "#c8324a",
  pending: "#8a97a6",
};

/** Marker orange for map highlights (selected plot, survey stake). */
export const MARKER_HEX = "#d4561c";

/** Verdict → glyph tone. */
export const VERDICT_TONE: Record<Verdict, Tone> = {
  compliant: "compliant",
  needs_review: "review",
  non_compliant: "noncompliant",
  pending: "pending",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null | undefined; className?: string }) {
  const m = VERDICT_META[verdict ?? "pending"] ?? VERDICT_META.pending;
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

/** The verdict glyph alone (filled / half / hatched / dashed square) for dense lists and legends. */
export function VerdictDot({ verdict, className, size = 10 }: { verdict: Verdict; className?: string; size?: number }) {
  return <Glyph tone={VERDICT_TONE[verdict] ?? "pending"} size={size} className={className} />;
}

/** Fill classes for verdict bars. Non-compliant is always hatched, pending always dashed. */
export const dotClass: Record<Verdict, string> = {
  compliant: "bg-compliant",
  needs_review: "bg-review",
  non_compliant: "hatch-noncompliant",
  pending: "border border-dashed border-pending bg-transparent",
};

/* ── Country risk tier ──────────────────────────────────────────────────── */
export const RISK_META: Record<RiskTier, Meta> = {
  low: { label: "Low risk", tone: "compliant", icon: <Glyph tone="compliant" /> },
  standard: { label: "Standard risk", tone: "neutral", icon: <Glyph tone="neutral" /> },
  high: { label: "High risk", tone: "noncompliant", icon: <Glyph tone="noncompliant" /> },
};

export function RiskBadge({ tier, className }: { tier: RiskTier | null | undefined; className?: string }) {
  if (!tier) return null;
  const m = RISK_META[tier];
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

/* ── Land-change signal (second opinion from imagery) ────────────────────────── */
export const CHANGE_META: Record<ChangeLevel, Meta> = {
  low: { label: "Low", tone: "compliant", icon: <Glyph tone="compliant" /> },
  elevated: { label: "Elevated", tone: "review", icon: <Glyph tone="review" /> },
  high: { label: "High", tone: "noncompliant", icon: <Glyph tone="noncompliant" /> },
};

/** `short` renders a missing signal as "N/A" (with the full wording for screen readers) for narrow ledger columns. */
export function ChangeBadge({ level, className, prefix, short = false }: { level: ChangeLevel | null | undefined; className?: string; prefix?: string; short?: boolean }) {
  if (!level)
    return (
      <Badge tone="pending" className={className}>
        {prefix ? `${prefix}: ` : ""}
        {short ? (
          <>
            <span aria-hidden>N/A</span>
            <span className="sr-only">Not available</span>
          </>
        ) : (
          "Not available"
        )}
      </Badge>
    );
  const m = CHANGE_META[level];
  return (
    <Badge tone={m.tone} className={className}>
      {prefix ? `${prefix}: ` : ""}
      {m.label}
    </Badge>
  );
}

/* ── Shipments ──────────────────────────────────────────────────────────── */
export const SHIPMENT_META: Record<ShipmentStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: <Glyph tone="neutral" /> },
  blocked: { label: "Blocked", tone: "noncompliant", icon: <Glyph tone="noncompliant" /> },
  ready: { label: "Cleared to ship", tone: "compliant", icon: <Glyph tone="compliant" /> },
  submitted: { label: "Statement filed", tone: "brand", icon: <Glyph tone="brand" /> },
};

export function ShipmentBadge({ status }: { status: ShipmentStatus }) {
  const m = SHIPMENT_META[status] ?? SHIPMENT_META.draft;
  return (
    <Badge tone={m.tone}>
      {m.label}
    </Badge>
  );
}

/* ── Due diligence statements ───────────────────────────────────────────── */
export const DDS_META: Record<DdsStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: <Glyph tone="neutral" /> },
  submitted: { label: "Submitted (demo)", tone: "brand", icon: <Glyph tone="brand" /> },
  accepted: { label: "Accepted (demo)", tone: "compliant", icon: <Glyph tone="compliant" /> },
  rejected: { label: "Rejected", tone: "noncompliant", icon: <Glyph tone="noncompliant" /> },
};

export function DdsBadge({ status }: { status: DdsStatus | null | undefined }) {
  if (!status) return null;
  const m = DDS_META[status] ?? DDS_META.draft;
  return (
    <Badge tone={m.tone}>
      {m.label}
    </Badge>
  );
}

/* ── Campaigns ──────────────────────────────────────────────────────────── */
export const STAGE_META: Record<CampaignStage, Meta & { step: number }> = {
  requested: { label: "Requested", tone: "pending", icon: <Glyph tone="pending" />, step: 0 },
  reminded: { label: "Reminded", tone: "pending", icon: <Glyph tone="pending" />, step: 1 },
  submitted: { label: "Submitted", tone: "brand", icon: <Glyph tone="brand" />, step: 2 },
  assessing: { label: "Checking plots", tone: "brand", icon: <Glyph tone="brand" />, step: 3 },
  awaiting_review: { label: "Awaiting review", tone: "review", icon: <Glyph tone="review" />, step: 4 },
  changes_requested: { label: "Changes requested", tone: "review", icon: <Glyph tone="review" />, step: 5 },
  approved: { label: "Approved", tone: "compliant", icon: <Glyph tone="compliant" />, step: 5 },
  overdue: { label: "Overdue", tone: "noncompliant", icon: <Glyph tone="noncompliant" />, step: 1 },
};

export function StageBadge({ stage }: { stage: CampaignStage }) {
  const m = STAGE_META[stage] ?? STAGE_META.requested;
  return (
    <Badge tone={m.tone}>
      {m.label}
    </Badge>
  );
}

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, Meta> = {
  running: { label: "In progress", tone: "brand", icon: <Glyph tone="brand" /> },
  completed: { label: "Completed", tone: "compliant", icon: <Glyph tone="compliant" /> },
  cancelled: { label: "Stopped", tone: "neutral", icon: <Glyph tone="neutral" /> },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const m = CAMPAIGN_STATUS_META[status] ?? CAMPAIGN_STATUS_META.running;
  return (
    <Badge tone={m.tone}>
      {m.label}
    </Badge>
  );
}

/* ── Shipment checks ────────────────────────────────────────────────────── */
export const CHECK_META: Record<Check["status"], Meta> = {
  pass: { label: "Passed", tone: "compliant", icon: <Glyph tone="compliant" /> },
  warn: { label: "Warning", tone: "review", icon: <Glyph tone="review" /> },
  fail: { label: "Failed", tone: "noncompliant", icon: <Glyph tone="noncompliant" /> },
};

export function CheckIcon({ status, className }: { status: Check["status"]; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <Glyph tone={CHECK_META[status].tone} size={12} />
    </span>
  );
}

/* ── Country label ──────────────────────────────────────────────────────── */
export function CountryLabel({ code, name, className }: { code: string; name?: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className="text-[13px] leading-none">
        {flag(code)}
      </span>
      <span className="truncate">{name || countryName(code)}</span>
    </span>
  );
}
