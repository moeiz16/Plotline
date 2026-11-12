import type { Permission } from "@/lib/api/types";

/**
 * Field Atlas navigation model (DESIGN.md §5).
 * Masthead tabs left to right; the order also drives the page-transition direction.
 * Admin pages (activity log, members, settings) live in the account menu, not in the tabs.
 */
export interface TabItem {
  href: string;
  label: string; // rendered in mono caps
  short?: string; // phone tab bar label
  perm?: Permission;
  badge?: "reviews";
  /** Other route prefixes that belong to this tab (e.g. /app/plots under ATLAS). */
  also?: string[];
}

export const TABS: TabItem[] = [
  { href: "/app", label: "Atlas", perm: "plots:read", also: ["/app/map", "/app/plots"] },
  { href: "/app/suppliers", label: "Suppliers", perm: "suppliers:read" },
  { href: "/app/shipments", label: "Shipments", short: "Shipments", perm: "shipments:read" },
  { href: "/app/statements", label: "Statements", perm: "dds:read" },
  { href: "/app/campaigns", label: "Campaigns", perm: "campaigns:read" },
  { href: "/app/reviews", label: "Reviews", perm: "plots:read", badge: "reviews" },
  { href: "/app/countries", label: "Countries", perm: "suppliers:read" },
];

export interface AccountLink {
  href: string;
  label: string;
  perm?: Permission;
}

/** Admin pages, reached from the account menu (desktop) and the More sheet (phone). */
export const ACCOUNT_LINKS: AccountLink[] = [
  { href: "/app/audit", label: "Activity log", perm: "audit:read" },
  { href: "/app/settings?tab=members", label: "Members" },
  { href: "/app/settings", label: "Settings" },
];

/** Phone bottom bar: four tabs + More. Everything else is in the More sheet. */
export const MOBILE_PRIMARY = ["/app", "/app/suppliers", "/app/shipments", "/app/reviews"];

function matches(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isTabActive(pathname: string, tab: TabItem) {
  return matches(pathname, tab.href) || (tab.also ?? []).some((p) => matches(pathname, p));
}

/** Kept for older callers. */
export function isActive(pathname: string, href: string) {
  return matches(pathname, href);
}

/** Index of the tab that owns this path; admin pages sort after the last tab. */
export function tabIndexFor(pathname: string) {
  const i = TABS.findIndex((t) => isTabActive(pathname, t));
  return i === -1 ? TABS.length : i;
}

export function allowed<T extends { perm?: Permission }>(items: T[], perms: Set<string>) {
  return items.filter((i) => !i.perm || perms.has(i.perm));
}
