"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/display";
import { useSession } from "@/lib/api/session";

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" role="status" aria-label="Loading your workspace">
      <div className="hidden w-60 shrink-0 border-r border-border bg-surface p-4 lg:block">
        <Logo />
        <div className="mt-6 grid gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-7 w-56" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="mt-6 h-72" />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { me, status, error, refetch } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status === "loading" || status === "unauthenticated") return <ShellSkeleton />;
  if (status === "error" || !me)
    return (
      <main id="main" className="flex min-h-dvh items-center justify-center">
        <ErrorState error={error} onRetry={() => refetch()} title="We couldn’t open your workspace" />
      </main>
    );
  if (!me.activeOrg)
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Logo />
        <h1 className="mt-8 text-xl font-semibold">You’re not part of an organisation yet</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">Ask a colleague to invite you, or create a new organisation for your company.</p>
        <Button className="mt-6" variant="primary" onClick={() => router.push("/signup")}>
          Create an organisation
        </Button>
      </main>
    );
  return <AppShell me={me}>{children}</AppShell>;
}
