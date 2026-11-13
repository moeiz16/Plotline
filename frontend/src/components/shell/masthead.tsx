"use client";

import { Check, ChevronDown, LogOut } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Logo } from "@/components/brand/logo";
import { SPRING_SNAP } from "@/components/motion/tokens";
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
  Tooltip,
} from "@/components/ui/overlays";
import { useNotifications, useReadAllNotifications, useReviews } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Me } from "@/lib/api/types";
import { daysUntil, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCOUNT_LINKS, TABS, allowed, isTabActive } from "./nav";

/* ── Deadline stake ─────────────────────────────────────────────────────── */
function fmtStakeDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
}

/** "D–46 · 30 DEC 2026", styled like a survey stake driven into the masthead. */
export function DeadlineStake({ me, compact, className }: { me: Me; compact?: boolean; className?: string }) {
  const d = me.activeOrg?.deadline;
  if (!d) return null;
  const days = d.daysLeft ?? daysUntil(d.date);
  return (
    <Tooltip content={`${days} days until EUDR obligations apply (${fmtStakeDate(d.date)})`}>
      <span
        tabIndex={0}
        className={cn("inline-flex h-7 shrink-0 items-stretch border border-ink font-mono text-[11px] font-medium uppercase tracking-[0.08em] outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        aria-label={`${days} days to the EUDR deadline, ${fmtStakeDate(d.date)}`}
      >
        <span className="flex items-center gap-1.5 bg-ink pl-1.5 pr-2 text-paper">
          <svg viewBox="0 0 10 14" className="h-3.5 w-2.5" aria-hidden>
            <path d="M1.5 13V1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M1.5 1 9 3.2 1.5 5.4Z" fill="var(--marker)" />
          </svg>
          <span className="numerals">D–{days}</span>
        </span>
        {compact ? null : <span className="numerals flex items-center px-2 text-ink">{fmtStakeDate(d.date)}</span>}
      </span>
    </Tooltip>
  );
}

/* ── Dispatches (notifications) ─────────────────────────────────────────── */
export function Dispatches({ compact }: { compact?: boolean }) {
  const q = useNotifications();
  const readAll = useReadAllNotifications();
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="group inline-flex h-7 items-center gap-1.5 px-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unread ? `Dispatches, ${unread} unread` : "Dispatches"}
        >
          {compact ? (
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M2 4h12v8H2z" />
              <path d="m2 4 6 5 6-5" />
            </svg>
          ) : (
            <span>Dispatches</span>
          )}
          <span
            className={cn(
              "numerals inline-flex h-4 min-w-4 items-center justify-center px-1 text-[10px]",
              unread ? "bg-marker-fill text-marker-contrast" : "border border-rule-strong text-ink-subtle",
            )}
            aria-hidden
          >
            {unread}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem]">
        <div className="flex items-center justify-between border-b-[3px] border-double border-ink/50 px-4 py-2.5">
          <p className="label-caps text-ink">Dispatches</p>
          {unread ? (
            <Button variant="link" size="xs" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
              Mark all as read
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {q.isPending ? (
            <p className="px-4 py-6 text-[15px] italic text-ink-muted">Reading the wire…</p>
          ) : !items.length ? (
            <p className="px-4 py-8 text-center text-[15px] italic text-ink-muted">Nothing new from the field.</p>
          ) : (
            <ul>
              {items.slice(0, 20).map((n) => {
                const body = (
                  <div className="grid grid-cols-[10px_1fr] gap-x-2.5 border-b border-rule px-4 py-3">
                    <span className={cn("mt-1.5 size-2", n.readAt ? "border border-rule-strong" : "bg-marker")} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium leading-snug">{n.title}</p>
                      {n.body ? <p className="mt-0.5 line-clamp-2 text-[14px] text-ink-muted">{n.body}</p> : null}
                      <p className="numerals mt-1 text-[10.5px] uppercase tracking-[0.06em] text-ink-subtle">{relative(n.createdAt)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} className="block outline-none hover:bg-sheet-2/60 focus-visible:bg-sheet-2">
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

/* ── Account menu (holds the admin pages and the theme) ─────────────────── */
export const THEMES = [
  ["light", "Paper"],
  ["dark", "Night satellite"],
  ["system", "Match my device"],
] as const;

function shortName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export function AccountMenu({ me }: { me: Me }) {
  const { logout, switchOrg } = useSession();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const perms = new Set(me.membership?.permissions ?? []);
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="inline-flex h-7 items-center gap-1 px-1.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink outline-none hover:text-marker-ink focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Account menu for ${me.user.fullName}`}
        >
          {shortName(me.user.fullName)}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </DropdownTrigger>
      <DropdownContent className="w-72">
        <div className="px-2 pb-2 pt-1.5">
          <p className="truncate text-[16px] font-medium">{me.user.fullName}</p>
          <p className="truncate font-mono text-[11px] text-ink-muted">{me.user.email}</p>
          <p className="mt-1 text-[13px] italic text-ink-muted">
            {me.membership?.roleLabel}
            {me.activeOrg ? ` · ${me.activeOrg.name}` : ""}
          </p>
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
                {o.id === me.activeOrg?.id ? <Check className="!text-marker" /> : null}
              </DropdownItem>
            ))}
            <DropdownSeparator />
          </>
        ) : null}
        <DropdownLabel>Organisation</DropdownLabel>
        {allowed(ACCOUNT_LINKS, perms).map((l) => (
          <DropdownItem key={l.href} onSelect={() => router.push(l.href)}>
            {l.label}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownLabel>Sheet</DropdownLabel>
        {THEMES.map(([v, l]) => (
          <DropdownItem key={v} onSelect={() => setTheme(v)}>
            <span className="flex-1">{l}</span>
            {theme === v ? <Check className="!text-marker" /> : null}
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

/* ── Section tabs ───────────────────────────────────────────────────────── */
export function MastheadTabs({ me }: { me: Me }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const perms = new Set(me.membership?.permissions ?? []);
  const reviews = useReviews(perms.has("plots:read"));
  const reviewCount = reviews.data?.length ?? 0;
  const tabs = allowed(TABS, perms);
  return (
    <nav aria-label="Sections" className="min-w-0">
      <ul className="flex items-stretch">
        {tabs.map((t) => {
          const active = isTabActive(pathname, t);
          return (
            <li key={t.href} className="relative flex">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-1.5 px-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.1em] outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:px-3.5",
                  active ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.badge === "reviews" && reviewCount > 0 ? (
                  <span className="numerals -mt-2 text-[10px] text-review-fg" aria-label={`${reviewCount} waiting`}>
                    {reviewCount}
                  </span>
                ) : null}
                {active ? (
                  <motion.span
                    layoutId="masthead-tab"
                    transition={reduce ? { duration: 0 } : SPRING_SNAP}
                    className="absolute inset-x-2 -bottom-px h-[3px] bg-marker"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── Masthead ───────────────────────────────────────────────────────────── */
/**
 * Desktop (≥1024 px): two tiers, like a map sheet's title block.
 *   tier 1 (32 px): organisation · role ......... dispatches · account
 *   tier 2 (48 px): wordmark | ATLAS SUPPLIERS SHIPMENTS … ......... deadline stake
 * Phone/tablet: one 52 px bar (wordmark, stake, dispatches); sections live in the bottom tab bar.
 */
export function Masthead({ me }: { me: Me }) {
  return (
    <header data-masthead className="sticky top-0 z-40 bg-paper/95 supports-[backdrop-filter]:bg-paper/85 supports-[backdrop-filter]:backdrop-blur-md">
      {/* Desktop tier 1 */}
      <div className="hidden h-8 items-center justify-between gap-4 border-b border-rule px-5 lg:flex">
        <p className="label-caps min-w-0 truncate text-ink-muted">
          <span className="text-ink">{me.activeOrg?.name}</span>
          {me.membership?.roleLabel ? <span> · {me.membership.roleLabel}</span> : null}
          <span className="hidden xl:inline"> · Aligned with EUDR (Regulation (EU) 2023/1115)</span>
        </p>
        <div className="flex items-center gap-3">
          <DeadlineStake me={me} className="h-6 xl:hidden" />
          <Dispatches />
          <span aria-hidden className="h-3.5 w-px bg-rule-strong" />
          <AccountMenu me={me} />
        </div>
      </div>
      {/* Desktop tier 2 */}
      <div className="hidden h-12 items-stretch gap-6 border-b border-ink/70 px-5 lg:flex">
        <Link href="/app" className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Plotline atlas">
          <Logo />
        </Link>
        <span aria-hidden className="my-3 w-px bg-rule-strong" />
        <MastheadTabs me={me} />
        <div className="ml-auto hidden items-center xl:flex">
          <DeadlineStake me={me} />
        </div>
      </div>
      {/* Phone / tablet bar */}
      <div className="flex h-[52px] items-center gap-2 border-b border-ink/70 px-4 lg:hidden">
        <Link href="/app" className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Plotline atlas">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <DeadlineStake me={me} compact />
          <Dispatches compact />
        </div>
      </div>
    </header>
  );
}
