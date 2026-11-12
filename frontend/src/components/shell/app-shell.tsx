"use client";

import type { ReactNode } from "react";
import { PageTransition } from "@/components/motion/page-transition";
import type { Me } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { Masthead } from "./masthead";
import { MobileTabBar } from "./mobile-tabs";

/**
 * The Field Atlas shell: a two-tier masthead on top (no sidebar), the sheet below,
 * a bottom tab bar on phones. Exposes two CSS variables for full-bleed pages:
 *   --masthead-h  height of the sticky masthead (53 px phone, 81 px desktop)
 *   --tabbar-h    height reserved for the phone tab bar (0 on desktop)
 * Full-viewport pages (Atlas) use: h-[calc(100dvh-var(--masthead-h)-var(--tabbar-h))].
 */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper [--masthead-h:53px] [--tabbar-h:calc(60px+env(safe-area-inset-bottom))] lg:[--masthead-h:81px] lg:[--tabbar-h:0px]">
      <Masthead me={me} />
      <main id="main" className="min-w-0 pb-[var(--tabbar-h)]">
        <PageTransition>{children}</PageTransition>
      </main>
      <MobileTabBar me={me} />
    </div>
  );
}

/**
 * Standard sheet width for ledger pages. `wide` for map-heavy pages, `bleed` for
 * full-viewport canvases (no padding, no max width).
 */
export function PageContainer({ children, className, wide, bleed }: { children: ReactNode; className?: string; wide?: boolean; bleed?: boolean }) {
  if (bleed) return <div className={cn("w-full", className)}>{children}</div>;
  return (
    <div className={cn("mx-auto w-full px-4 py-7 sm:px-6 sm:py-10 lg:px-8", wide ? "max-w-[1440px]" : "max-w-[1200px]", className)}>{children}</div>
  );
}
