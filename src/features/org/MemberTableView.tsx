import { useMemo } from "react";
import { Card, Button, Icon } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import {
  ROLE_LABEL,
  identityRoleLabel,
  identityRolesForPlan,
  isIdentityRole,
} from "@/auth";
import {
  setIdentityRole,
  deactivateMember,
  reactivateMember,
  removeMember,
  assignCustomRole,
  unassignCustomRole,
  type OrgMemberRow,
} from "@/app/queries/orgMemberQueries";
import type { OrgCustomRole } from "@/auth";

export interface MemberTableViewProps {
  members: OrgMemberRow[];
  customRoles: OrgCustomRole[];
  orgId: string;
  plan: string | null;
  createdBy: string;
  onReload: () => void;
  onError: (err: string | null) => void;
}

const idLabel = (role: string): string => (role in ROLE_LABEL ? ROLE_LABEL[role as keyof typeof ROLE_LABEL] : role);

export function MemberTableView({
  members,
  customRoles,
  orgId,
  plan,
  createdBy,
  onReload,
  onError,
}: MemberTableViewProps): JSX.Element {
  const effectivePlan = plan ?? "enterprise";
  const availableIdentityRoles = useMemo(() => identityRolesForPlan(effectivePlan), [effectivePlan]);

  const identityRoleOptions = useMemo(() =>
    availableIdentityRoles.map(r => ({ value: r, label: identityRoleLabel(r) })),
  [availableIdentityRoles]);

  const roleById = useMemo(() => new Map(customRoles.map(r => [r.id, r])), [customRoles]);

  const active = members.filter(m => m.active);
  const inactive = members.filter(m => !m.active);

  const runAction = async (
    _key: string,
    fn: (client: unknown) => Promise<{ ok: boolean; error?: string }>,
  ) => {
    onError(null);
    const { getClient } = await import("@/lib/supabase/supabase");
    const client = await getClient();
    if (!client) {
      onError("Backend not configured.");
      return;
    }
    const res = await fn(client);
    if (!res.ok) {
      onError(res.error ?? "Action failed.");
    }
    onReload();
  };

  if (members.length === 0) return <></>;

  const renderRow = (m: OrgMemberRow) => {
    const assignedLabels = new Set(m.customRoles);
    const assignable = customRoles.filter(r => !assignedLabels.has(r.label));
    return (
      <Card key={m.profileId} className={`p-3 ${!m.active ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-semibold text-fg-primary">{m.name}</div>
            <div className="text-[11px] text-fg-tertiary">{idLabel(m.identityRole)}{m.isAdmin ? " · Admin" : ""}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select fit
              className="w-auto text-xs"
              value={m.identityRole}
              onChange={e => {
                const v = e.target.value;
                if (!isIdentityRole(v)) {
                  onError(`"${v}" is not a valid identity role.`);
                  return;
                }
                void runAction(`identity-${m.profileId}`, c => setIdentityRole(c, m.profileId, v));
              }}
              options={identityRoleOptions}
            />
            {m.active
              ? <Button size="sm" variant="ghost" onClick={() => void runAction(`deact-${m.profileId}`, c => deactivateMember(c, orgId, m.profileId))}>Deactivate</Button>
              : <Button size="sm" variant="secondary" onClick={() => void runAction(`react-${m.profileId}`, c => reactivateMember(c, orgId, m.profileId))}>Reactivate</Button>}
            <Button size="sm" variant="ghost" className="text-error hover:text-error hover:bg-error-tint" onClick={() => {
              if (window.confirm(`Permanently delete ${m.name} and their account? They will be able to re-register with the same email.`)) {
                void runAction(`remove-${m.profileId}`, c => removeMember(c, orgId, m.profileId));
              }
            }}>Delete</Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {m.customRoles.map(label => (
            <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-accent-tint text-[var(--st-violet)]">
              {label}
              <button type="button" className="hover:text-[var(--st-violet)]"
                onClick={() => {
                  const role = customRoles.find(r => r.label === label);
                  if (role) void runAction(`unassign-${m.profileId}-${role.id}`, c => unassignCustomRole(c, { orgId, profileId: m.profileId, orgRoleId: role.id }));
                }}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
          {assignable.length > 0 && (
            <Select fit
              className="w-auto text-xs"
              value=""
              onChange={e => {
                const v = e.target.value;
                if (v) {
                  const role = customRoles.find(r => r.id === v);
                  if (role) void runAction(`assign-${m.profileId}-${v}`, c => assignCustomRole(c, { orgId, profileId: m.profileId, orgRoleId: v, assignedBy: createdBy }));
                }
              }}
              options={[{ value: "", label: "+ Add custom role" }, ...assignable.map(r => ({ value: r.id, label: r.label }))]}
            />
          )}
          {roleById.size === 0 && m.customRoles.length === 0 && (
            <span className="text-[11px] text-fg-tertiary">No custom roles defined for this org yet.</span>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div>
      {active.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">Active</h2>
          <div className="space-y-2">{active.map(renderRow)}</div>
        </div>
      )}
      {inactive.length > 0 && (
        <div className="mt-4">
          <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">Inactive</h2>
          <div className="space-y-2">{inactive.map(renderRow)}</div>
        </div>
      )}
    </div>
  );
}
