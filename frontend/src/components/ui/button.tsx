import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium outline-none transition-[background-color,color,border-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-contrast hover:bg-brand-hover",
        secondary: "border border-border-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        subtle: "bg-surface-2 text-fg hover:bg-surface-3",
        danger: "bg-noncompliant text-white hover:opacity-90 dark:text-[#1b1a17]",
        "danger-outline": "border border-noncompliant/40 bg-surface text-noncompliant-fg hover:bg-noncompliant-soft",
        link: "h-auto px-0 text-brand-fg underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 rounded-sm px-2 text-xs [&_svg]:size-3.5",
        sm: "h-8 rounded-md px-2.5 text-[13px]",
        md: "h-9 rounded-md px-3.5 text-sm",
        lg: "h-11 rounded-md px-5 text-[15px]",
        icon: "size-9 rounded-md",
        "icon-sm": "size-8 rounded-md",
      },
    },
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
