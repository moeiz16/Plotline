"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api/client";
import { cn, copyText } from "@/lib/utils";
import { Button } from "./button";

/* ══════════════════════════════════════════════════════════════════════════
   Field Atlas display primitives. See DESIGN.md §6.
   Everything is a sheet of paper, a ruled line, a mono label or a glyph.
   No pills, no rounded cards, no icon-in-a-circle.
   ══════════════════════════════════════════════════════════════════════════ */

export type Tone = "neutral" | "brand" | "compliant" | "review" | "noncompliant" | "pending";

/* ── Glyph: status by shape first, colour second ────────────────────────── */
/**
 * compliant = filled square · review = half-filled square · noncompliant = hatched square
 * pending = dashed hollow square · neutral = hollow square · brand = filled marker diamond
 */
export function Glyph({ tone = "neutral", size = 10, className, label }: { tone?: Tone; size?: number; className?: string; label?: string }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 10 10", className: cn("inline-block shrink-0 align-[-0.05em]", className) };
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };
  const id = React.useId().replace(/:/g, "");
  switch (tone) {
    case "compliant":
      return (
        <svg {...common} {...a11y}>
          <rect x="0.5" y="0.5" width="9" height="9" fill="var(--compliant)" stroke="var(--compliant)" />
        </svg>
      );
    case "review":
      return (
        <svg {...common} {...a11y}>
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="var(--review)" />
          <path d="M0.5 9.5 9.5 0.5 9.5 9.5Z" fill="var(--review)" />
        </svg>
      );
    case "noncompliant":
      return (
        <svg {...common} {...a11y}>
          <defs>
            <pattern id={`h${id}`} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="1.3" height="3" fill="var(--noncompliant)" />
            </pattern>
          </defs>
          <rect x="0.5" y="0.5" width="9" height="9" fill={`url(#h${id})`} stroke="var(--noncompliant)" />
        </svg>
      );
    case "pending":
      return (
        <svg {...common} {...a11y}>
          <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke="var(--pending)" strokeWidth="1.3" strokeDasharray="2 1.5" />
        </svg>
      );
    case "brand":
      return (
        <svg {...common} {...a11y}>
          <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" fill="var(--marker)" />
        </svg>
      );
    default:
      return (
        <svg {...common} {...a11y}>
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="var(--ink-subtle)" />
        </svg>
      );
  }
}

const toneText: Record<Tone, string> = {
  neutral: "text-ink-muted",
  brand: "text-marker-ink",
  compliant: "text-compliant-fg",
  review: "text-review-fg",
  noncompliant: "text-noncompliant-fg",
  pending: "text-pending-fg",
};

/**
 * Badge → a status TAG: glyph + mono caps label, no pill.
 * Pass `icon` only for non-status tags; status tags use the tone glyph.
 */
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
        "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] [&_svg]:shrink-0",
        toneText[tone],
        className,
      )}
    >
      {icon ? <span className="inline-flex [&_svg]:size-[11px]">{icon}</span> : <Glyph tone={tone} />}
      <span className="truncate">{children}</span>
    </span>
  );
}
export const StatusTag = Badge;

/** A rubber stamp: bordered mono caps set at a slight angle (statements, evidence packs). */
export function Stamp({ tone = "brand", children, className, angle = -4 }: { tone?: Tone; children: React.ReactNode; className?: string; angle?: number }) {
  const border = {
    neutral: "border-ink-subtle",
    brand: "border-marker",
    compliant: "border-compliant",
    review: "border-review",
    noncompliant: "border-noncompliant",
    pending: "border-pending",
  }[tone];
  return (
    <span
      className={cn("inline-block border-2 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90", border, toneText[tone], className)}
      style={{ transform: `rotate(${angle}deg)` }}
    >
      {children}
    </span>
  );
}

/* ── Type helpers ───────────────────────────────────────────────────────── */
/** Mono small caps label (eyebrows, column heads, map labels). */
export function Caps({ as: As = "span", className, ...props }: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return <As className={cn("label-caps text-ink-muted", className)} {...props} />;
}

