import {
  Ban,
  BellRing,
  CircleCheck,
  CircleDashed,
  CircleExclamationPoint,
  CircleX,
  ClockExclamationPoint,
  Eye,
  FilePen,
  LoaderCircle,
  Mail,
  MessageSquareExclamationPoint,
  OctagonX,
  Send,
  Shield,
  ShieldCheck,
  ShieldExclamationPoint,
  Satellite,
  TriangleExclamationPoint,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/display";
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
    icon: <CircleCheck aria-hidden />,
    description: "No forest on this plot was cleared after 31 December 2020.",
  },
  needs_review: {
    label: "Needs review",
    short: "Review",
    tone: "review",
    icon: <CircleExclamationPoint aria-hidden />,
    description: "Something needs a closer look by a reviewer before this plot can be used.",
  },
  non_compliant: {
    label: "Non-compliant",
    short: "Non-compliant",
    tone: "noncompliant",
    icon: <OctagonX aria-hidden />,
    description: "Forest on this plot was cleared after 31 December 2020. Product from it cannot be placed on the EU market.",
  },
  pending: {
    label: "Pending",
    short: "Pending",
    tone: "pending",
    icon: <CircleDashed aria-hidden />,
    description: "Not checked yet, or evidence is still missing.",
  },
};

export const VERDICT_ORDER: Verdict[] = ["compliant", "needs_review", "non_compliant", "pending"];

/** Hex colours for map layers (canvas cannot read CSS variables). Readable on light, dark and satellite basemaps. */
export const VERDICT_MAP_COLOR: Record<Verdict, string> = {
  compliant: "#3f9a63",
  needs_review: "#e3a12f",
  non_compliant: "#d24b3a",
  pending: "#8391ab",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null | undefined; className?: string }) {
  const m = VERDICT_META[verdict ?? "pending"] ?? VERDICT_META.pending;
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Badge>
  );
}

/** Small coloured dot + label for dense lists and legends. */
export function VerdictDot({ verdict, className }: { verdict: Verdict; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", dotClass[verdict], className)} />;
}

export const dotClass: Record<Verdict, string> = {
  compliant: "bg-compliant",
  needs_review: "bg-review",
  non_compliant: "bg-noncompliant",
  pending: "bg-pending",
};

/* ── Country risk tier ──────────────────────────────────────────────────── */
export const RISK_META: Record<RiskTier, Meta> = {
  low: { label: "Low risk", tone: "compliant", icon: <ShieldCheck aria-hidden /> },
  standard: { label: "Standard risk", tone: "neutral", icon: <Shield aria-hidden /> },
  high: { label: "High risk", tone: "noncompliant", icon: <ShieldExclamationPoint aria-hidden /> },
};

export function RiskBadge({ tier, className }: { tier: RiskTier | null | undefined; className?: string }) {
  if (!tier) return null;
  const m = RISK_META[tier];
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Badge>
  );
}

/* ── Land-change check (satellite change signal) ────────────────────────── */
export const CHANGE_META: Record<ChangeLevel, Meta> = {
  low: { label: "Low", tone: "compliant", icon: <Satellite aria-hidden /> },
  elevated: { label: "Elevated", tone: "review", icon: <Satellite aria-hidden /> },
  high: { label: "High", tone: "noncompliant", icon: <Satellite aria-hidden /> },
};

export function ChangeBadge({ level, className, prefix }: { level: ChangeLevel | null | undefined; className?: string; prefix?: string }) {
  if (!level)
    return (
      <Badge tone="pending" icon={<CircleDashed aria-hidden />} className={className}>
        {prefix ? `${prefix}: ` : ""}Not available
      </Badge>
    );
  const m = CHANGE_META[level];
  return (
    <Badge tone={m.tone} icon={m.icon} className={className}>
      {prefix ? `${prefix}: ` : ""}
      {m.label}
    </Badge>
  );
}

