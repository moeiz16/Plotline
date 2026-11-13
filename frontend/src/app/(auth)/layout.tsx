import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { GROUND_CONTOURS, GROUND_VIEW } from "@/components/marketing/topo";
import { TopoMap } from "@/components/marketing/topo-map";

/** Sign-in, new atlas and invitations: a field card laid on a contour sheet. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="paper-grain relative isolate flex min-h-dvh flex-col overflow-hidden bg-paper">
      <div className="graticule absolute inset-0 -z-10 opacity-60" aria-hidden />
      <TopoMap contours={GROUND_CONTOURS} view={GROUND_VIEW} drawIndex className="absolute inset-0 -z-10 size-full text-ink" />

      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Plotline, front sheet" className="rounded-sm">
          <Logo />
        </Link>
        <p className="hidden text-right numerals text-[10.5px] uppercase leading-relaxed text-ink-subtle sm:block">
          Northbank sheet · Hamburg
          <br />
          53.5511° N · 9.9937° E
        </p>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        {children}
      </main>

      <footer className="flex flex-col items-center justify-between gap-1 border-t border-rule px-4 py-3 text-center label-caps text-ink-subtle sm:flex-row sm:px-8 sm:text-left">
        <span>Aligned with EUDR (Regulation (EU) 2023/1115)</span>
        <span>Sample data is synthetic</span>
      </footer>
    </div>
  );
}
