"use client";

import { Bell, CalendarClock, Check, LogOut, Menu, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  Tooltip,
} from "@/components/ui/overlays";
import { useNotifications, useReadAllNotifications, useReviews } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Me } from "@/lib/api/types";
import { daysUntil, relative } from "@/lib/format";
import { cn, initials } from "@/lib/utils";
import { NAV, isActive } from "./nav";

function NavList({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  const perms = new Set(me.membership?.permissions ?? []);
  const reviews = useReviews(perms.has("plots:read"));
  const reviewCount = reviews.data?.length ?? 0;
  return (
    <nav aria-label="Main" className="grid gap-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || perms.has(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">{g.group}</p>
            <ul className="grid gap-0.5">
              {items.map((i) => {
                const active = isActive(pathname, i.href);
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-brand-soft font-medium text-brand-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{i.label}</span>
                      {i.badge === "reviews" && reviewCount > 0 ? (
                        <span className="rounded-full bg-review-soft px-1.5 text-[11px] font-semibold tabular text-review-fg" aria-label={`${reviewCount} waiting`}>
                          {reviewCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function OrgCard({ me }: { me: Me }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/50 px-3 py-2.5">
      <p className="truncate text-[13px] font-medium" title={me.activeOrg?.name}>
        {me.activeOrg?.name ?? "No organisation"}
      </p>
      <p className="truncate text-xs text-muted">{me.membership?.roleLabel ?? ""}</p>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Tooltip content={next === "dark" ? "Dark theme" : "Light theme"}>
      <Button variant="ghost" size="icon-sm" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </Button>
    </Tooltip>
  );
}

function Notifications() {
  const q = useNotifications();
  const readAll = useReadAllNotifications();
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell />
          {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-noncompliant ring-2 ring-surface" aria-hidden /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread ? (
            <Button variant="link" size="xs" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
              <Check /> Mark all as read
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {q.isPending ? (
            <p className="px-4 py-6 text-sm text-muted">Loading…</p>
          ) : !items.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You’re all caught up.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.slice(0, 20).map((n) => {
                const body = (
                  <div className="flex gap-2.5 px-4 py-3">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{n.body}</p> : null}
                      <p className="mt-1 text-xs text-subtle">{relative(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} className="block outline-none hover:bg-surface-2 focus-visible:bg-surface-2">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu({ me }: { me: Me }) {
  const { logout, switchOrg } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          style={{ background: me.user.avatarColor || "#1f5c4d" }}
          aria-label={`Account menu for ${me.user.fullName}`}
        >
          {initials(me.user.fullName)}
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium">{me.user.fullName}</p>
          <p className="truncate text-xs text-muted">{me.user.email}</p>
        </div>
        <DropdownSeparator />
        {me.orgs.length > 1 ? (
          <>
            <DropdownLabel>Organisations</DropdownLabel>
            {me.orgs.map((o) => (
              <DropdownItem
                key={o.id}
                onSelect={async () => {
                  if (o.id === me.activeOrg?.id) return;
                  await switchOrg(o.id);
                  router.push("/app");
                }}
              >
                <span className="flex-1 truncate">{o.name}</span>
                {o.id === me.activeOrg?.id ? <Check className="!text-brand" /> : null}
              </DropdownItem>
            ))}
            <DropdownSeparator />
          </>
        ) : null}
        <DropdownLabel>Theme</DropdownLabel>
        {(
          [
            ["light", "Light", Sun],
            ["dark", "Dark", Moon],
            ["system", "Match my device", Monitor],
          ] as const
        ).map(([v, l, Icon]) => (
          <DropdownItem key={v} onSelect={() => setTheme(v)}>
            <Icon /> <span className="flex-1">{l}</span>
            {theme === v ? <Check className="!text-brand" /> : null}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem
          onSelect={async () => {
            await logout();
            router.replace("/signin");
          }}
        >
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function DeadlineChip({ me }: { me: Me }) {
  const d = me.activeOrg?.deadline;
  if (!d) return null;
  const days = d.daysLeft ?? daysUntil(d.date);
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted md:inline-flex">
      <CalendarClock className="size-3.5 text-brand" aria-hidden />
      <span>
        <span className="font-semibold tabular text-fg">{days}</span> days to the EUDR deadline
      </span>
    </span>
  );
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col">
        <div className="flex h-14 items-center px-4">
          <Link href="/app" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Plotline overview">
            <Logo />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-4 pt-2 scrollbar-thin">
          <OrgCard me={me} />
          <NavList me={me} />
        </div>
        <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-subtle">Aligned with EUDR (Regulation (EU) 2023/1115)</p>
      </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/95 px-3 backdrop-blur-none sm:px-5">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <Link href="/app" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden" aria-label="Plotline overview">
            <Logo />
          </Link>
          <p className="hidden min-w-0 truncate text-sm font-medium text-muted lg:block">{me.activeOrg?.name}</p>
          <div className="ml-auto flex items-center gap-1.5">
            <DeadlineChip me={me} />
            <Notifications />
            <ThemeToggle />
            <UserMenu me={me} />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" title={<Logo />} description="Navigation">
          <div className="grid gap-5 p-3">
            <OrgCard me={me} />
            <NavList me={me} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PageContainer({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 sm:py-8", wide ? "max-w-[1440px]" : "max-w-[1240px]", className)}>{children}</div>;
}
