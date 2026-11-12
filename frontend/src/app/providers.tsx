"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { ThemeProvider, useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { ApiError, NetworkError } from "@/lib/api/client";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      position="top-center"
      offset={92}
      mobileOffset={64}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-sm !border-rule-strong !bg-sheet !text-ink !font-serif !shadow-pop",
          title: "!font-mono !text-[12px] !tracking-[0.02em] !font-medium",
          description: "!text-ink-muted",
          actionButton: "!rounded-sm !bg-marker-fill !text-marker-contrast !font-mono",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => {
              if (err instanceof ApiError && err.status < 500) return false;
              if (err instanceof NetworkError) return count < 1;
              return count < 2;
            },
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
