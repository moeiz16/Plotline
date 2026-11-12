"use client";

import { X } from "lucide-react";
import { Dialog as D, DropdownMenu as DM, Popover as P, Tooltip as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

const panel = "z-50 rounded-sm border border-rule-strong bg-sheet text-ink shadow-pop outline-none";
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
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=open]:animate-[fade-in_180ms] data-[state=closed]:animate-[fade-out_140ms]" />
      <D.Content
        className={cn(
          panel,
          "fixed left-1/2 top-[6vh] z-50 flex max-h-[88vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col sm:top-[10vh] sm:max-h-[80vh]",
          "data-[state=open]:animate-[pop-in_240ms_var(--ease-out)] data-[state=closed]:animate-[pop-out_140ms_var(--ease-out)]",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-lg",
          size === "lg" && "max-w-2xl",
          size === "xl" && "max-w-4xl",
          className,
        )}
        {...props}
      >
        <div aria-hidden className="h-1 w-full bg-marker" />
        <div className="flex items-start justify-between gap-4 border-b-[3px] border-double border-ink/50 px-5 py-4">
          <div className="grid min-w-0 gap-1">
            <D.Title className="text-[21px] font-medium leading-tight tracking-[-0.01em]">{title}</D.Title>
            <D.Description className={cn("text-[14.5px] italic text-ink-muted", !description && "sr-only")}>
              {description ?? (typeof title === "string" ? title : "Dialog")}
            </D.Description>
          </div>
          <D.Close className="-mr-1 rounded-sm p-1 text-ink-subtle outline-none hover:bg-sheet-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close">
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
        "-mx-5 -mb-4 mt-5 flex flex-col-reverse gap-2 border-t border-rule bg-sheet-2/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

/* ── Sheet (side drawer / bottom sheet) ─────────────────────────────────── */
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;
export function SheetContent({
  className,
  children,
  title,
  description,
  side = "right",
  ...props
}: Omit<React.ComponentProps<typeof D.Content>, "title"> & { title: React.ReactNode; description?: React.ReactNode; side?: "right" | "left" | "bottom" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=open]:animate-[fade-in_180ms] data-[state=closed]:animate-[fade-out_160ms]" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border-rule-strong bg-sheet text-ink outline-none",
          side === "right" && "inset-y-0 right-0 w-[88vw] max-w-md border-l data-[state=open]:animate-[sheet-in-right_320ms_var(--ease-out)]",
          side === "left" && "inset-y-0 left-0 w-[86vw] max-w-sm border-r data-[state=open]:animate-[sheet-in-left_320ms_var(--ease-out)]",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[82dvh] border-t pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-[sheet-in-bottom_320ms_var(--ease-out)]",
          className,
        )}
        {...props}
      >
        {side === "bottom" ? <div aria-hidden className="mx-auto mt-2 h-1 w-10 bg-rule-strong" /> : null}
        <div className="flex items-start justify-between gap-4 border-b border-rule px-4 py-3">
          <div className="grid gap-0.5">
            <D.Title className="text-[18px] font-medium">{title}</D.Title>
            <D.Description className={cn("text-[14px] italic text-ink-muted", !description && "sr-only")}>{description ?? "Panel"}</D.Description>
          </div>
          <D.Close className="rounded-sm p-1 text-ink-subtle hover:bg-sheet-2 hover:text-ink" aria-label="Close">
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
          className="z-[60] max-w-xs rounded-xs bg-ink px-2 py-1 font-mono text-[11px] leading-snug tracking-[0.01em] text-paper data-[state=delayed-open]:animate-[fade-in_120ms]"
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
        "flex cursor-pointer select-none items-center gap-2 rounded-xs px-2 py-1.5 text-[15px] text-ink outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-sheet-2 data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("label-caps px-2 pb-1 pt-2 text-ink-subtle", className)} {...props} />;
}

export function DropdownSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-rule", className)} {...props} />;
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
            <button className={buttonVariants({ variant: "secondary" })}>Cancel</button>
          </DialogClose>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={buttonVariants({ variant: tone === "danger" ? "danger" : "primary" })}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
