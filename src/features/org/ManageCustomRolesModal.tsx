import { useCallback, useState } from "react";
import { getClient } from "@/lib/supabase";
import {
  IDENTITY_ROLES, ROLE_LABEL,
  baseCapabilitiesFor, capabilityGroups, capabilityLabel,
  type Capability, type IdentityRole, type OrgCustomRole,
} from "@/auth";
import {
  assignCustomRole, unassignCustomRole,
} from "@/app/orgMemberQueries";
import {
  listOrgRoles, createOrgRole, slugifyRoleKey,
} from "@/app/customRoleQueries";
import { Modal } from "@/components/ui/Modal";
import { Button, Spinner, Alert, Icon, Card } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";

interface Draft {
  label: string;
  basedOn: string;
  caps: Set<Capability>;
}

export interface ManageCustomRolesModalProps {
  open: boolean;
  onClose: () => void;
  profileId: string;
  memberName: string;
  orgId: string;
  createdBy: string;
  customRoles: OrgCustomRole[];
  assignedRoleLabels: string[];
  onReload: () => void;
  onError: (err: string | null) => void;
}

export function ManageCustomRolesModal({
  open,
  onClose,
  profileId,
  memberName,
  orgId,
  createdBy,
  customRoles,
  assignedRoleLabels,
  onReload,
  onError: _onError,
}: ManageCustomRolesModalProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busyToggle, setBusyToggle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [allRoles, setAllRoles] = useState<OrgCustomRole[]>(customRoles);

  const refreshRoles = useCallback(async () => {
    const client = await getClient();
    if (!client) return;
    const res = await listOrgRoles(client, orgId);
    if (res.ok) setAllRoles(res.data);
  }, [orgId]);

  const assigned = new Set(assignedRoleLabels);

  const handleToggle = useCallback(async (role: OrgCustomRole) => {
    setError(null);
    setBusyToggle(role.id);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusyToggle(null); return; }
    const isAssigned = assigned.has(role.label);
    const res = isAssigned
      ? await unassignCustomRole(client, { orgId, profileId, orgRoleId: role.id })
      : await assignCustomRole(client, { orgId, profileId, orgRoleId: role.id, assignedBy: createdBy });
    if (!res.ok) setError(res.error);
    setBusyToggle(null);
    onReload();
  }, [orgId, profileId, createdBy, assigned, onReload]);

  const groups = capabilityGroups();

  const openCreate = () => {
    setDraft({ label: "", basedOn: "", caps: new Set() });
    setCreating(true);
    setError(null);
  };

  const applyTemplate = (basedOn: string) => {
    setDraft(d => d && ({ ...d, basedOn, caps: basedOn ? baseCapabilitiesFor(basedOn as IdentityRole) : new Set() }));
  };

  const toggleCap = (cap: Capability) => setDraft(d => {
    if (!d) return d;
    const caps = new Set(d.caps);
    caps.has(cap) ? caps.delete(cap) : caps.add(cap);
    return { ...d, caps };
  });

  const saveNewRole = async () => {
    if (!draft || !draft.label.trim()) { setError("Role name is required."); return; }
    setSavingCreate(true);
    setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setSavingCreate(false); return; }
    const res = await createOrgRole(client, {
      orgId,
      key: slugifyRoleKey(draft.label),
      label: draft.label.trim(),
      basedOn: draft.basedOn || null,
      capabilities: [...draft.caps],
      createdBy,
    });
    if (!res.ok) { setError(res.error); setSavingCreate(false); return; }
    setSavingCreate(false);
    setCreating(false);
    setDraft(null);
    await refreshRoles();
    onReload();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Manage Custom Roles`}
      subtitle={memberName}
      size="lg"
    >
      <div className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {/* Assigned */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">Currently assigned</div>
          {allRoles.filter(r => assigned.has(r.label)).length === 0 ? (
            <div className="text-sm text-ink-400">No custom roles assigned.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allRoles.filter(r => assigned.has(r.label)).map(r => (
                <button
                  key={r.id}
                  type="button"
                  disabled={busyToggle === r.id}
                  onClick={() => void handleToggle(r)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 transition disabled:opacity-50"
                >
                  {r.label}
                  {busyToggle === r.id ? <Spinner size={10} /> : <Icon name="x" size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Available */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">Available to assign</div>
          {allRoles.filter(r => !assigned.has(r.label)).length === 0 ? (
            <div className="text-sm text-ink-400">All roles already assigned. Create a new one below.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {allRoles.filter(r => !assigned.has(r.label)).map(r => (
                <button
                  key={r.id}
                  type="button"
                  disabled={busyToggle === r.id}
                  onClick={() => void handleToggle(r)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border border-stone-200 text-ink-600 hover:bg-cream-100 transition disabled:opacity-50"
                >
                  <Icon name="plus" size={11} />
                  {r.label}
                  {busyToggle === r.id && <Spinner size={10} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create new role */}
        <div className="border-t border-stone-200 pt-3">
          {creating ? (
            <Card className="p-3 space-y-3 border border-stone-200">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Role name</span>
                  <Input
                    className="mt-1"
                    value={draft?.label ?? ""}
                    placeholder="e.g. Site Lead"
                    onChange={e => setDraft(d => d && ({ ...d, label: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Start from (optional)</span>
                  <Select
                    className="mt-1"
                    value={draft?.basedOn ?? ""}
                    onChange={e => applyTemplate(e.target.value)}
                    options={[{ value: "", label: "— blank —" }, ...IDENTITY_ROLES.filter(r => r !== "superadmin").map(r => ({ value: r, label: ROLE_LABEL[r] }))]}
                  />
                </label>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {groups.map(g => (
                  <div key={g.key}>
                    <div className="text-[11px] font-semibold text-ink-500 mb-1">{g.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.capabilities.map(cap => {
                        const on = draft?.caps.has(cap) ?? false;
                        return (
                          <button
                            key={cap}
                            type="button"
                            onClick={() => toggleCap(cap)}
                            className={`px-2.5 py-1 rounded-full text-xs border transition ${on ? "bg-safety-500 text-white border-safety-500" : "bg-white text-ink-500 border-stone-200 hover:bg-cream-100"}`}
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
                <Button size="sm" onClick={() => void saveNewRole()} disabled={savingCreate}>
                  {savingCreate ? <Spinner size={14} /> : null}
                  Create role &amp; assign
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setDraft(null); setError(null); }} disabled={savingCreate}>
                  Cancel
                </Button>
                <span className="text-[11px] text-ink-400 ml-auto">{draft?.caps.size ?? 0} feature{draft?.caps.size === 1 ? "" : "s"}</span>
              </div>
            </Card>
          ) : (
            <Button size="sm" variant="secondary" onClick={openCreate} leftIcon="plus">
              Create a new custom role
            </Button>
          )}
        </div>

        <div className="border-t border-stone-200 pt-3 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
