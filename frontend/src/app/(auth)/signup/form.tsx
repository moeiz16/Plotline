"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FieldCard } from "@/components/marketing/field-card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { ApiError, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/api/session";

export function SignUpForm() {
  const { signup } = useSession();
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", orgName: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.fullName.trim()) errs.fullName = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Enter a valid email address.";
    if (!form.orgName.trim()) errs.orgName = "Enter your company name.";
    if (form.password.length < 10) errs.password = "Use at least 10 characters.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    try {
      await signup({ fullName: form.fullName.trim(), email: form.email.trim(), orgName: form.orgName.trim(), password: form.password });
      router.replace("/app");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setErrors({ form: errorMessage(err) });
      setPending(false);
    }
  }

  return (
    <FieldCard
      number="02"
      kind="New atlas"
      title="Start your atlas"
      description="Set up your company’s sheet. You can invite colleagues and send suppliers their upload links next."
      footer={
        <p className="text-center text-[15px] text-ink-muted">
          Already have an atlas?{" "}
          <Link href="/signin" className="italic text-marker-ink underline decoration-marker/50 underline-offset-4 hover:decoration-marker">
            Sign in →
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        {errors.form ? (
          <Callout tone="noncompliant" className="py-2.5">
            <span role="alert">{errors.form}</span>
          </Callout>
        ) : null}
        <Field label="Your name" htmlFor="fullName" error={errors.fullName}>
          <Input id="fullName" autoComplete="name" value={form.fullName} onChange={set("fullName")} aria-invalid={!!errors.fullName} />
        </Field>
        <Field label="Work email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Company name" htmlFor="orgName" error={errors.orgName} hint="The importer or trader placing products on the EU market.">
          <Input id="orgName" autoComplete="organization" value={form.orgName} onChange={set("orgName")} aria-invalid={!!errors.orgName} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 10 characters.">
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={set("password")} aria-invalid={!!errors.password} />
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1 w-full">
          Start your atlas <ArrowRight />
        </Button>
        <p className="text-center text-[13.5px] italic text-ink-subtle">Farmer and plot data is kept to the minimum the regulation requires.</p>
      </form>
    </FieldCard>
  );
}
