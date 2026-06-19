// SiteTrack Pro — Role Permissions manager (superadmin, migration 69).
//
// Lets the founder (superadmin) grant/revoke capabilities to any identity
// role, scoped Global or to one org. Writes role_capability_overrides rows
// the v3 RoleResolver applies on top of the hardcoded matrix. Superadmin-only
// (gated on platform:roles:configure + RLS on the table).

import { useEffect, useMemo, useState, useCallback } from "react";

import {
  useAuth, useCan,
  IDENTITY_ROLES, ROLE_LABEL,
  baseCapabilitiesFor, capabilityGroups, capabilityLabel,
  type IdentityRole, type Capability, type CapabilityOverride, type AuthSession,
} from "@/auth";
import { Card, Badge, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import {
  listOrgsForOverrides, listCapabilityOverrides,
  setCapabilityOverride, clearCapabilityOverride, type OrgOption,
} from "@/app/capabilityOverrideQueries";
import { planUnlocksCustomRoles, PLAN_LABEL } from "@/app/platformAdminQueries";
import { CustomRolesPanel } from "./CustomRolesPanel";

type CellState = "inherit" | "grant" | "revoke";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> {
  const mod = await import("../../lib/supabase.js");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (mod as any).getSupabaseClient();
}

export function RoleManager(): JSX.Element {
  const { session } = useAuth();
  const canConfigure = useCan("platform:roles:configure");
  if (!session) {
    return <div className="grid place-items-center py-20 text-safety-500"><Spinner size={24} /></div>;
  }
  if (!canConfigure) {
    return <AccessDenied message="Only a platform admin can configure role permissions." />;
  }
  return <RoleManagerInner session={session} />;
}

function RoleManagerInner({ session }: { session: AuthSession }): JSX.Element {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [scope, setScope] = useState<string>("");                 // "" = Global
  const [role, setRole] = useState<IdentityRole>("architect");
  const [overrides, setOverrides] = useState<CapabilityOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCap, setSavingCap] = useState<Capability | null>(null);

  const orgId = scope === "" ? null : scope;
  const selectedOrg = useMemo(() => orgs.find(o => o.id === orgId) ?? null, [orgs, orgId]);
  const orgUnlocksCustom = selectedOrg ? planUnlocksCustomRoles(selectedOrg.plan) : false;

  // Load org list once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const res = await listOrgsForOverrides(client);
      if (cancelled) return;
      if (res.ok) setOrgs(res.data);
    })();
    return () => { cancelled = true; };
  }, []);

  // (Re)load overrides whenever the scope changes.
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listCapabilityOverrides(client, orgId);
    if (res.ok) setOverrides(res.data);
    else setError(res.error);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const base = useMemo(() => baseCapabilitiesFor(role), [role]);
  const groups = useMemo(() => capabilityGroups(), []);

  const stateOf = useCallback((cap: Capability): CellState => {
    const o = overrides.find(x => x.role === role && x.capability === cap);
    return o ? o.mode : "inherit";
  }, [overrides, role]);

  const apply = useCallback(async (cap: Capability, next: CellState) => {
    setSavingCap(cap); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setSavingCap(null); return; }
    const res = next === "inherit"
      ? await clearCapabilityOverride(client, { orgId, role, capability: cap })
      : await setCapabilityOverride(client, { orgId, role, capability: cap, mode: next, createdBy: session.user.id });
    if (!res.ok) setError(res.error);
    await reload();
    setSavingCap(null);
  }, [orgId, role, session.user.id, reload]);

  const overrideCount = overrides.filter(o => o.role === role).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900">Role Permissions</h1>
        <p className="text-sm text-ink-500 mt-1">
          Grant or revoke features per role. Changes layer on top of the built-in
          defaults and apply to v3 users in the chosen scope.
        </p>
      </div>

      {/* Scope + role selectors */}
      <Card className="p-4 grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Scope</span>
          <Select
            className="mt-1"
            value={scope}
            onChange={e => setScope(e.target.value)}
            options={[{ value: "", label: "🌐 Global (all orgs)" }, ...orgs.map(o => ({ value: o.id, label: o.name }))]}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Role</span>
          <Select
            className="mt-1"
            value={role}
            onChange={e => setRole(e.target.value as IdentityRole)}
            options={IDENTITY_ROLES.map(r => ({ value: r, label: `${ROLE_LABEL[r]} (${r})` }))}
          />
        </label>
      </Card>

      {/* Plan context for the selected org (soft gate — superadmin can always configure) */}
      {selectedOrg && (
        <Alert variant={orgUnlocksCustom ? "success" : "info"}>
          {selectedOrg.name} is on the <b>{PLAN_LABEL[selectedOrg.plan] ?? selectedOrg.plan}</b> plan.{" "}
          {orgUnlocksCustom
            ? "Per-org custom roles + feature overrides are unlocked (Business/Enterprise feature)."
            : "Custom roles are a Business/Enterprise feature for self-service - set this org to Business or Enterprise on /admin/orgs to surface it to its admins. (You, as superadmin, can still configure overrides below.)"}
        </Alert>
      )}

      {/* Custom roles live per-org (not Global) */}
      {orgId !== null && <CustomRolesPanel orgId={orgId} createdBy={session.user.id} />}

      <div className="pt-1">
        <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400">
          Standard role overrides — {ROLE_LABEL[role]}
        </h2>
      </div>

      {role === "superadmin" && (
        <Alert variant="info">Superadmin always holds every capability — overrides don't apply to it.</Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-500">
          {overrideCount > 0
            ? <span><Badge tone="warning">{overrideCount} override{overrideCount > 1 ? "s" : ""}</Badge> on <b>{ROLE_LABEL[role]}</b> in {orgId ? "this org" : "Global"}</span>
            : <span>No overrides — <b>{ROLE_LABEL[role]}</b> uses the built-in defaults.</span>}
        </div>
        {loading && <Spinner size={16} />}
      </div>

      {/* Capability grid */}
      {!loading && groups.map(group => (
        <Card key={group.key} className="p-4">
          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400 mb-3">{group.label}</h3>
          <div className="space-y-1.5">
            {group.capabilities.map(cap => {
              const cur = stateOf(cap);
              const baseHas = base.has(cap);
              const effective = cur === "grant" ? true : cur === "revoke" ? false : baseHas;
              const busy = savingCap === cap;
              return (
                <div key={cap} className="flex items-center justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <div className="text-sm text-ink-800 truncate flex items-center gap-1.5">
                      {capabilityLabel(cap)}
                      {busy && <Spinner size={12} />}
                    </div>
                    <div className="text-[11px] text-ink-400">
                      Default: {baseHas ? "on" : "off"}
                      {cur !== "inherit" && <span className={effective ? "text-emerald-600" : "text-rose-600"}> → {effective ? "on" : "off"}</span>}
                    </div>
                  </div>
                  <TriToggle value={cur} disabled={role === "superadmin" || busy} onChange={next => void apply(cap, next)} />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TriToggle({ value, disabled, onChange }: { value: CellState; disabled?: boolean; onChange: (v: CellState) => void }): JSX.Element {
  const opts: Array<{ v: CellState; label: string; tone: string }> = [
    { v: "inherit", label: "Default", tone: "bg-stone-100 text-ink-600" },
    { v: "grant", label: "Grant", tone: "bg-emerald-500 text-white" },
    { v: "revoke", label: "Revoke", tone: "bg-rose-500 text-white" },
  ];
  return (
    <div className="flex rounded-lg overflow-hidden border border-stone-200 flex-shrink-0">
      {opts.map(o => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => !active && onChange(o.v)}
            className={`px-2.5 py-1 text-xs font-semibold transition ${active ? o.tone : "bg-white text-ink-400 hover:bg-cream-100"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
