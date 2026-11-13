"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useSession } from "@/lib/api/session";

/** The synthetic demo workspace: Northbank Cocoa & Coffee Imports, Hamburg. */
export const DEMO = { email: "amelie.kraus@northbank.example", password: "Northbank-Demo-2026" };

/**
 * "Open the Northbank atlas": signs into the demo workspace and lands on the atlas.
 * Already signed in → straight to /app. If the demo sign-in fails, the sign-in card opens
 * so the visitor still has a way in.
 */
export function DemoEntry({
  children = "Open the Northbank atlas",
  variant = "primary",
  size = "lg",
  className,
}: {
  children?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { login, status } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function open() {
    setPending(true);
    try {
      if (status !== "authenticated") await login(DEMO);
      router.push("/app");
    } catch {
      router.push("/signin?demo=1");
    }
  }

  return (
    <Button variant={variant} size={size} loading={pending} onClick={open} className={className}>
      {children}
      {pending ? null : <ArrowRight aria-hidden />}
    </Button>
  );
}