/* ── Shipments ──────────────────────────────────────────────────────────── */
export const SHIPMENT_META: Record<ShipmentStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: <FilePen aria-hidden /> },
  blocked: { label: "Blocked", tone: "noncompliant", icon: <Ban aria-hidden /> },
  ready: { label: "Cleared to ship", tone: "compliant", icon: <CircleCheck aria-hidden /> },
  submitted: { label: "Statement filed", tone: "brand", icon: <Send aria-hidden /> },
};

export function ShipmentBadge({ status }: { status: ShipmentStatus }) {
  const m = SHIPMENT_META[status] ?? SHIPMENT_META.draft;
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
    </Badge>
  );
}

/* ── Due diligence statements ───────────────────────────────────────────── */
export const DDS_META: Record<DdsStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: <FilePen aria-hidden /> },
  submitted: { label: "Submitted (demo)", tone: "brand", icon: <Send aria-hidden /> },
  accepted: { label: "Accepted (demo)", tone: "compliant", icon: <CircleCheck aria-hidden /> },
  rejected: { label: "Rejected", tone: "noncompliant", icon: <CircleX aria-hidden /> },
};

export function DdsBadge({ status }: { status: DdsStatus | null | undefined }) {
  if (!status) return null;
  const m = DDS_META[status] ?? DDS_META.draft;
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
    </Badge>
  );
}

/* ── Campaigns ──────────────────────────────────────────────────────────── */
export const STAGE_META: Record<CampaignStage, Meta & { step: number }> = {
  requested: { label: "Requested", tone: "pending", icon: <Mail aria-hidden />, step: 0 },
  reminded: { label: "Reminded", tone: "pending", icon: <BellRing aria-hidden />, step: 1 },
  submitted: { label: "Submitted", tone: "brand", icon: <Upload aria-hidden />, step: 2 },
  assessing: { label: "Checking plots", tone: "brand", icon: <LoaderCircle aria-hidden />, step: 3 },
  awaiting_review: { label: "Awaiting review", tone: "review", icon: <Eye aria-hidden />, step: 4 },
  changes_requested: { label: "Changes requested", tone: "review", icon: <MessageSquareExclamationPoint aria-hidden />, step: 5 },
  approved: { label: "Approved", tone: "compliant", icon: <CircleCheck aria-hidden />, step: 5 },
  overdue: { label: "Overdue", tone: "noncompliant", icon: <ClockExclamationPoint aria-hidden />, step: 1 },
};

export function StageBadge({ stage }: { stage: CampaignStage }) {
  const m = STAGE_META[stage] ?? STAGE_META.requested;
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
    </Badge>
  );
}

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, Meta> = {
  running: { label: "In progress", tone: "brand", icon: <LoaderCircle aria-hidden /> },
  completed: { label: "Completed", tone: "compliant", icon: <CircleCheck aria-hidden /> },
  cancelled: { label: "Stopped", tone: "neutral", icon: <Ban aria-hidden /> },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const m = CAMPAIGN_STATUS_META[status] ?? CAMPAIGN_STATUS_META.running;
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
    </Badge>
  );
}

/* ── Shipment checks ────────────────────────────────────────────────────── */
export const CHECK_META: Record<Check["status"], Meta> = {
  pass: { label: "Passed", tone: "compliant", icon: <CircleCheck aria-hidden /> },
  warn: { label: "Warning", tone: "review", icon: <TriangleExclamationPoint aria-hidden /> },
  fail: { label: "Failed", tone: "noncompliant", icon: <CircleX aria-hidden /> },
};

export function CheckIcon({ status, className }: { status: Check["status"]; className?: string }) {
  const color = { pass: "text-compliant", warn: "text-review", fail: "text-noncompliant" }[status];
  return <span className={cn("inline-flex shrink-0 [&_svg]:size-[18px]", color, className)}>{CHECK_META[status].icon}</span>;
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
