import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GROUND_CONTOURS, GROUND_VIEW } from "@/components/marketing/topo";
import { TopoMap } from "@/components/marketing/topo-map";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not on the map" };

/** 404: an unsurveyed parcel, dashed, with no stake in it. */
export default function NotFound() {
  return (
    <main id="main" className="paper-grain relative isolate flex min-h-dvh flex-col overflow-hidden bg-paper">
      <div className="graticule absolute inset-0 -z-10 opacity-60" aria-hidden />
      <TopoMap contours={GROUND_CONTOURS} view={GROUND_VIEW} className="absolute inset-0 -z-10 size-full text-ink" />
      <div className="px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Plotline, front sheet" className="inline-block rounded-sm">
          <Logo />
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
        <svg viewBox="0 0 160 120" className="w-40 text-ink" fill="none" aria-hidden>
          <path d="M28 34 104 18 140 62 118 104 40 98Z" stroke="var(--pending)" strokeWidth="1.6" strokeDasharray="6 5" fill="var(--sheet)" fillOpacity="0.7" />
          <text x="80" y="74" textAnchor="middle" className="font-serif" fontSize="34" fontStyle="italic" fill="var(--ink-subtle)">
            ?
          </text>
        </svg>
        <p className="mt-6 label-caps text-ink-subtle">
          <span className="text-marker-ink">404</span> · No survey record
        </p>
        <h1 className="mt-3 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[48px]">This plot isn’t on the map</h1>
        <p className="mt-3 max-w-[40ch] text-[17px] italic leading-relaxed text-ink-muted">
          The link may be out of date, or the page was moved to another sheet. Nothing has been lost.
        </p>
        <p className="mt-4 numerals text-[11px] uppercase text-ink-subtle">0.0000° N · 0.0000° E · Null Island</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/app" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Back to your atlas
          </Link>
          <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            Front sheet
          </Link>
        </div>
      </div>
    </main>
  );
}
