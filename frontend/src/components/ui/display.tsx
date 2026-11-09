"use client";

import { AlertTriangle, Check, Copy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { cn, copyText } from "@/lib/utils";
import { Button } from "./button";

/* ── Card ───────────────────────────────────────────────────────────────── */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
  icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-0.5 text-subtle [&_svg]:size-4">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

/* ── Page header ────────────────────────────────────────────────────────── */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-[13px] text-muted">{eyebrow}</div> : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────────────────── */
export type Tone = "neutral" | "brand" | "compliant" | "review" | "noncompliant" | "pending";
const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  brand: "bg-brand-soft text-brand-fg border-brand/20",
  compliant: "bg-compliant-soft text-compliant-fg border-compliant/25",
  review: "bg-review-soft text-review-fg border-review/30",
  noncompliant: "bg-noncompliant-soft text-noncompliant-fg border-noncompliant/25",
  pending: "bg-pending-soft text-pending-fg border-pending/25",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/* ── Skeleton, empty, error ─────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

export function LoadingBlock({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-10", i % 3 === 2 && "w-2/3")} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-border bg-surface-2 text-muted [&_svg]:size-5">{icon}</div>
      ) : null}
      <p className="text-[15px] font-medium">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, title }: { error?: unknown; onRetry?: () => void; className?: string; title?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-noncompliant/25 bg-noncompliant-soft text-noncompliant-fg">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-[15px] font-medium">{title ?? "We couldn’t load this"}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{errorMessage(error)}</p>
      {onRetry ? (
        <Button className="mt-4" size="sm" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ── Metrics ────────────────────────────────────────────────────────────── */
export function Stat({
  label,
  value,
  sub,
  icon,
  href,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted">
        <span className="truncate">{label}</span>
        {icon ? <span className="text-subtle [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular tracking-[-0.01em]">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </>
  );
  const cls = cn("block min-w-0 rounded-lg border border-border bg-surface p-4", className);
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors duration-150 hover:border-border-strong hover:bg-surface-2/40")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Meter({ value, className, tone = "brand", label }: { value: number; className?: string; tone?: "brand" | "compliant" | "review" | "noncompliant"; label?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const bar = { brand: "bg-brand", compliant: "bg-compliant", review: "bg-review", noncompliant: "bg-noncompliant" }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-200", bar)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ── Copyable value ─────────────────────────────────────────────────────── */
export function CopyField({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-md border border-border-strong bg-surface-2/60 p-1 pl-3", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg" title={value}>
        {value}
      </code>
      <Button
        size="sm"
        variant="primary"
        aria-label={label ?? "Copy link"}
        onClick={async () => {
          const ok = await copyText(value);
          if (ok) {
            setDone(true);
            toast.success("Copied to clipboard");
            setTimeout(() => setDone(false), 1600);
          } else toast.error("Couldn’t copy. Select the text and copy it manually.");
        }}
      >
        {done ? <Check /> : <Copy />} {done ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/* ── Key / value list ───────────────────────────────────────────────────── */
export function DefinitionList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-0 divide-y divide-border", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
          <dt className="text-muted">{it.label}</dt>
          <dd className="min-w-0 text-right font-medium text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Filter chip ────────────────────────────────────────────────────────── */
export function Chip({
  active,
  onClick,
  children,
  className,
  icon,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
        active ? "border-brand bg-brand-soft text-brand-fg" : "border-border-strong bg-surface text-muted hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── Segmented control ──────────────────────────────────────────────────── */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-md border border-border-strong bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          type="button"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
            value === o.value ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-1 overflow-x-auto border-b border-border scrollbar-thin", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-brand data-[state=active]:text-fg",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ── Table ──────────────────────────────────────────────────────────────── */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto scrollbar-thin", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ className, children, align }: { className?: string; children?: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-border bg-surface-2/50 px-4 py-2.5 text-left text-xs font-medium text-muted first:pl-4 sm:first:pl-5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}
export function Td({ className, children, align, colSpan }: { className?: string; children?: React.ReactNode; align?: "left" | "right" | "center"; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "whitespace-nowrap border-b border-border px-4 py-3 align-middle first:pl-4 sm:first:pl-5",
        align === "right" && "text-right tabular",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ── Section title ──────────────────────────────────────────────────────── */
export function SectionTitle({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/* ── Callout ────────────────────────────────────────────────────────────── */
export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  className,
  action,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-start", toneClass[tone], className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icon ? <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span> : null}
        <div className="min-w-0 text-sm">
          {title ? <p className="font-medium text-fg">{title}</p> : null}
          {children ? <div className={cn("text-[13px] leading-relaxed text-muted", title && "mt-0.5")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
