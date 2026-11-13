import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A field card: the paper slip a surveyor fills in. Used for sign-in, a new atlas and
 * invitations. A marker strip on top, a mono card number, a serif title over a double rule.
 */
export function FieldCard({
  number,
  kind,
  tag,
  title,
  description,
  children,
  footer,
  className,
}: {
  number: string;
  kind: string;
  tag?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("fade-in relative w-full max-w-[440px] border border-rule-strong bg-sheet shadow-sheet", className)}>
      <div className="h-1 bg-marker" aria-hidden />
      <div className="px-5 pb-6 pt-5 sm:px-7 sm:pb-7">
        <p className="flex items-center justify-between gap-3 label-caps text-ink-subtle">
          <span>
            Card № <span className="numerals text-ink">{number}</span> · {kind}
          </span>
          {tag}
        </p>
        <h1 className="mt-4 text-[28px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[30px]">{title}</h1>
        {description ? <p className="mt-2 text-[15px] italic leading-relaxed text-ink-muted">{description}</p> : null}
        <div className="mt-5 border-t-[3px] border-double border-ink/60 pt-6">{children}</div>
      </div>
      {footer ? <div className="border-t border-dashed border-rule-strong px-5 py-4 sm:px-7">{footer}</div> : null}
    </div>
  );
}

/** "or" divider on a field card, drawn as a dashed survey line. */
export function CardDivider({ children = "or" }: { children?: ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3 label-caps text-ink-subtle" role="separator">
      <span className="h-px flex-1 border-t border-dashed border-rule-strong" />
      {children}
      <span className="h-px flex-1 border-t border-dashed border-rule-strong" />
    </div>
  );
}