/** Coordinates in degrees, mono: 6.6885° N, 1.6244° W */
export function Coord({ lat, lon, digits = 4, className }: { lat: number; lon: number; digits?: number; className?: string }) {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(digits)}° ${v >= 0 ? pos : neg}`;
  return <span className={cn("numerals text-[12px] text-ink-muted", className)}>{`${f(lat, "N", "S")}, ${f(lon, "E", "W")}`}</span>;
}

/* ── Rules ──────────────────────────────────────────────────────────────── */
/** Horizontal rule. `double` = ledger head, `ticks` = survey ruler. */
export function Rule({ variant = "hair", className }: { variant?: "hair" | "double" | "ticks" | "ink"; className?: string }) {
  if (variant === "ticks")
    return (
      <div aria-hidden className={cn("h-2 w-full border-t border-ink/70", className)}
        style={{ backgroundImage: "linear-gradient(90deg, var(--ink-subtle) 1px, transparent 1px)", backgroundSize: "10% 6px", backgroundRepeat: "repeat-x", opacity: 0.8 }}
      />
    );
  if (variant === "double") return <div aria-hidden className={cn("h-[3px] w-full border-y border-ink/70", className)} />;
  if (variant === "ink") return <div aria-hidden className={cn("h-px w-full bg-ink", className)} />;
  return <div aria-hidden className={cn("h-px w-full bg-rule", className)} />;
}

/* ── Sheets (cards) ─────────────────────────────────────────────────────── */
/** A sheet of paper laid on the canvas: hairline border, square corners, no shadow. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-sm border border-rule bg-sheet", className)} {...props} />;
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
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-3 sm:px-5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <span className="mt-1 text-ink-subtle [&_svg]:size-4">{icon}</span> : null}
        <div className="min-w-0">
          <h2 className="text-[18px] font-medium leading-6 tracking-[-0.01em]">{title}</h2>
          {description ? <p className="mt-0.5 text-[14px] italic text-ink-muted">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

/** A document on the desk (statements, evidence packs): paper with a lifted shadow. */
export function Paper({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative min-w-0 border border-rule bg-sheet shadow-sheet", className)} {...props} />;
}

/** Translucent panel floating over the map (Atlas ledger, inspector, legends). */
export function FloatingPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-float min-w-0 rounded-sm text-ink", className)} {...props} />;
}

/* ── Page header (sheet title block) ────────────────────────────────────── */
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
    <header className={cn("mb-7", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="label-caps mb-2 flex items-center gap-2 text-ink-muted [&_a]:underline-offset-4 [&_a:hover]:underline">{eyebrow}</div> : null}
          <h1 className="text-[30px] font-medium leading-[1.08] tracking-[-0.02em] sm:text-[38px]">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <Rule variant="double" className="mt-5" />
    </header>
  );
}

/* ── Skeleton, empty, error ─────────────────────────────────────────────── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

/** Loading as unread ledger lines. */
export function LoadingBlock({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-rule py-3">
          <Skeleton className="h-3 w-8" />
          <Skeleton className={cn("h-3.5", i % 3 === 2 ? "w-1/3" : i % 2 ? "w-2/3" : "w-1/2")} />
        </div>
      ))}
    </div>
  );
}

/** Empty ledger: a dashed survey square and a field note. */
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
      <div className="mb-4 flex size-11 items-center justify-center border border-dashed border-rule-strong text-ink-subtle [&_svg]:size-[18px]">
        {icon ?? <Glyph tone="pending" size={12} />}
      </div>
      <p className="text-[18px] font-medium italic">{title}</p>
      {body ? <p className="mt-1.5 max-w-sm text-[15px] text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, title }: { error?: unknown; onRetry?: () => void; className?: string; title?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 size-11 border border-noncompliant hatch-noncompliant" aria-hidden />
      <p className="text-[18px] font-medium">{title ?? "We couldn’t load this sheet"}</p>
      <p className="mt-1.5 max-w-sm text-[15px] text-ink-muted">{errorMessage(error)}</p>
      {onRetry ? (
        <Button className="mt-5" size="sm" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/* ── Figures ────────────────────────────────────────────────────────────── */
/**
 * Figure: a measured number in a ledger column (label on top, mono numeral, note).
 * No card box: a top rule only. Use inside a <dl>-like row, never as a 4-up KPI grid.
 */
export function Figure({
  label,
  value,
  unit,
  sub,
  tone,
  className,
  size = "md",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={cn("min-w-0 border-t border-ink/70 pt-2", className)}>
      <div className="label-caps flex items-center gap-1.5 text-ink-muted">
        {tone ? <Glyph tone={tone} size={9} /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("numerals mt-1.5 font-normal text-ink", size === "lg" ? "text-[40px] leading-none" : size === "sm" ? "text-[18px]" : "text-[26px] leading-tight")}>
        {value}
        {unit ? <span className="ml-1 text-[0.5em] text-ink-muted">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 text-[13px] italic text-ink-muted">{sub}</div> : null}
    </div>
  );
}

/** Legacy KPI tile, re-drawn as a ruled Figure. Prefer <Figure> in new code. */
export function Stat({
  label,
  value,
  sub,
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
  const inner = <Figure label={label} value={value} sub={sub} />;
  return href ? (
    <Link href={href} className={cn("block min-w-0 outline-none transition-colors hover:[&_.numerals]:text-marker-ink focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {inner}
    </Link>
  ) : (
    <div className={cn("min-w-0", className)}>{inner}</div>
  );
}

/** Ruler meter: hairline track with tenth ticks, square-ended fill. */
export function Meter({ value, className, tone = "brand", label }: { value: number; className?: string; tone?: "brand" | "compliant" | "review" | "noncompliant"; label?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const bar = { brand: "bg-marker", compliant: "bg-compliant", review: "bg-review", noncompliant: "hatch-noncompliant" }[tone];
  return (
    <div
      className={cn("relative h-2 w-full", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-ink/40" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1.5"
        style={{ backgroundImage: "linear-gradient(90deg, var(--rule-strong) 1px, transparent 1px)", backgroundSize: "10% 100%" }}
      />
      <div className={cn("absolute bottom-0 left-0 h-1.5 transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-survey)]", bar)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ── Copyable value ─────────────────────────────────────────────────────── */
export function CopyField({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-sm border border-dashed border-rule-strong bg-sheet-2/60 p-1 pl-3", className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{value}</code>
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

/* ── Key / value with dot leaders (a field book entry) ──────────────────── */
export function DefinitionList({ items, className }: { items: { label: React.ReactNode; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex min-w-0 items-baseline gap-2 border-b border-rule py-2.5 text-[15px] last:border-b-0">
          <dt className="label-caps shrink-0 text-ink-muted">{it.label}</dt>
          <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-rule-strong" />
          <dd className="min-w-0 text-right text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Filter tag (toggle) ────────────────────────────────────────────────── */
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
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
        active ? "border-ink bg-ink text-paper" : "border-rule-strong bg-sheet text-ink-muted hover:border-ink hover:text-ink",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── Segmented control (instrument switch) ──────────────────────────────── */
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
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-sm border border-rule-strong bg-sheet p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          type="button"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-xs px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
            value === o.value ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tabs (section tabs inside a sheet) ─────────────────────────────────── */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-5 overflow-x-auto border-b border-rule scrollbar-thin", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent font-mono text-[11px] font-medium uppercase tracking-[0.09em] text-ink-muted outline-none transition-colors duration-[var(--dur-fast)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:border-marker data-[state=active]:text-ink [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ── Table → ledger ─────────────────────────────────────────────────────── */
/** A ruled ledger table. Head in mono caps over a double rule; rows on hairlines. */
export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto scrollbar-thin", className)}>
      <table className="w-full border-collapse text-[15px] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-sheet-2/50">{children}</table>
    </div>
  );
}
export function Th({ className, children, align }: { className?: string; children?: React.ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b-[3px] border-double border-ink/60 px-3 pb-2 pt-3 text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted first:pl-4 sm:first:pl-5",
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
        "border-b border-rule px-3 py-2.5 align-middle first:pl-4 sm:first:pl-5",
        align === "right" && "numerals text-right text-[13.5px]",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ── Ledger (ruled list, field-book rows) ───────────────────────────────── */
/**
 * <Ledger> is an ordered, ruled list. Each <LedgerRow> can carry a line number in the
 * margin (like a surveyor's field book), a link, and stagger in like ink (`index`).
 * Lay out the row's contents with a grid via className, e.g. "grid-cols-[1fr_auto_auto]".
 */
export function Ledger({ className, children, label }: { className?: string; children: React.ReactNode; label?: string }) {
  return (
    <ol aria-label={label} className={cn("grid border-t border-ink/60", className)}>
      {children}
    </ol>
  );
}

export function LedgerHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden className={cn("label-caps grid items-end gap-3 border-b-[3px] border-double border-ink/60 pb-2 text-ink-muted", className)}>
      {children}
    </div>
  );
}

export function LedgerRow({
  index,
  number,
  href,
  className,
  children,
  stagger = true,
  onClick,
  selected,
}: {
  /** Position, used for the ink stagger delay. */
  index?: number;
  /** Line number shown in the margin (e.g. 1, 2, 3 or "A-04"). */
  number?: React.ReactNode;
  href?: string;
  className?: string;
  children: React.ReactNode;
  stagger?: boolean;
  onClick?: () => void;
  selected?: boolean;
}) {
  const style = stagger && index !== undefined ? ({ animationDelay: `${Math.min(index, 14) * 35}ms` } as React.CSSProperties) : undefined;
  const inner = (
    <>
      {number !== undefined ? <span className="numerals w-8 shrink-0 pt-0.5 text-[11px] text-ink-subtle">{number}</span> : null}
      <div className={cn("grid min-w-0 flex-1 items-center gap-3", className)}>{children}</div>
    </>
  );
  const rowCls = cn(
    "relative flex min-w-0 items-start gap-2 border-b border-rule px-1 py-3 outline-none transition-colors duration-[var(--dur-fast)]",
    (href || onClick) && "hover:bg-sheet-2/60 focus-visible:bg-sheet-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    selected && "bg-marker-soft/60 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-marker",
  );
  return (
    <li style={style} className={cn(stagger && index !== undefined && "ink-in")}>
      {href ? (
        <Link href={href} className={rowCls} aria-current={selected ? "true" : undefined}>
          {inner}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(rowCls, "w-full text-left")} aria-pressed={selected}>
          {inner}
        </button>
      ) : (
        <div className={rowCls}>{inner}</div>
      )}
    </li>
  );
}

/* ── Section title ──────────────────────────────────────────────────────── */
/** Mono caps title with a rule running out to the action, like a map sheet section. */
export function SectionTitle({ children, className, action }: { children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      <h2 className="label-caps shrink-0 text-ink">{children}</h2>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-rule-strong" />
      {action}
    </div>
  );
}

/* ── Callout → field note ───────────────────────────────────────────────── */
const noteBar: Record<Tone, string> = {
  neutral: "border-l-ink-subtle",
  brand: "border-l-marker",
  compliant: "border-l-compliant",
  review: "border-l-review",
  noncompliant: "border-l-noncompliant",
  pending: "border-l-pending",
};

/** A field note pinned to the sheet: tone rule on the left, glyph, serif note. */
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
    <div className={cn("flex flex-col gap-3 border border-l-[3px] border-rule bg-sheet p-3.5 sm:flex-row sm:items-start", noteBar[tone], className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <span className={cn("mt-[5px] shrink-0 [&_svg]:size-4", toneText[tone])}>{icon && tone === "neutral" ? icon : <Glyph tone={tone} />}</span>
        <div className="min-w-0 text-[15px]">
          {title ? <p className="font-medium text-ink">{title}</p> : null}
          {children ? <div className={cn("text-[14.5px] leading-relaxed text-ink-muted", title && "mt-0.5")}>{children}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
