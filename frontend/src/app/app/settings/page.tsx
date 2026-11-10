"use client";

import { Archive, Building, MailPlus, Trash, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PageContainer } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Callout,
  Card,
  CardBody,
  CardHeader,
  CopyField,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Td,
  Th,
} from "@/components/ui/display";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/overlays";
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
import { ROLE_LABEL, date, dateLong } from "@/lib/format";
import { absoluteUrl } from "@/lib/utils";

const ROLES: Role[] = ["owner", "compliance_manager", "sourcing", "reviewer", "auditor", "supplier"];
const ROLE_HELP: Record<Role, string> = {
  owner: "Full access, including members and organisation settings.",
  compliance_manager: "Runs due diligence: plots, shipments, statements and campaigns.",
  sourcing: "Manages suppliers, data requests and shipments.",
  reviewer: "Decides on plots that need a closer look.",
  auditor: "Read-only access, including the activity log.",
  supplier: "A supplier’s own staff: sees only their own plots.",
};

function OrgForm({ org, editable }: { org: Org; editable: boolean }) {
  const update = useUpdateOrg();
  const countries = useCountries();
  const [f, setF] = useState({
    name: org.name,
    eori: org.eori ?? "",
    address: org.address ?? "",
    country: org.country ?? "",
    operatorSize: org.operatorSize,
    reviewAllHighRisk: org.settings.reviewAllHighRisk,
    autoAssess: org.settings.autoAssess,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setF({
      name: org.name,
      eori: org.eori ?? "",
      address: org.address ?? "",
      country: org.country ?? "",
      operatorSize: org.operatorSize,
      reviewAllHighRisk: org.settings.reviewAllHighRisk,
      autoAssess: org.settings.autoAssess,
    });
  }, [org]);

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
    <Card>
      <CardHeader title="Organisation" description="These details appear on your due diligence statements." icon={<Building />} />
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 lg:max-w-2xl">
          <fieldset disabled={!editable} className="grid gap-4">
            <Field label="Legal name" htmlFor="o-name" error={errors.name}>
              <Input id="o-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="EORI number" htmlFor="o-eori" hint="Your EU customs identification number." error={errors.eori}>
                <Input id="o-eori" value={f.eori} onChange={(e) => setF({ ...f, eori: e.target.value })} className="font-mono" />
              </Field>
              <Field label="Country" htmlFor="o-country">
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
            <Field label="Registered address" htmlFor="o-address">
              <Textarea id="o-address" rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
            <Field
              label="Operator size"
              htmlFor="o-size"
              hint={f.operatorSize === "sme" ? "Obligations apply from 30 June 2027." : "Obligations apply from 30 December 2026."}
            >
              <Select id="o-size" value={f.operatorSize} onChange={(e) => setF({ ...f, operatorSize: e.target.value as Org["operatorSize"] })}>
                <option value="large">Medium or large operator</option>
                <option value="sme">Micro or small enterprise</option>
              </Select>
            </Field>
            <div className="grid gap-3 rounded-md border border-border p-3">
              <Checkbox
                checked={f.reviewAllHighRisk}
                onChange={(v) => setF({ ...f, reviewAllHighRisk: v })}
                label="Send every plot from a high-risk country to a reviewer"
                description="Even when the forest maps show no clearing."
              />
              <Checkbox
                checked={f.autoAssess}
                onChange={(v) => setF({ ...f, autoAssess: v })}
                label="Check new plots automatically"
                description="Run the forest check as soon as a supplier adds a plot."
              />
            </div>
          </fieldset>
          {editable ? (
            <div>
              <Button type="submit" variant="primary" loading={update.isPending}>
                Save changes
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted">Only owners can change these details.</p>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function MembersCard({ editable, myUserId }: { editable: boolean; myUserId: string }) {
  const q = useMembers();
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const [removing, setRemoving] = useState<Member | null>(null);
  return (
    <Card>
      <CardHeader title="Members and roles" description="Each role sees only the work it needs." icon={<Users />} />
      {q.isPending ? (
        <LoadingBlock className="p-5" rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
              {editable ? <Th align="right">
                <span className="sr-only">Actions</span>
              </Th> : null}
            </tr>
          </thead>
          <tbody>
            {q.data.map((m) => (
              <tr key={m.id}>
                <Td>
                  <p className="font-medium">
                    {m.fullName} {m.userId === myUserId ? <span className="text-xs font-normal text-muted">(you)</span> : null}
                  </p>
                  <p className="text-xs text-muted">{m.email}</p>
                </Td>
                <Td>
                  {editable && m.userId !== myUserId ? (
                    <Select
                      aria-label={`Role for ${m.fullName}`}
                      value={m.role}
                      onChange={(e) => update.mutate({ id: m.id, role: e.target.value as Role })}
                      className="h-8 w-48 text-[13px]"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge>{m.roleLabel || ROLE_LABEL[m.role]}</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted">{m.joinedAt ? date(m.joinedAt) : m.status}</Td>
                {editable ? (
                  <Td align="right">
                    {m.userId !== myUserId ? (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${m.fullName}`} onClick={() => setRemoving(m)}>
                        <Trash />
                      </Button>
                    ) : null}
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
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
    </Card>
  );
}

function InvitationsCard() {
  const q = useInvitations();
  const create = useCreateInvitation();
  const revoke = useRevokeInvitation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("reviewer");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = (q.data ?? []).filter((i) => !i.acceptedAt);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    setError(null);
    try {
      const res = await create.mutateAsync({ email: email.trim(), role });
      setLink(absoluteUrl(res.inviteUrl));
      setEmail("");
    } catch {
      /* toast shown by the hook */
    }
  }

  return (
    <Card>
      <CardHeader title="Invite a colleague" description="Invitations are valid for 7 days. Share the link yourself; no email is sent from the demo." icon={<MailPlus />} />
      <CardBody className="grid gap-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <Field label="Email" htmlFor="inv-email" error={error}>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="inv-role">
            <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create invitation
          </Button>
        </form>
        <p className="-mt-2 text-xs text-muted">{ROLE_HELP[role]}</p>
        {link ? (
          <Callout tone="brand" title="Invitation link created">
            <p className="mb-2">This link is shown once. Copy it and send it to your colleague.</p>
            <CopyField value={link} label="Copy invitation link" />
          </Callout>
        ) : null}
      </CardBody>
      <div className="border-t border-border">
        <p className="px-4 pt-3 text-[13px] font-medium sm:px-5">Pending invitations</p>
        {q.isPending ? (
          <LoadingBlock className="p-5" rows={2} />
        ) : !pending.length ? (
          <p className="px-4 pb-4 pt-1 text-sm text-muted sm:px-5">None waiting.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.email}</p>
                  <p className="text-xs text-muted">
                    {ROLE_LABEL[i.role]} · expires {dateLong(i.expiresAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)} disabled={revoke.isPending}>
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RetentionCard({ years }: { years: number }) {
  return (
    <Card>
      <CardHeader title="Data retention" icon={<Archive />} />
      <CardBody className="grid gap-3 text-sm leading-relaxed text-muted lg:max-w-2xl">
        <p>
          Due diligence statements, their evidence packs, plot checks and the activity log are kept for{" "}
          <span className="font-medium text-fg">{years} years</span> from the date each statement is filed, as Article 12 of the regulation requires.
        </p>
        <p>Removing a plot or supplier archives it rather than deleting it, so past statements always keep their evidence.</p>
        <p>
          Farmer data is kept to the minimum: plots are identified by a reference, and any producer name is optional. Data is handled in line with GDPR.
        </p>
      </CardBody>
    </Card>
  );
}

export default function SettingsPage() {
  const { me, can } = useSession();
  const org = useOrg();
  const admin = can("org:admin");
  return (
    <PageContainer>
      <PageHeader title="Settings" description={me?.activeOrg?.name} />
      <Tabs defaultValue="organisation">
        <TabsList className="mb-5">
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="retention">Data retention</TabsTrigger>
        </TabsList>
        <TabsContent value="organisation" className="outline-none">
          {org.isPending ? <LoadingBlock rows={5} /> : org.isError ? <ErrorState error={org.error} onRetry={() => org.refetch()} /> : <OrgForm org={org.data} editable={admin} />}
        </TabsContent>
        <TabsContent value="members" className="grid gap-4 outline-none">
          {admin ? (
            <>
              <MembersCard editable myUserId={me?.user.id ?? ""} />
              <InvitationsCard />
            </>
          ) : (
            <MembersCard editable={false} myUserId={me?.user.id ?? ""} />
          )}
        </TabsContent>
        <TabsContent value="retention" className="outline-none">
          <RetentionCard years={org.data?.settings.retentionYears ?? 5} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
