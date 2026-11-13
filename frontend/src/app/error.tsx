"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";

/** Something failed while drawing a sheet: the survey line breaks off, the record is untouched. */
export default function GlobalSegmentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="contours flex min-h-[70dvh] flex-col items-center justify-center px-4 py-16 text-center">
      <Logo />
      <svg viewBox="0 0 220 40" className="mt-10 w-56" fill="none" aria-hidden>
        <path d="M6 30 60 12 104 22" stroke="var(--marker)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M104 22 150 14 214 26" stroke="var(--pending)" strokeWidth="1.6" strokeDasharray="5 5" strokeLinecap="round" />
        <circle cx="6" cy="30" r="3.5" fill="var(--sheet)" stroke="var(--marker)" strokeWidth="2" />
        <circle cx="60" cy="12" r="3.5" fill="var(--sheet)" stroke="var(--marker)" strokeWidth="2" />
        <path d="M98 16l12 12M110 16 98 28" stroke="var(--noncompliant)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="mt-6 label-caps text-ink-subtle">
        <span className="text-marker-ink">Survey interrupted</span> · Your records are safe
      </p>
      <h1 className="mt-3 text-[30px] font-medium leading-tight tracking-[-0.02em] sm:text-[40px]">The line broke off mid-survey</h1>
      <p className="mt-3 max-w-[42ch] text-[17px] italic leading-relaxed text-ink-muted">
        This sheet could not be drawn. Nothing you saved was changed. Try again; if it keeps happening, reload the page.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" size="lg" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "lg" })}>
          Front sheet
        </Link>
      </div>
    </main>
  );
}
