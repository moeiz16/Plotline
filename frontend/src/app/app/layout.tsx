"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingBlock, Skeleton } from "@/components/ui/display";
import { useSession } from "@/lib/api/session";

function ShellSkeleton() {
  return (
    <div className="min-h-dvh" role="status" aria-label="Opening your atlas">
      <div className="flex h-[53px] items-center gap-6 border-b border-ink/70 px-5 lg:h-[81px]">
        <Logo animated />
        <div className="hidden gap-6 lg:flex">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-5 py-10">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-9 w-72" />
        <div className="mt-6 h-[3px] border-y border-ink/30" />
        <LoadingBlock rows={6} className="mt-6" />
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
        <ErrorState error={error} onRetry={() => refetch()} title="We couldn’t open your atlas" />
      </main>
    );
  if (!me.activeOrg)
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <Logo />
        <h1 className="mt-8 text-[28px] font-medium tracking-[-0.01em]">You’re not part of an organisation yet</h1>
        <p className="mt-2 max-w-sm text-[16px] text-ink-muted">Ask a colleague to invite you, or create a new organisation for your company.</p>
        <Button className="mt-6" variant="primary" onClick={() => router.push("/signup")}>
          Create an organisation
        </Button>
      </main>
    );
  return <AppShell me={me}>{children}</AppShell>;
}
