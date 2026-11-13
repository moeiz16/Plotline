"use client";

import { Trash, UserPlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { lineNo, stampDate } from "@/components/ledger/format";
import { FormBox, FormGrid, LandingStamp } from "@/components/ledger/paper";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Badge,
  CopyField,
  DefinitionList,
  ErrorState,
  Glyph,
  Ledger,
  LedgerHead,
  LedgerRow,
  LoadingBlock,
  PageHeader,
  Paper,
  SectionTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { ApiError } from "@/lib/api/client";
import {
  useCountries,
  useCreateInvitation,
  useInvitations,
  useMembers,
  useOrg,
  useRemoveMember,
  useRevokeInvitation,
  useUpdateMember,
  useUpdateOrg,
} from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Member, Org, Role } from "@/lib/api/types";
import { ROLE_LABEL, countryName, dateLong, plural } from "@/lib/format";
import { absoluteUrl, cn } from "@/lib/utils";

const ROLES: Role[] = ["owner", "compliance_manager", "sourcing", "reviewer", "auditor", "supplier"];
const ROLE_HELP: Record<Role, string> = {
  owner: "Full access, including members and organisation settings.",
  compliance_manager: "Runs due diligence: plots, shipments, statements and campaigns.",
  sourcing: "Manages suppliers, data requests and shipments.",
  reviewer: "Decides on plots that need a closer look.",
  auditor: "Read-only access, including the activity log.",
  supplier: "A supplier’s own staff: sees only their own plots.",
};
const TABS = ["organisation", "members", "records"] as const;
type Tab = (typeof TABS)[number];

/* ── Organisation: a field-book form with a live proof of the statement head ─ */
function OrgForm({ org, editable }: { org: Org; editable: boolean }) {
  const update = useUpdateOrg();
  const countries = useCountries();
  const init = () => ({
    name: org.name,
    eori: org.eori ?? "",
    address: org.address ?? "",
    country: org.country ?? "",
    operatorSize: org.operatorSize,
    reviewAllHighRisk: org.settings.reviewAllHighRisk,
    autoAssess: org.settings.autoAssess,
  });
  const [f, setF] = useState(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(init()), [org]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErrors({ name: "Enter your organisation’s name." });
    const eori = f.eori.replace(/\s+/g, "").toUpperCase();
    if (eori && !/^[A-Z]{2}[A-Z0-9]{1,15}$/.test(eori))
      return setErrors({ eori: "An EORI number starts with a two-letter country code followed by up to 15 letters or digits, for example DE4471902385516." });
    setErrors({});
    try {
      await update.mutateAsync({
        name: f.name.trim(),
        eori: eori || null,
        address: f.address.trim() || null,
        country: f.country || null,
        operatorSize: f.operatorSize,
        settings: { ...org.settings, reviewAllHighRisk: f.reviewAllHighRisk, autoAssess: f.autoAssess },
      });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    }
  }

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <form onSubmit={submit} className="grid gap-5">
        <fieldset disabled={!editable} className="grid gap-5">
          <Field label="1 · Legal name" htmlFor="o-name" error={errors.name}>
            <Input id="o-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="2 · EORI number" htmlFor="o-eori" hint="Your EU customs identification number." error={errors.eori}>
              <Input id="o-eori" value={f.eori} onChange={(e) => setF({ ...f, eori: e.target.value })} className="font-mono" />
            </Field>
            <Field label="3 · Country" htmlFor="o-country">
              <Select id="o-country" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
                <option value="">Choose a country</option>
                {f.country && !(countries.data ?? []).some((c) => c.code === f.country) ? <option value={f.country}>{f.country}</option> : null}
                {(countries.data ?? []).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="4 · Registered address" htmlFor="o-address">
            <Textarea id="o-address" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <Field label="5 · Operator size" htmlFor="o-size" hint={f.operatorSize === "sme" ? "Obligations apply from 30 June 2027." : "Obligations apply from 30 December 2026."}>
            <Select id="o-size" value={f.operatorSize} onChange={(e) => setF({ ...f, operatorSize: e.target.value as Org["operatorSize"] })}>
              <option value="large">Medium or large operator</option>
              <option value="sme">Micro or small enterprise</option>
            </Select>
          </Field>
          <div className="grid gap-3 border-y border-rule py-4">
            <p className="label-caps text-ink-muted">6 · Standing instructions</p>
            <Checkbox
              checked={f.reviewAllHighRisk}
              onChange={(v) => setF({ ...f, reviewAllHighRisk: v })}
              label="Send every plot from a high-risk country to a reviewer"
              description="Even when the forest maps show no clearing."
            />
            <Checkbox checked={f.autoAssess} onChange={(v) => setF({ ...f, autoAssess: v })} label="Check new plots automatically" description="Run the forest check as soon as a supplier adds a plot." />
          </div>
        </fieldset>
        {editable ? (
          <div>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save the particulars
            </Button>
          </div>
        ) : (
          <p className="text-[14.5px] italic text-ink-muted">Only owners can change these particulars.</p>
        )}
      </form>

      <div className="lg:sticky lg:top-[calc(var(--masthead-h)+1.5rem)]">
        <SectionTitle>As printed on your statements</SectionTitle>
        <Paper className="px-5 pb-5 pt-4">
          <p className="label-caps text-ink">Due diligence statement · 1 Operator</p>
          <div className="mb-3 mt-2 h-[3px] border-y border-ink/60" aria-hidden />
          <FormGrid className="grid-cols-2">
            <FormBox label="Name" className="col-span-2">
              {f.name || "–"}
            </FormBox>
            <FormBox label="Address" className="col-span-2">
              {f.address || "–"}
              {f.country ? `, ${countryName(f.country)}` : ""}
            </FormBox>
            <FormBox label="EORI number" mono>
              {f.eori.replace(/\s+/g, "").toUpperCase() || "–"}
            </FormBox>
            <FormBox label="Operator size">{f.operatorSize === "sme" ? "Micro or small" : "Medium or large"}</FormBox>
          </FormGrid>
          <p className="mt-3 text-[13.5px] italic text-ink-muted">The proof updates as you type. Statements already filed keep the particulars they were filed with.</p>
        </Paper>
      </div>
    </div>
  );
}

