import { cn } from "@/lib/utils";

/**
 * The Plotline mark: a surveyed parcel (irregular outline with vertex points) holding a leaf.
 * The plot is the unit of proof; the leaf is what it proves.
 */
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d="M3.8 7.6 13.2 3.6 20.4 9.2 18.2 20.2 5.8 19.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.6 15.6c.4-4.2 3.2-6.6 7.6-6.7-.1 4.3-2.9 6.8-7.6 6.7Z" fill="currentColor" opacity="0.9" />
      <path d="M8.6 15.6 12.6 11.9" stroke="var(--mark-vein, #fff)" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="3.8" cy="7.6" r="1.35" fill="currentColor" />
      <circle cx="13.2" cy="3.6" r="1.35" fill="currentColor" />
      <circle cx="20.4" cy="9.2" r="1.35" fill="currentColor" />
      <circle cx="18.2" cy="20.2" r="1.35" fill="currentColor" />
      <circle cx="5.8" cy="19.2" r="1.35" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, markClassName, compact }: { className?: string; markClassName?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg [--mark-vein:var(--surface)]", className)}>
      <Mark className={cn("text-brand", markClassName)} />
      {compact ? <span className="sr-only">Plotline</span> : <span className="text-[17px] font-semibold tracking-[-0.015em]">plotline</span>}
    </span>
  );
}
