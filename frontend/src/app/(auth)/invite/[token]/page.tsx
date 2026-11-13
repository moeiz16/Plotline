"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FieldCard } from "@/components/marketing/field-card";
import { Button } from "@/components/ui/button";
import { Badge, Callout, ErrorState, Glyph, LoadingBlock } from "@/components/ui/display";
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

  if (preview.isPending)
    return (
      <FieldCard number="03" kind="Invitation" title="Reading your invitation…">
        <LoadingBlock rows={4} />
      </FieldCard>
    );
  if (preview.isError) {
    const gone = preview.error instanceof ApiError && [404, 410].includes(preview.error.status);
    return gone ? (
      <FieldCard
        number="03"
        kind="Invitation"
        tag={<Glyph tone="pending" size={12} label="Not valid" />}
        title="This invitation can’t be used"
        description="It may have expired, been withdrawn or already been accepted. Ask the person who invited you for a new link."
      >
        <Button asChild variant="secondary" className="w-full">
          <Link href="/signin">Sign in to your atlas</Link>
        </Button>
      </FieldCard>
    ) : (
      <FieldCard number="03" kind="Invitation" title="The invitation didn’t load">
        <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
      </FieldCard>
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
    <FieldCard
      number="03"
      kind="Invitation"
      tag={<Badge tone="brand">{inv.roleLabel}</Badge>}
      title={`Join ${inv.orgName}`}
      description={
        <>
          You’ve been invited as <span className="not-italic text-ink">{inv.roleLabel}</span>. This invitation is for {inv.email} and expires on{" "}
          {dateLong(inv.expiresAt)}.
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {error ? (
          <Callout tone="noncompliant" className="py-2.5">
            <span role="alert">{error}</span>
          </Callout>
        ) : null}
        {signedInAsInvitee ? (
          <p className="text-[15px] text-ink-muted">You’re signed in as {me.user.email}.</p>
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
    </FieldCard>
  );
}
