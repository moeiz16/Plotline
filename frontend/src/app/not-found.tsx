import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">We couldn’t find that page</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">The link may be out of date, or the page has moved.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3.5 text-sm font-medium hover:bg-surface-2">
          Home
        </Link>
        <Link href="/app" className="inline-flex h-9 items-center rounded-md bg-brand px-3.5 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
          Go to your workspace
        </Link>
      </div>
    </main>
  );
}
