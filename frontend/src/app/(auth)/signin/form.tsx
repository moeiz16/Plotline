"use client";

import { ArrowRight, Sparkle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/api/session";

export const DEMO = { email: "amelie.kraus@northbank.example", password: "Northbank-Demo-2026" };

function safeNext(next: string | null) {
  return next && next.startsWith("/app") ? next : "/app";
}

export function SignInForm() {
  const { login, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();

  // Already signed in: go straight to the workspace.
  useEffect(() => {
    if (status === "authenticated") router.replace(safeNext(params.get("next")));
  }, [status, router, params]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e?: FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    const body = creds ?? { email: email.trim(), password };
    if (!body.email || !body.password) {
      setError("Enter your email and password.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await login(body);
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That email and password don’t match an account." : errorMessage(err));
      setPending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Sign in to Plotline</h1>
      <p className="mt-1.5 text-sm text-muted">Welcome back. Pick up where your team left off.</p>

      <form onSubmit={submit} className="mt-7 grid gap-4" noValidate>
        {error ? (
          <Callout tone="noncompliant" className="py-2.5">
            <span role="alert">{error}</span>
          </Callout>
        ) : null}
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1 w-full">
          Sign in <ArrowRight />
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-border" /> or explore first <span className="h-px flex-1 bg-border" />
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-medium">Try the demo workspace</p>
        <p className="mt-1 text-[13px] text-muted">
          Northbank Cocoa &amp; Coffee Imports, Hamburg: sample suppliers, plots and shipments. All data is synthetic.
        </p>
        <Button
          className="mt-3 w-full"
          disabled={pending}
          onClick={() => {
            setEmail(DEMO.email);
            setPassword(DEMO.password);
            void submit(undefined, DEMO);
          }}
        >
          <Sparkle /> Use the demo account
        </Button>
        <p className="mt-2 text-center text-xs text-subtle">Fills in {DEMO.email}</p>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        New to Plotline?{" "}
        <Link href="/signup" className="font-medium text-brand-fg underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
