import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Field Atlas buttons: square-cornered, mono small caps, like a stamped field tag.
 * primary = marker orange (one per view), ink = strong neutral, secondary = ruled outline.
 */
export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-mono font-medium uppercase tracking-[0.07em] outline-none transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-marker-fill text-marker-contrast shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] hover:bg-marker-hover",
        ink: "bg-ink text-paper hover:bg-ink/90",
        secondary: "border border-rule-strong bg-sheet text-ink hover:border-ink hover:shadow-[2px_2px_0_var(--ink)] active:shadow-none",
        ghost: "text-ink-muted hover:bg-sheet-2 hover:text-ink",
        subtle: "bg-sheet-2 text-ink hover:bg-sheet-3",
        danger: "bg-noncompliant text-white hover:opacity-90 dark:text-[#140a04]",
        "danger-outline": "border border-noncompliant/50 bg-sheet text-noncompliant-fg hover:hatch-noncompliant hover:text-noncompliant-fg",
        link: "h-auto !px-0 font-serif normal-case tracking-normal italic text-marker-ink underline decoration-marker/50 underline-offset-4 hover:decoration-marker",
      },
      size: {
        xs: "h-7 rounded-sm px-2 text-[10.5px] [&_svg]:size-3.5",
        sm: "h-8 rounded-sm px-2.5 text-[11px]",
        md: "h-9 rounded-sm px-3.5 text-[11.5px]",
        lg: "h-11 rounded-sm px-5 text-[12.5px]",
        icon: "size-9 rounded-sm",
        "icon-sm": "size-8 rounded-sm",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0 text-sm" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, type, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
