"use client";

import { ArrowRight, MailCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout, ErrorState, LoadingBlock } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useAcceptInvite, useInvitePreview } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import { dateLong } from "@/lib/format";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const { me } = useSession();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (preview.isPending) return <LoadingBlock rows={4} />;
  if (preview.isError) {
    const gone = preview.error instanceof ApiError && [404, 410].includes(preview.error.status);
    return gone ? (
      <div>
        <h1 className="text-2xl font-semibold">This invitation can’t be used</h1>
        <p className="mt-2 text-sm text-muted">It may have expired, been withdrawn or already been accepted. Ask the person who invited you for a new link.</p>
        <Button asChild className="mt-6">
          <Link href="/signin">Go to sign in</Link>
        </Button>
      </div>
    ) : (
      <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
    );
  }
  const inv = preview.data;
  const signedInAsInvitee = me && me.user.email.toLowerCase() === inv.email.toLowerCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signedInAsInvitee) {
      if (!fullName.trim()) return setError("Enter your name.");
      if (password.length < 10) return setError("Choose a password of at least 10 characters.");
    }
    try {
      await accept.mutateAsync(signedInAsInvitee ? {} : { fullName: fullName.trim(), password });
      router.replace("/app");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-5 flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-fg">
        <MailCheck className="size-5" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Join {inv.orgName}</h1>
      <p className="mt-1.5 text-sm text-muted">
        You’ve been invited as <span className="font-medium text-fg">{inv.roleLabel}</span>. This invitation is for {inv.email} and expires on{" "}
        {dateLong(inv.expiresAt)}.
      </p>
      <form onSubmit={submit} className="mt-7 grid gap-4" noValidate>
        {error ? (
          <Callout tone="noncompliant" className="py-2.5">
            <span role="alert">{error}</span>
          </Callout>
        ) : null}
        {signedInAsInvitee ? (
          <p className="text-sm text-muted">You’re signed in as {me.user.email}.</p>
        ) : (
          <>
            <Field label="Email" htmlFor="email">
              <Input id="email" value={inv.email} readOnly disabled />
            </Field>
            <Field label="Your name" htmlFor="fullName">
              <Input id="fullName" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Choose a password" htmlFor="password" hint="At least 10 characters.">
              <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        )}
        <Button type="submit" variant="primary" size="lg" loading={accept.isPending} className="mt-1 w-full">
          Accept invitation <ArrowRight />
        </Button>
      </form>
    </div>
  );
}
