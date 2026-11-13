"use client";

import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

/** A field-book entry line: sheet ground, ruled border, ink focus with a marker ring. */
export const fieldClass =
  "w-full min-w-0 rounded-sm border border-rule-strong bg-sheet px-3 text-[15px] text-ink outline-none transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:italic placeholder:text-ink-subtle hover:border-ink/50 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-marker/25 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-noncompliant aria-[invalid=true]:ring-noncompliant/15"

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { leading?: React.ReactNode; trailing?: React.ReactNode; wrapperClassName?: string }
>(({ className, leading, trailing, wrapperClassName, ...props }, ref) => {
  if (!leading && !trailing && !wrapperClassName) return <input ref={ref} className={cn(fieldClass, "h-10", className)} {...props} />;
  return (
    <div className={cn("relative flex items-center", wrapperClassName)}>
      {leading ? <span className="pointer-events-none absolute left-2.5 flex text-subtle [&_svg]:size-4">{leading}</span> : null}
      <input ref={ref} className={cn(fieldClass, "h-10", leading && "pl-8", trailing && "pr-9", className)} {...props} />
      {trailing ? <span className="absolute right-2 flex items-center text-subtle">{trailing}</span> : null}
    </div>
  );
});
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClass, "min-h-20 py-2 leading-relaxed", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

/** Native select: fully keyboard and screen-reader friendly, styled to match. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn("relative", wrapperClassName)}>
      <select ref={ref} className={cn(fieldClass, "h-10 appearance-none pr-8", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
    </div>
  ),
);
Select.displayName = "Select";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("label-caps text-ink-muted", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  optional,
  action,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      {label ? (
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={htmlFor}>{label}</Label>
          {action ?? (optional ? <span className="font-serif text-xs italic text-ink-subtle">optional</span> : null)}
        </div>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-[13px] text-noncompliant-fg">
          <span aria-hidden className="inline-block size-2 shrink-0 hatch-noncompliant" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] italic text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative flex items-center">
        <input ref={ref} type={show ? "text" : "password"} className={cn(fieldClass, "h-10 pr-10", className)} {...props} />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-1.5 flex size-7 items-center justify-center rounded-sm text-ink-subtle outline-none hover:bg-sheet-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  const auto = React.useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className={cn("flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-60")}>
      <input
        id={cid}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 cursor-pointer rounded-none border-rule-strong accent-[var(--marker-fill)]"
      />
      <span className="grid gap-0.5">
        <span className="text-[15px] text-ink">{label}</span>
        {description ? <span className="text-[13px] text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}