/* ── Members ───────────────────────────────────────────────────────────────── */
const MCOLS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_13rem_7rem_2.5rem]";

function MembersLedger({ editable, myUserId }: { editable: boolean; myUserId: string }) {
  const q = useMembers();
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const [removing, setRemoving] = useState<Member | null>(null);
  if (q.isPending) return <LoadingBlock rows={5} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <LedgerHead className={cn("hidden pl-11 pr-1 md:grid gap-x-4", MCOLS)}>
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span>Joined</span>
        <span />
      </LedgerHead>
      <Ledger label="Members" className="border-t-0">
        {q.data.map((m, i) => (
          <LedgerRow key={m.id} index={i} number={lineNo(i)} className={cn(MCOLS, "gap-x-4 gap-y-1.5")}>
            <p className="min-w-0 truncate text-[16px]">
              {m.fullName} {m.userId === myUserId ? <span className="text-[13px] italic text-ink-muted">(you)</span> : null}
            </p>
            <span className="md:hidden">
              <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.roleLabel || ROLE_LABEL[m.role]}</Badge>
            </span>
            <span className="numerals col-span-2 min-w-0 truncate text-[12.5px] text-ink-muted md:col-span-1">{m.email}</span>
            <div className="col-span-2 md:col-span-1">
              {editable && m.userId !== myUserId ? (
                <Select aria-label={`Role for ${m.fullName}`} value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value as Role })} className="h-8 text-[14px]">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="hidden md:inline-flex">
                  <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.roleLabel || ROLE_LABEL[m.role]}</Badge>
                </span>
              )}
            </div>
            <span className="numerals text-[11.5px] text-ink-muted">{m.joinedAt ? stampDate(m.joinedAt) : m.status.toUpperCase()}</span>
            <span className="text-right">
              {editable && m.userId !== myUserId ? (
                <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.fullName}`} onClick={() => setRemoving(m)}>
                  <Trash />
                </Button>
              ) : null}
            </span>
          </LedgerRow>
        ))}
      </Ledger>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title={`Remove ${removing?.fullName ?? "member"}?`}
        description="They lose access to this organisation straight away. Their past actions stay in the activity log."
        confirmLabel="Remove member"
        loading={remove.isPending}
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id).catch(() => null);
          setRemoving(null);
        }}
      />
    </>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateInvitation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("reviewer");
  const [issued, setIssued] = useState<{ url: string; email: string; role: Role } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    setError(null);
    try {
      const res = await create.mutateAsync({ email: email.trim(), role });
      setIssued({ url: absoluteUrl(res.inviteUrl), email: email.trim(), role });
      setEmail("");
    } catch {
      /* toast shown by the hook */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setIssued(null);
          setError(null);
        }
      }}
    >
      <DialogContent title="Invite a member" description="Invitations are valid for 7 days. Share the link yourself; the demo sends no email.">
        {issued ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[15.5px]">
                Invitation for <span className="numerals text-[13px]">{issued.email}</span> as {ROLE_LABEL[issued.role].toLowerCase()}.
              </p>
              <LandingStamp tone="compliant" angle={-5}>
                Issued
              </LandingStamp>
            </div>
            <CopyField value={issued.url} label="Copy invitation link" />
            <p className="text-[14px] italic text-ink-muted">The link is shown once. Copy it and send it to your colleague.</p>
            <DialogFooter>
              <Button onClick={() => setIssued(null)}>Invite another</Button>
              <DialogClose asChild>
                <Button variant="primary">Done</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Email" htmlFor="inv-email" error={error}>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role" htmlFor="inv-role" hint={ROLE_HELP[role]}>
              <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="primary" loading={create.isPending}>
                Create invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PendingInvitations() {
  const q = useInvitations();
  const revoke = useRevokeInvitation();
  const pending = (q.data ?? []).filter((i) => !i.acceptedAt);
  return (
    <section className="mt-10" aria-label="Pending invitations">
      <SectionTitle action={<span className="numerals text-[11px] text-ink-muted">{plural(pending.length, "invitation")}</span>}>Pending invitations</SectionTitle>
      {q.isPending ? (
        <LoadingBlock rows={2} />
      ) : !pending.length ? (
        <p className="text-[15px] italic text-ink-muted">None waiting.</p>
      ) : (
        <Ledger label="Pending invitations">
          {pending.map((i, n) => (
            <LedgerRow key={i.id} index={n} number={lineNo(n)} className="grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1.3fr)_13rem_minmax(0,1fr)_auto]">
              <span className="numerals min-w-0 truncate text-[13px]">{i.email}</span>
              <span className="md:order-none">
                <Badge tone="pending">{ROLE_LABEL[i.role]}</Badge>
              </span>
              <span className="text-[14px] italic text-ink-muted">expires {dateLong(i.expiresAt)}</span>
              <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending}>
                Withdraw
              </Button>
            </LedgerRow>
          ))}
        </Ledger>
      )}
    </section>
  );
}

function Records({ years }: { years: number }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <SectionTitle>Retention</SectionTitle>
        <DefinitionList
          items={[
            { label: "Statements & evidence packs", value: `${years} years` },
            { label: "Plot checks", value: `${years} years` },
            { label: "Activity log", value: `${years} years` },
            { label: "Counted from", value: "the filing date" },
          ]}
        />
      </div>
      <div className="grid gap-3 text-[15.5px] leading-relaxed">
        <SectionTitle>Field notes</SectionTitle>
        <p>Records are kept for {years} years from the date each statement is filed, as Article 12 of the regulation requires.</p>
        <p className="text-ink-muted">Removing a plot or supplier archives it rather than deleting it, so filed statements always keep their evidence.</p>
        <p className="text-ink-muted">Farmer data is kept to the minimum: plots are identified by a reference and a producer name is optional. Data is handled in line with GDPR.</p>
      </div>
    </div>
  );
}

function Settings() {
  const { me, can } = useSession();
  const org = useOrg();
  const admin = can("org:admin");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : asked === "retention" ? "records" : "organisation";
  const [inviting, setInviting] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Account · Settings"
        title={me?.activeOrg?.name ?? "Settings"}
        description="The particulars that go on every statement, the people who work in this atlas, and how long records are kept."
        actions={
          tab === "members" && admin ? (
            <Button variant="primary" onClick={() => setInviting(true)}>
              <UserPlus /> Invite member
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
        <TabsList className="mb-8">
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>
        <TabsContent value="organisation" className="outline-none">
          {org.isPending ? <LoadingBlock rows={6} /> : org.isError ? <ErrorState error={org.error} onRetry={() => org.refetch()} /> : <OrgForm org={org.data} editable={admin} />}
        </TabsContent>
        <TabsContent value="members" className="outline-none">
          <MembersLedger editable={admin} myUserId={me?.user.id ?? ""} />
          {admin ? <PendingInvitations /> : <p className="mt-6 flex items-center gap-2 text-[14.5px] italic text-ink-muted"><Glyph tone="neutral" /> Only owners can invite or remove members.</p>}
        </TabsContent>
        <TabsContent value="records" className="outline-none">
          <Records years={org.data?.settings.retentionYears ?? 5} />
        </TabsContent>
      </Tabs>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </PageContainer>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={6} className="mx-auto max-w-[1200px] px-8 py-10" />}>
      <Settings />
    </Suspense>
  );
}
