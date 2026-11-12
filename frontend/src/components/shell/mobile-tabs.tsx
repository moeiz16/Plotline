"use client";

import { LogOut } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { SPRING_SNAP } from "@/components/motion/tokens";
import { Sheet, SheetContent } from "@/components/ui/overlays";
import { useReviews } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Me } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { THEMES } from "./masthead";
import { ACCOUNT_LINKS, MOBILE_PRIMARY, TABS, allowed, isActive, isTabActive } from "./nav";

/* Small line glyphs drawn for the tab bar (ink strokes, no icon set). */
const ICONS: Record<string, ReactNode> = {
  "/app": (
    <path d="M3 6.5 8 4.5l4.5 2 4.5-2v10l-4.5 2L8 14.5l-5 2Zm5-2v10m4.5-8v10" />
  ),
  "/app/suppliers": (
    <>
      <path d="M4 16.5V8l6-4 6 4v8.5Z" />
      <path d="M8 16.5v-4.5h4v4.5" />
    </>
  ),
  "/app/shipments": (
    <>
      <path d="M3 12.5h14l-2 4H5Z" />
      <path d="M6 12.5V7h6v5.5M12 9h3v3.5" />
    </>
  ),
  "/app/reviews": (
    <>
      <path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z" />
      <circle cx="10" cy="10" r="2.2" />
    </>
  ),
  more: (
    <>
      <path d="M4 6h12M4 10h12M4 14h8" />
    </>
  ),
};

function TabIcon({ k }: { k: string }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      {ICONS[k] ?? ICONS.more}
    </svg>
  );
}

/**
 * Phone bottom tab bar (below 1024 px): ATLAS · SUPPLIERS · SHIPMENTS · REVIEWS · MORE.
 * 60 px plus the safe-area inset. Pages get `pb-[var(--tabbar-h)]` from the shell.
 */
export function MobileTabBar({ me }: { me: Me }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [more, setMore] = useState(false);
  const perms = new Set(me.membership?.permissions ?? []);
  const reviews = useReviews(perms.has("plots:read"));
  const reviewCount = reviews.data?.length ?? 0;
  const tabs = allowed(TABS, perms);
  const primary = tabs.filter((t) => MOBILE_PRIMARY.includes(t.href));
  const rest = tabs.filter((t) => !MOBILE_PRIMARY.includes(t.href));
  const moreActive = rest.some((t) => isTabActive(pathname, t)) || ACCOUNT_LINKS.some((l) => isActive(pathname, l.href.split("?")[0]));

  const cell = (active: boolean) =>
    cn(
      "relative flex h-full flex-1 flex-col items-center justify-center gap-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active ? "text-ink" : "text-ink-muted",
    );
  const bar = (
    <motion.span
      layoutId="mobile-tab"
      transition={reduce ? { duration: 0 } : SPRING_SNAP}
      className="absolute inset-x-3 top-0 h-[3px] bg-marker"
      aria-hidden
    />
  );

  return (
    <>
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/70 bg-paper/95 pb-[env(safe-area-inset-bottom)] supports-[backdrop-filter]:bg-paper/85 supports-[backdrop-filter]:backdrop-blur-md lg:hidden"
      >
        <ul className="flex h-[60px] items-stretch">
          {primary.map((t) => {
            const active = isTabActive(pathname, t);
            return (
              <li key={t.href} className="flex flex-1">
                <Link href={t.href} aria-current={active ? "page" : undefined} className={cell(active)}>
                  {active ? bar : null}
                  <span className="relative">
                    <TabIcon k={t.href} />
                    {t.badge === "reviews" && reviewCount > 0 ? (
                      <span className="numerals absolute -right-3 -top-1 bg-review px-1 text-[9px] leading-[14px] text-paper dark:text-[#140a04]" aria-label={`${reviewCount} waiting`}>
                        {reviewCount}
                      </span>
                    ) : null}
                  </span>
                  {t.short ?? t.label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMore(true)} className={cell(moreActive)} aria-haspopup="dialog" aria-expanded={more}>
              {moreActive ? bar : null}
              <TabIcon k="more" />
              More
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet me={me} open={more} onOpenChange={setMore} sections={rest} />
    </>
  );
}

function MoreSheet({ me, open, onOpenChange, sections }: { me: Me; open: boolean; onOpenChange: (v: boolean) => void; sections: typeof TABS }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useSession();
  const { theme, setTheme } = useTheme();
  const perms = new Set(me.membership?.permissions ?? []);
  const close = () => onOpenChange(false);
  const row = "flex h-12 items-center justify-between border-b border-rule px-4 text-[17px] outline-none focus-visible:bg-sheet-2";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" title={me.activeOrg?.name ?? "Plotline"} description={`${me.user.fullName} · ${me.membership?.roleLabel ?? ""}`}>
        <p className="label-caps px-4 pb-1 pt-4 text-ink-subtle">Sections</p>
        <ul>
          {sections.map((t) => (
            <li key={t.href}>
              <Link href={t.href} onClick={close} className={row} aria-current={isTabActive(pathname, t) ? "page" : undefined}>
                {t.label}
                {isTabActive(pathname, t) ? <span className="size-2 bg-marker" aria-hidden /> : null}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/app/plots" onClick={close} className={row}>
              Plot ledger
            </Link>
          </li>
        </ul>
        <p className="label-caps px-4 pb-1 pt-5 text-ink-subtle">Organisation</p>
        <ul>
          {allowed(ACCOUNT_LINKS, perms).map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={close} className={row}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="label-caps px-4 pb-2 pt-5 text-ink-subtle">Sheet</p>
        <div className="flex gap-2 px-4" role="radiogroup" aria-label="Theme">
          {THEMES.map(([v, l]) => (
            <button
              key={v}
              role="radio"
              aria-checked={theme === v}
              onClick={() => setTheme(v)}
              className={cn(
                "h-9 flex-1 border px-2 font-mono text-[10px] uppercase tracking-[0.08em]",
                theme === v ? "border-ink bg-ink text-paper" : "border-rule-strong text-ink-muted",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="px-4 pb-6 pt-5">
          <button
            onClick={async () => {
              close();
              await logout();
              router.replace("/signin");
            }}
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
