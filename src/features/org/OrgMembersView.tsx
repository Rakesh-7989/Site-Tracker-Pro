// SiteTrack Pro — Org People module (HRMS Phase B, /org/members).
//
// Org admins manage their org's people: see the directory, add an existing
// user by email, change org-tier role, assign/remove custom roles, and
// deactivate/reactivate. Gated on org:members:manage.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useAuth, useCan, useOrgSwitcher, usePlanCaps,
  ROLE_LABEL,
  displayPlanLabel, orgTierRoleLabel, orgTierRolesForPlan,
  isOrgTierRole,
  type OrgTierRole, type OrgCustomRole,
} from "@/auth";
import { Card, Button, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listOrgRoles } from "@/app/customRoleQueries";
import {
  listOrgMembers, lookupUserForInvite, addOrgMember, setOrgTierRole,
  deactivateMember, reactivateMember, assignCustomRole, unassignCustomRole,
  inviteNewOrgMember,
  type OrgMemberRow, type InviteCandidate,
} from "@/app/orgMemberQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

const idLabel = (role: string): string => (role in ROLE_LABEL ? ROLE_LABEL[role as keyof typeof ROLE_LABEL] : role);

export function OrgMembersView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const { plan, loading: planLoading } = usePlanCaps();
  const canManage = useCan("org:members:manage", activeOrg ? { orgId: activeOrg.orgId } : {});

  if (!session) return <div className="grid place-items-center py-20"><Spinner size={24} /></div>;
  if (!canManage) return <AccessDenied message="Only an org admin can manage people." />;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;

  return <OrgMembersInner orgId={activeOrg.orgId} orgName={activeOrg.orgName} createdBy={session.user.id} plan={plan} planLoading={planLoading} />;
}

function OrgMembersInner({ orgId, orgName, createdBy, plan, planLoading }: { orgId: string; orgName: string; createdBy: string; plan: string | null; planLoading: boolean }): JSX.Element {
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [customRoles, setCustomRoles] = useState<OrgCustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Add-member form
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<InviteCandidate | null | undefined>(undefined); // undefined = not searched
  const [inviteRole, setInviteRole] = useState<OrgTierRole>("architect");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [m, r] = await Promise.all([listOrgMembers(client, orgId), listOrgRoles(client, orgId)]);
    if (m.ok) setMembers(m.data); else setError(m.error);
    if (r.ok) setCustomRoles(r.data);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const roleById = useMemo(() => new Map(customRoles.map(r => [r.id, r])), [customRoles]);
  const effectivePlan = plan ?? "enterprise";
  const availableOrgRoles = useMemo(() => orgTierRolesForPlan(effectivePlan), [effectivePlan]);
  const roleOptions = useCallback((current?: string) => {
    const roles = isOrgTierRole(current) && !availableOrgRoles.includes(current) ? [...availableOrgRoles, current] : availableOrgRoles;
    return roles.map(r => ({ value: r, label: orgTierRoleLabel(r) }));
  }, [availableOrgRoles]);

  useEffect(() => {
    if (!availableOrgRoles.includes(inviteRole)) {
      setInviteRole(availableOrgRoles[0] ?? "client");
    }
  }, [availableOrgRoles, inviteRole]);

  const run = useCallback(async (key: string, fn: (client: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(key); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client);
    if (!res.ok) setError(res.error ?? "Action failed.");
    await reload();
    setBusy(null);
  }, [reload]);

  const search = async () => {
    if (!email.trim()) return;
    setSearching(true); setError(null); setCandidate(undefined);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setSearching(false); return; }
    const res = await lookupUserForInvite(client, email.trim());
    if (res.ok) setCandidate(res.data); else setError(res.error);
    setSearching(false);
  };

  const add = async () => {
    if (!candidate) return;
    await run(`add-${candidate.profileId}`, c => addOrgMember(c, { orgId, profileId: candidate.profileId, orgRole: inviteRole }));
    setEmail(""); setCandidate(undefined);
    setNotice(`Added ${candidate.name} to ${orgName}.`);
  };

  const sendInvite = async () => {
    if (!email.trim()) return;
    setInviting(true); setError(null); setNotice(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setInviting(false); return; }
    const res = await inviteNewOrgMember(client, { orgId, email: email.trim(), orgRole: inviteRole, name: inviteName.trim() || undefined });
    setInviting(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`Invite emailed to ${email.trim()}. They'll set a password and join ${orgName}.`);
    setEmail(""); setInviteName(""); setCandidate(undefined);
    await reload();
  };

  const active = members.filter(m => m.active);
  const inactive = members.filter(m => !m.active);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">People</h1>
        <p className="text-sm text-ink-500 mt-1">{orgName} · {active.length} active member{active.length === 1 ? "" : "s"}</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Add member */}
      <Card className="p-4 space-y-3">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400">Add a member</h3>
        <Alert variant="info">
          {planLoading ? "Checking plan role defaults..." : `${plan ? displayPlanLabel(plan) : "Plan unavailable"} role defaults: ${availableOrgRoles.map(orgTierRoleLabel).join(", ")}.`}
        </Alert>
        <div className="flex gap-2">
          <Input className="flex-1" type="email" placeholder="their@email.com" value={email}
                 onChange={e => { setEmail(e.target.value); setCandidate(undefined); setNotice(null); }} />
          <Button variant="secondary" onClick={() => void search()} disabled={searching || !email.trim()}>
            {searching ? <Spinner size={14} /> : "Find"}
          </Button>
        </div>
        {candidate === null && (
          <div className="space-y-2">
            <Alert variant="info">No account yet — email them an invite to join {orgName}.</Alert>
            <div className="flex items-center gap-2 flex-wrap">
              <Input className="w-40" placeholder="Name (optional)" value={inviteName} onChange={e => setInviteName(e.target.value)} />
              <Select className="w-auto" value={inviteRole} onChange={e => setInviteRole(e.target.value as OrgTierRole)}
                      options={roleOptions()} />
              <Button size="sm" onClick={() => void sendInvite()} disabled={inviting}>{inviting ? <Spinner size={14} /> : "Send invite"}</Button>
            </div>
          </div>
        )}
        {candidate && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink-800">{candidate.name} <span className="text-ink-400">({idLabel(candidate.identityRole)})</span></span>
            <Select className="w-auto" value={inviteRole} onChange={e => setInviteRole(e.target.value as OrgTierRole)}
                    options={roleOptions()} />
            <Button size="sm" onClick={() => void add()} disabled={busy === `add-${candidate.profileId}`}>Add to {orgName}</Button>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : (
        <>
          <MemberList title="Active" rows={active} customRoles={customRoles} roleById={roleById} busy={busy} orgId={orgId} createdBy={createdBy} roleOptions={roleOptions} run={run} />
          {inactive.length > 0 && (
            <MemberList title="Inactive" rows={inactive} customRoles={customRoles} roleById={roleById} busy={busy} orgId={orgId} createdBy={createdBy} roleOptions={roleOptions} run={run} dim />
          )}
        </>
      )}
    </div>
  );
}

