import { useState, useEffect, useCallback } from "react";
import { useAuth, useOrgSwitcher, useCan } from "@/auth";
import { PlanGate } from "@/auth/PlanGate";
import { Alert, AccessDenied, Button } from "@/components/ui/atoms";
import { Icon } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { getClient } from "@/lib/supabase/supabase";
import {
  listProfiles,
  cloneProfile,
  compareBindings,
  listBindingsForProfiles,
  listAclEntries,
  listAuditEvents,
  getOrgRbacMode,
  setOrgRbacMode,
} from "@/auth/rbac2";
import type { QueryClient, RoleProfile } from "@/auth/rbac2";

function getEffectClass(effect: string) {
  return effect === "allow" ? "text-fg-primary" : "text-error";
}

function getAllowCount(auditEvents: any[]) {
  return auditEvents.filter((e) => e.effect === "allow").length;
}

function getDenyCount(auditEvents: any[]) {
  return auditEvents.filter((e) => e.effect === "deny").length;
}

function getAllowCountClass(auditEvents: any[]) {
  return auditEvents.some((e) => e.effect === "allow") ? "text-fg-primary" : "text-fg-tertiary";
}

function getDenyCountClass(auditEvents: any[]) {
  return auditEvents.some((e) => e.effect === "deny") ? "text-error" : "text-fg-tertiary";
}

export function RbacView(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const can = useCan("org:members:manage", { orgId: activeOrg?.orgId });
  if (!can) return <AccessDenied message="Org admin access required." />;
  // RBAC V2 policy core is a Business+ capability (same tier as custom roles):
  // wrap everything — including the loading skeleton — in the plan gate.
  return (
    <PlanGate feature="custom_roles">
      <RbacViewBody />
    </PlanGate>
  );
}

