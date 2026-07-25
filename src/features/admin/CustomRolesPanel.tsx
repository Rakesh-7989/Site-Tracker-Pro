// SiteTrack Pro — Custom Roles panel (superadmin, migration 70).
import { getClient } from "@/lib/supabase";
//
// Shown inside RoleManager when a specific org is selected. Lets the founder
// create org-specific roles ("Site Lead", "Billing Head"), pick their feature
// set (optionally templated from a standard role), edit, and delete. Org
// admins later ASSIGN members to these roles (Phase B / People module).

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  IDENTITY_ROLES, ROLE_LABEL,
  baseCapabilitiesFor, capabilityGroups, capabilityLabel,
  type Capability, type IdentityRole, type OrgCustomRole,
} from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import {
  listOrgRoles, createOrgRole, setOrgRoleCapabilities, updateOrgRole, deleteOrgRole, slugifyRoleKey,
} from "@/app/customRoleQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

interface Draft {
  id: string | null;       // null = creating
  label: string;
  basedOn: string;         // "" = none
  caps: Set<Capability>;
}

export function CustomRolesPanel({ orgId, createdBy, hidePlatformCaps = false }: { orgId: string; createdBy: string; hidePlatformCaps?: boolean }): JSX.Element {
  const [roles, setRoles] = useState<OrgCustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Org admins (self-service, Enterprise) cannot grant platform:* caps — the DB
  // RLS rejects them (migration 98); we also hide them from the picker.
  const groups = useMemo(() => {
    const all = capabilityGroups();
    if (!hidePlatformCaps) return all;
    return all
      .map(g => ({ ...g, capabilities: g.capabilities.filter((c: string) => !c.startsWith("platform:")) }))
      .filter(g => g.capabilities.length > 0);
  }, [hidePlatformCaps]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listOrgRoles(client, orgId);
    if (res.ok) setRoles(res.data); else setError(res.error);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void reload(); }, [reload]);

  const startNew = () => setDraft({ id: null, label: "", basedOn: "", caps: new Set() });
  const startEdit = (r: OrgCustomRole) => setDraft({ id: r.id, label: r.label, basedOn: r.basedOn ?? "", caps: new Set(r.capabilities) });

  const applyTemplate = (basedOn: string) => {
    setDraft(d => d && ({ ...d, basedOn, caps: basedOn ? baseCapabilitiesFor(basedOn as IdentityRole) : d.caps }));
  };

  const toggleCap = (cap: Capability) => setDraft(d => {
    if (!d) return d;
    const caps = new Set(d.caps);
    caps.has(cap) ? caps.delete(cap) : caps.add(cap);
    return { ...d, caps };
  });

  const save = async () => {
    if (!draft || !draft.label.trim()) { setError("Role name is required."); return; }
    setSaving(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setSaving(false); return; }
    const caps = [...draft.caps];
    let res;
    if (draft.id === null) {
      res = await createOrgRole(client, {
        orgId, key: slugifyRoleKey(draft.label), label: draft.label.trim(),
        basedOn: draft.basedOn || null, capabilities: caps, createdBy,
      });
    } else {
      const meta = await updateOrgRole(client, draft.id, { label: draft.label.trim() });
      res = meta.ok ? await setOrgRoleCapabilities(client, draft.id, caps) : meta;
    }
    if (!res.ok) { setError(res.error); setSaving(false); return; }
    setSaving(false); setDraft(null);
    await reload();
  };

  const remove = async (r: OrgCustomRole) => {
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); return; }
    const res = await deleteOrgRole(client, r.id);
    if (!res.ok) { setError(res.error); return; }
    await reload();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-ink-400">Custom Roles (this org)</h3>
        {!draft && <Button size="sm" variant="secondary" onClick={startNew}><Icon name="plus" size={14} /> New role</Button>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Editor */}
      {draft && (
        <div className="space-y-3 border border-stone-200 rounded-xl p-3 mb-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Role name</span>
              <Input className="mt-1" value={draft.label} placeholder="e.g. Site Lead" onChange={e => setDraft(d => d && ({ ...d, label: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Start from (optional)</span>
              <Select
                className="mt-1"
                value={draft.basedOn}
                onChange={e => applyTemplate(e.target.value)}
                options={[{ value: "", label: "— blank —" }, ...IDENTITY_ROLES.filter(r => r !== "superadmin").map(r => ({ value: r, label: ROLE_LABEL[r] }))]}
              />
            </label>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
            {groups.map(g => (
              <div key={g.key}>
                <div className="text-[11px] font-semibold text-ink-500 mb-1">{g.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {g.capabilities.map(cap => {
                    const on = draft.caps.has(cap);
                    return (
                      <button
                        key={cap}
                        type="button"
                        onClick={() => toggleCap(cap)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition ${on ? "bg-safety-500 text-white border-safety-500" : "bg-white text-ink-500 border-stone-200 hover:bg-cream-100"}`}
                      >
                        {capabilityLabel(cap)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? <Spinner size={14} /> : "Save role"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <span className="text-[11px] text-ink-400 ml-auto">{draft.caps.size} feature{draft.caps.size === 1 ? "" : "s"}</span>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-6"><Spinner size={18} /></div>
      ) : roles.length === 0 && !draft ? (
        <div className="text-sm text-ink-500">No custom roles yet. Create one to give this org a role beyond the 22 standard ones.</div>
      ) : (
        <div className="space-y-1.5">
          {roles.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-cream-100">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-800 truncate">{r.label}</div>
                <div className="text-[11px] text-ink-400">
                  <Badge tone="neutral">{r.capabilities.length} features</Badge>
                  {r.basedOn && <span className="ml-1.5">from {ROLE_LABEL[r.basedOn as IdentityRole] ?? r.basedOn}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(r)}><Icon name="trash" size={14} className="text-rose-500" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