interface ListProps {
  title: string; rows: OrgMemberRow[]; customRoles: OrgCustomRole[];
  roleById: Map<string, OrgCustomRole>; busy: string | null; orgId: string; createdBy: string; dim?: boolean;
  roleOptions: (current?: string) => Array<{ value: OrgTierRole; label: string }>;
  run: (key: string, fn: (client: unknown) => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}

function MemberList({ title, rows, customRoles, roleById, busy, orgId, createdBy, roleOptions, run, dim }: ListProps): JSX.Element {
  if (rows.length === 0) return <></>;
  return (
    <div>
      <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-2">{title}</h2>
      <div className="space-y-2">
        {rows.map(m => {
          const assignedLabels = new Set(m.customRoles);
          const assignable = customRoles.filter(r => !assignedLabels.has(r.label));
          return (
            <Card key={m.profileId} className={`p-3 ${dim ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-ink-800">{m.name}</div>
                  <div className="text-[11px] text-ink-400">{idLabel(m.identityRole)}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Org tier role */}
                  <Select
                    className="w-auto text-xs"
                    value={m.orgRole}
                    disabled={busy === `tier-${m.profileId}`}
                    onChange={e => void run(`tier-${m.profileId}`, c => setOrgTierRole(c, { orgId, profileId: m.profileId, orgRole: e.target.value as OrgTierRole }))}
                    options={roleOptions(m.orgRole)}
                  />
                  {m.active
                    ? <Button size="sm" variant="ghost" onClick={() => void run(`deact-${m.profileId}`, c => deactivateMember(c, orgId, m.profileId))}>Deactivate</Button>
                    : <Button size="sm" variant="secondary" onClick={() => void run(`react-${m.profileId}`, c => reactivateMember(c, orgId, m.profileId))}>Reactivate</Button>}
                </div>
              </div>

              {/* Custom roles */}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {m.customRoles.map(label => (
                  <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-violet-50 text-violet-700">
                    {label}
                    <button type="button" className="hover:text-violet-900"
                            onClick={() => {
                              const role = customRoles.find(r => r.label === label);
                              if (role) void run(`unassign-${m.profileId}-${role.id}`, c => unassignCustomRole(c, { orgId, profileId: m.profileId, orgRoleId: role.id }));
                            }}>
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
                {assignable.length > 0 && (
                  <Select
                    className="w-auto text-xs"
                    value=""
                    disabled={busy?.startsWith(`assign-${m.profileId}`)}
                    onChange={e => { if (e.target.value) void run(`assign-${m.profileId}-${e.target.value}`, c => assignCustomRole(c, { orgId, profileId: m.profileId, orgRoleId: e.target.value, assignedBy: createdBy })); }}
                    options={[{ value: "", label: "+ Add custom role" }, ...assignable.map(r => ({ value: r.id, label: r.label }))]}
                  />
                )}
                {roleById.size === 0 && m.customRoles.length === 0 && (
                  <span className="text-[11px] text-ink-300">No custom roles defined for this org yet.</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
