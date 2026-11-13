import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { DemoEntry } from "./demo-entry";
import { GROUND_CONTOURS, GROUND_VIEW } from "./topo";
import { TopoMap } from "./topo-map";

/** [9] The closing sheet: one call to open the demo atlas, one to start your own. */
export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="relative isolate overflow-hidden bg-ink text-paper dark:border-t dark:border-ink/70 dark:bg-sheet dark:text-ink">
      <TopoMap contours={GROUND_CONTOURS} view={GROUND_VIEW} className="absolute inset-0 -z-10 size-full opacity-70" />
      <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8 sm:py-36">
        <p className="flex items-center gap-2 label-caps opacity-75">
          <span className="inline-block size-2 rotate-45 bg-marker" aria-hidden /> Sheet 06 · Yours
        </p>
        <h2 id="closing-title" className="mt-5 max-w-[16ch] text-[44px] font-medium leading-[1] tracking-[-0.035em] sm:text-[84px]">
          Every shipment starts as a line on a map.
        </h2>
        <p className="mt-6 max-w-[48ch] text-[18px] italic leading-relaxed opacity-80">
          Walk the sample atlas of Northbank Cocoa &amp; Coffee Imports, Hamburg: 26 plots, nine suppliers, real decisions. Every name and figure in it is synthetic.
        </p>
        <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
          <DemoEntry />
          <Link
            href="/signup"
            className="font-serif text-[18px] italic underline decoration-marker underline-offset-[6px] hover:decoration-2"
          >
            Start your atlas →
          </Link>
        </div>
      </div>
    </section>
  );
}

/** The colophon: a map sheet's title block. */
export function Colophon() {
  return (
    <footer className="border-t border-ink/70 bg-paper">
      <div className="mx-auto grid max-w-[1200px] gap-px bg-rule px-0 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="bg-paper px-4 py-6 sm:px-8">
          <Logo />
          <p className="mt-3 max-w-[40ch] text-[14px] italic leading-relaxed text-ink-muted">
            Aligned with EUDR (Regulation (EU) 2023/1115). Designed to support your due diligence. Not a certification scheme.
          </p>
        </div>
        <dl className="grid content-start gap-2 bg-paper px-4 py-6 sm:px-8">
          <dt className="label-caps text-ink-subtle">Sheet</dt>
          <dd className="numerals text-[13px]">Front sheet · 1 of 1</dd>
          <dt className="mt-2 label-caps text-ink-subtle">Datum</dt>
          <dd className="numerals text-[13px]">WGS 84 · EPSG:4326</dd>
        </dl>
        <dl className="grid content-start gap-2 bg-paper px-4 py-6 sm:px-8">
          <dt className="label-caps text-ink-subtle">Cut-off</dt>
          <dd className="numerals text-[13px]">31 Dec 2020</dd>
          <dt className="mt-2 label-caps text-ink-subtle">Sample data</dt>
          <dd className="numerals text-[13px]">Synthetic</dd>
        </dl>
        <nav aria-label="Footer" className="grid content-start gap-2 bg-paper px-4 py-6 sm:px-8">
          <span className="label-caps text-ink-subtle">Go to</span>
          <Link href="/signin" className="w-fit label-caps text-ink hover:text-marker-ink">
            Sign in
          </Link>
          <Link href="/signup" className="w-fit label-caps text-ink hover:text-marker-ink">
            Start your atlas
          </Link>
          <a href="#procedure" className="w-fit label-caps text-ink hover:text-marker-ink">
            Field procedure
          </a>
        </nav>
      </div>
      <p className="border-t border-rule px-4 py-4 text-center numerals text-[11px] text-ink-subtle">© 2026 Plotline · a portfolio project</p>
    </footer>
  );
}
