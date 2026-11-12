import { cn } from "@/lib/utils";

/**
 * The Plotline mark: a surveyed parcel with contour lines inside, staked at one corner
 * with a marker-orange survey flag. The parcel is the unit of proof; the contours are
 * the land; the stake is the claim. Ink + one orange flag, never verdict colours.
 */
export function Mark({ className, title, animated }: { className?: string; title?: string; animated?: boolean }) {
  const id = "pl-mark-clip";
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("size-6", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={id}>
          <path d="M4.5 9 15.8 5.2 21.2 11.4 17.8 20.6 5.8 19.2Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`} stroke="currentColor" strokeWidth="0.85" strokeLinecap="round" opacity="0.5">
        <path d="M4 15.6c3-1.6 5.2-.2 7.8-1.6s4.2-3.4 7.4-2.6" />
        <path d="M8.2 19.4c2.4-1.5 4.6-.9 6.8-2.2s2.6-2.4 5.2-2.3" />
      </g>
      <path
        d="M4.5 9 15.8 5.2 21.2 11.4 17.8 20.6 5.8 19.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        pathLength={1}
        className={animated ? "draw-in" : undefined}
      />
      <path d="M4.5 9V1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 1.8 10 3.5 4.5 5.2Z" fill="var(--marker)" />
    </svg>
  );
}

export function Logo({ className, markClassName, compact, animated }: { className?: string; markClassName?: string; compact?: boolean; animated?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <Mark className={cn("size-[26px]", markClassName)} animated={animated} />
      {compact ? (
        <span className="sr-only">Plotline</span>
      ) : (
        <span className="font-serif text-[22px] font-semibold leading-none tracking-[-0.025em]">Plotline</span>
      )}
    </span>
  );
}
