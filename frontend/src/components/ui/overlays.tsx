"use client";

import { X } from "lucide-react";
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const panel = "z-50 rounded-lg border border-border bg-surface text-fg shadow-pop outline-none";
const anim =
  "origin-[var(--radix-popper-transform-origin)] data-[state=open]:animate-[pop-in_160ms_var(--ease-out)] data-[state=closed]:animate-[pop-out_120ms_var(--ease-out)]";

/* ── Dialog ─────────────────────────────────────────────────────────────── */
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[rgb(20_19_17/0.42)] data-[state=open]:animate-[fade-in_150ms] data-[state=closed]:animate-[fade-out_140ms]" />
      <D.Content
        className={cn(
          panel,
          "fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col sm:top-[10vh] sm:max-h-[80vh]",
          "data-[state=open]:animate-[pop-in_200ms_var(--ease-out)] data-[state=closed]:animate-[pop-out_140ms_var(--ease-out)]",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-2xl",
          size === "xl" && "max-w-4xl",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="grid min-w-0 gap-1">
            <D.Title className="text-base font-semibold">{title}</D.Title>
            <D.Description className={cn("text-[13px] text-muted", !description && "sr-only")}>
              {description ?? (typeof title === "string" ? title : "Dialog")}
            </D.Description>
          </div>
          <D.Close className="-mr-1 rounded-sm p-1 text-subtle outline-none hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "-mx-5 -mb-4 mt-5 flex flex-col-reverse gap-2 border-t border-border bg-surface-2/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

/* ── Sheet (side drawer) ────────────────────────────────────────────────── */
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export function SheetContent({
  className,
  children,
  title,
  description,
  side = "right",
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & { title: React.ReactNode; description?: React.ReactNode; side?: "right" | "left" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[rgb(20_19_17/0.36)] data-[state=open]:animate-[fade-in_150ms] data-[state=closed]:animate-[fade-out_160ms]" />
      <D.Content
        className={cn(
          "fixed inset-y-0 z-50 flex w-[86vw] max-w-sm flex-col border-border bg-surface outline-none",
          side === "right"
            ? "right-0 border-l data-[state=open]:animate-[sheet-in-right_200ms_var(--ease-out)]"
            : "left-0 border-r data-[state=open]:animate-[sheet-in-left_200ms_var(--ease-out)]",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="grid gap-0.5">
            <D.Title className="text-[15px] font-semibold">{title}</D.Title>
            <D.Description className={cn("text-[13px] text-muted", !description && "sr-only")}>{description ?? "Panel"}</D.Description>
          </div>
          <D.Close className="rounded-sm p-1 text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

/* ── Popover ────────────────────────────────────────────────────────────── */
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, align = "end", sideOffset = 8, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(panel, anim, "w-80 max-w-[calc(100vw-1.5rem)] p-0", className)}
        {...props}
      />
    </P.Portal>
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */
export const TooltipProvider = T.Provider;
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[60] max-w-xs rounded-md bg-fg px-2 py-1 text-xs font-medium leading-snug text-bg data-[state=delayed-open]:animate-[fade-in_120ms]"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/* ── Dropdown menu ──────────────────────────────────────────────────────── */
export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;

export function DropdownContent({ className, align = "end", sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={sideOffset} collisionPadding={12} className={cn(panel, anim, "min-w-52 p-1", className)} {...props} />
    </DM.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-fg outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2 py-1.5 text-xs text-muted", className)} {...props} />;
}

export function DropdownSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

/* ── Confirm dialog ─────────────────────────────────────────────────────── */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "primary",
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} size="sm">
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <button className="h-9 rounded-md border border-border-strong bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">Cancel</button>
          </DialogClose>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "h-9 rounded-md px-3.5 text-sm font-medium disabled:opacity-50",
              tone === "danger" ? "bg-noncompliant text-white dark:text-[#1b1a17]" : "bg-brand text-brand-contrast hover:bg-brand-hover",
            )}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