function RbacViewBody(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const [mode, setMode] = useState<"matrix" | "shadow" | "enforce">("matrix");
  const [modeError, setModeError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<RoleProfile[]>([]);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [compareRows, setCompareRows] = useState<ReturnType<typeof compareBindings> | null>(null);
  const [comparing, setComparing] = useState(false);
  const [aclEntries, setAclEntries] = useState<Array<{ resourceType: string; capability: string; effect: string }>>([]);
  const [auditEvents, setAuditEvents] = useState<Array<{ capability: string; effect: string; mode: string; reason?: string }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!activeOrg) {
      setLoading(false);
      return;
    }
    const client = await getClient();
    if (!client) {
      setLoading(false);
      return;
    }

    // Fetch org RBAC mode from DB
    const modeResult = await getOrgRbacMode(
      client as unknown as QueryClient, 
      activeOrg.orgId
    );
    if (modeResult.ok) {
      const dbMode = modeResult.data === "shadow" || modeResult.data === "enforce" ? modeResult.data : "matrix";
      setMode(dbMode);
    }

    // Fetch role profiles
    const profilesResult = await listProfiles(client as unknown as QueryClient);
    if (profilesResult.ok && profilesResult.data) {
      setProfiles(profilesResult.data.filter((p): p is RoleProfile => p != null));
    }

    // Fetch resource ACL entries
    const aclResult = await listAclEntries(client as unknown as QueryClient, activeOrg.orgId);
    if (aclResult.ok && aclResult.data) {
      const aclArray = aclResult.data as Array<{ resourceType: string; capability: string; effect: string } | null>;
      setAclEntries(
        aclArray
          .filter((a): a is NonNullable<typeof aclArray[0]> => a != null)
          .map((a) => ({
            resourceType: a.resourceType,
            capability: a.capability,
            effect: a.effect,
          }))
      );
    }

    // Fetch audit events (last 20)
    const auditResult = await listAuditEvents(client as unknown as QueryClient, activeOrg.orgId, 20);
    if (auditResult.ok && auditResult.data) {
      const auditArray = auditResult.data as Array<{ capability: string; effect: string; mode: string; reason?: string } | null>;
      setAuditEvents(
        auditArray
          .filter((a): a is NonNullable<typeof auditArray[0]> => a != null)
          .map((a) => ({
            capability: a.capability,
            effect: a.effect,
            mode: a.mode,
            reason: a.reason,
          }))
      );
    }

    setLoading(false);
  }, [activeOrg, session]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;

  const handleModeChange = async (newMode: "matrix" | "shadow" | "enforce") => {
    const client = await getClient();
    if (!client) return;
    try {
      const setResult = await setOrgRbacMode(client as unknown as QueryClient, activeOrg.orgId, newMode);
      if (setResult.ok) {
        setMode(newMode);
      } else {
        setModeError(setResult.error ?? "Failed to update org RBAC mode");
        setMode("matrix");
      }
    } catch (e) {
      setModeError("Failed to update org RBAC mode");
      setMode("matrix");
    }
  };

  const handleClone = async (profileId: string) => {
    setCloningId(profileId);
    setCloneError(null);
    try {
      const client = await getClient();
      if (!client) return;
      const res = await cloneProfile(client as unknown as QueryClient, {
        sourceId: profileId,
        orgId: activeOrg.orgId,
      });
      if (!res.ok) setCloneError(res.error);
      else await fetchData();
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloningId(null);
    }
  };

  const runCompare = async () => {
    if (!compareA || !compareB || compareA === compareB) return;
    setComparing(true);
    try {
      const client = await getClient();
      if (!client) return;
      const qc = client as unknown as QueryClient;
      const [ra, rb] = await Promise.all([
        listBindingsForProfiles(qc, [compareA]),
        listBindingsForProfiles(qc, [compareB]),
      ]);
      setCompareRows(
        compareBindings(ra.ok ? ra.data : [], rb.ok ? rb.data : []),
      );
    } finally {
      setComparing(false);
    }
  };

  // If still loading after effect, show skeleton
  if (loading) {
    return (
      <div className="p-4 md:p-10 max-w-4xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-panel rounded-2xl p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Role Profiles</p>
            <div className="p-3 border border-default rounded-xl text-center text-fg-secondary">
              <Icon name="users" size={20} className="mx-auto mb-2 opacity-30" /> <p>Loading...</p>
            </div>
          </div>
          <div className="bg-panel rounded-2xl p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Resource ACL</p>
            <div className="p-3 border border-default rounded-xl text-center text-fg-secondary">
              <Icon name="shield" size={20} className="mx-auto mb-2 opacity-30" /> <p>Loading...</p>
            </div>
          </div>
          <div className="bg-panel rounded-2xl p-6">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Authorization Audit</p>
            <div className="p-3 border border-default rounded-xl text-center text-fg-secondary">
              <Icon name="activity" size={20} className="mx-auto mb-2 opacity-30" /> <p>Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10 max-w-4xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3 border-b border-default">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-accent-2 mb-2">— RBAC V2 Admin</div>
          <h1 className="font-display text-2xl md:text-4xl font-light text-fg-primary tracking-editorial leading-none">RBAC V2</h1>
          <p className="text-fg-secondary text-sm mt-2">Organization RBAC V2 settings: mode controls how capability decisions are resolved.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-fg-secondary">Mode: </span>
          <Select
            value={mode}
            onChange={e => {
              const v = (e.target as HTMLSelectElement).value as "matrix" | "shadow" | "enforce";
              setMode(v);
              handleModeChange(v);
            }}
            options={["matrix", "shadow", "enforce"].map(val => ({ value: val, label: val }))}
            className="p-2 border-default rounded-sm text-sm"
          >
            <option value="matrix">matrix</option>
            <option value="shadow">shadow</option>
            <option value="enforce">enforce</option>
          </Select>
          {modeError && <span className="text-error text-sm">{modeError}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Role Profiles Panel */}
        <div className="bg-panel rounded-2xl p-6 shadow-editorial border-default">
          <div className="flex items-between justify-between mb-4">
            <h2 className="font-display font-semibold text-fg-primary text-base md:text-lg">Role Profiles</h2>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">System profiles</p>
            <ul className="space-y-1 text-sm">
              {profiles.filter(p => p.isSystem).map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="text-fg-primary flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-fg-tertiary">{p.sourceRole ?? ""}</span>
                  <Button variant="secondary" size="sm" disabled={cloningId === p.id} onClick={() => void handleClone(p.id)}>
                    Clone
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Org-scoped profiles</p>
            {profiles.some(p => !p.isSystem) ? (
              <ul className="space-y-1 text-sm">
                {profiles.filter(p => !p.isSystem).map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <span className="text-fg-primary flex-1 truncate">{p.name}</span>
                    {p.sourceRole && <span className="text-[10px] text-fg-tertiary">base: {p.sourceRole}</span>}
                    <Button variant="secondary" size="sm" disabled={cloningId === p.id} onClick={() => void handleClone(p.id)}>
                      Clone
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3 border border-default rounded-xl text-center text-fg-secondary">
                <Icon name="users" size={20} className="mx-auto mb-2 opacity-30" />
                <p>No custom profiles yet — clone a system profile to start.</p>
              </div>
            )}
            {cloneError && <Alert variant="danger">{cloneError}</Alert>}
          </div>
        </div>

        {/* Profile Compare Panel (Zoho-style side-by-side) */}
        <div className="bg-panel rounded-2xl p-6 shadow-editorial border-default md:col-span-2">
          <h2 className="font-display font-semibold text-fg-primary text-base md:text-lg mb-4">Compare Profiles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <Select
              aria-label="Profile A"
              value={compareA}
              onChange={e => setCompareA(e.target.value)}
              options={[{ value: "", label: "Profile A…" }, ...profiles.map(p => ({ value: p.id, label: p.name }))]}
            />
            <Select
              aria-label="Profile B"
              value={compareB}
              onChange={e => setCompareB(e.target.value)}
              options={[{ value: "", label: "Profile B…" }, ...profiles.map(p => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <Button variant="secondary" size="sm" loading={comparing} disabled={!compareA || !compareB || compareA === compareB} onClick={() => void runCompare()}>
            Compare
          </Button>
          {compareRows && (
            compareRows.length === 0 ? (
              <p className="text-sm text-fg-secondary mt-3">Neither profile carries explicit bindings — both inherit their base role matrix.</p>
            ) : (
              <div className="mt-3 max-h-80 overflow-y-auto border border-default rounded-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-elevated">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold text-fg-secondary">Capability</th>
                      <th className="px-3 py-2 font-semibold text-fg-secondary">{profiles.find(p => p.id === compareA)?.name ?? "A"}</th>
                      <th className="px-3 py-2 font-semibold text-fg-secondary">{profiles.find(p => p.id === compareB)?.name ?? "B"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...compareRows].sort((x, y) => Number(y.differs) - Number(x.differs)).map(r => (
                      <tr key={r.capability} className={r.differs ? "bg-warning-tint/40" : ""}>
                        <td className="px-3 py-1.5 text-fg-primary">{r.capability}</td>
                        <td className={`px-3 py-1.5 ${r.a === "deny" ? "text-error" : r.a === "allow" ? "text-success" : "text-fg-tertiary"}`}>{r.a}</td>
                        <td className={`px-3 py-1.5 ${r.b === "deny" ? "text-error" : r.b === "allow" ? "text-success" : "text-fg-tertiary"}`}>{r.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Resource ACL Panel */}
        <div className="bg-panel rounded-2xl p-6 shadow-editorial border-default">
          <div className="flex items-between justify-between mb-4">
            <h2 className="font-display font-semibold text-fg-primary text-base md:text-lg">Resource ACL</h2>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">ACL entries</p>
            {aclEntries.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {aclEntries.map((a) => (
                  <li key={a.capability} className="flex items-center">
                    <span className="text-fg-secondary flex-1">{a.resourceType}</span>
                    <span className={`${getEffectClass(a.effect)} ml-2`}>
                      {a.effect}
                    </span>
                    <span className="text-fg-tertiary"> {a.capability}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3 border border-default rounded-xl text-center text-fg-secondary">
                <Icon name="shield" size={20} className="mx-auto mb-2 opacity-30" />
                <p>No ACL entries</p>
              </div>
            )}
          </div>
        </div>

        {/* Audit Viewer */}
        <div className="bg-panel rounded-2xl p-6 shadow-editorial border-default">
          <div className="flex items-between justify-between mb-4">
            <h2 className="font-display font-semibold text-fg-primary text-base md:text-lg">Authorization Audit</h2>
            <Button variant="secondary" size="sm" onClick={() => void fetchData()}>
              <Icon name="refresh" size={12} /> Refresh
            </Button>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Recent events</p>
            {auditEvents.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {auditEvents.map((a) => (
                  <li key={a.capability} className="flex items-center">
                    <span className="text-fg-tertiary min-w-24">{a.capability}</span>
                    <span className={`${getEffectClass(a.effect)} ml-2`}>
                      {a.effect}
                    </span>
                    <span className="text-[xxs] text-fg-secondary ml-2">{a.mode}</span>
                    {a.reason && <span className="text-[xxs] text-fg-secondary ml-2">({a.reason})</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3 border border-default rounded-xl text-center text-fg-secondary">
                <Icon name="activity" size={20} className="mx-auto mb-2 opacity-30" />
                <p>No audit events</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Summary</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold text-fg-tertiary">Total:</span> <span>{auditEvents.length}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-fg-tertiary">Allow:</span>
                  <span className={getAllowCountClass(auditEvents)}>
                    {getAllowCount(auditEvents)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-fg-tertiary">Deny:</span>
                  <span className={getDenyCountClass(auditEvents)}>
                    {getDenyCount(auditEvents)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}