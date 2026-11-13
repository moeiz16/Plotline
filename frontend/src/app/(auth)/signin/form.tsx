"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CardDivider, FieldCard } from "@/components/marketing/field-card";
import { DEMO } from "@/components/marketing/demo-entry";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/api/session";

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
  const [error, setError] = useState<string | null>(params.get("demo") ? "The Northbank atlas did not open. Please try again." : null);
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
    <FieldCard
      number="01"
      kind="Sign in"
      title="Sign in to your atlas"
      description="Pick up the survey where your team left it."
      footer={
        <p className="text-center text-[15px] text-ink-muted">
          New to Plotline?{" "}
          <Link href="/signup" className="italic text-marker-ink underline decoration-marker/50 underline-offset-4 hover:decoration-marker">
            Start your atlas →
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
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

      <CardDivider>or walk the sample atlas</CardDivider>

      <div className="border border-dashed border-rule-strong p-4">
        <p className="label-caps text-ink">Northbank Cocoa &amp; Coffee Imports · Hamburg</p>
        <p className="mt-1.5 text-[14px] italic leading-relaxed text-ink-muted">Sample suppliers, plots and shipments. Every name and figure is synthetic.</p>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={pending}
          onClick={() => {
            setEmail(DEMO.email);
            setPassword(DEMO.password);
            void submit(undefined, DEMO);
          }}
        >
          Open the Northbank atlas
        </Button>
        <p className="mt-2 text-center numerals text-[11px] text-ink-subtle">Fills in {DEMO.email}</p>
      </div>
    </FieldCard>
  );
}
