"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function GlobalSegmentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">Your data is safe. Please try again; if it keeps happening, reload the page.</p>
      <Button className="mt-6" variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
