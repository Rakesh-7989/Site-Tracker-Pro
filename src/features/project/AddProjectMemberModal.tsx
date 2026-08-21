import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Spinner, Alert } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import {
  ROLE_LABEL,
  type IdentityRole,
  type ProjectType,
  type ProjectTierRole,
  VALID_PROJECT_ROLES_BY_TYPE,
} from "@/auth";
import { getClient } from "@/lib/supabase";
import {
  listAvailableOrgMembers,
  addProjectMember,
  type OrgMemberOption,
} from "@/app/projectMemberQueries";

export interface AddProjectMemberModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  orgId: string;
  projectType?: ProjectType;
  currentMemberIds: string[];
  onAdded: () => void;
}

export function AddProjectMemberModal({
  open,
  onClose,
  projectId,
  orgId,
  projectType = "construction",
  currentMemberIds,
  onAdded,
}: AddProjectMemberModalProps): JSX.Element {
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedRole, setSelectedRole] = useState<ProjectTierRole | "">("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availableProjectRoles = VALID_PROJECT_ROLES_BY_TYPE[projectType] || VALID_PROJECT_ROLES_BY_TYPE.construction;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedId("");
    setSelectedRole("");
    void (async () => {
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const res = await listAvailableOrgMembers(client, orgId, currentMemberIds);
      if (res.ok) setMembers(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [open, orgId, currentMemberIds]);

  const handleMemberChange = (id: string) => {
    setSelectedId(id);
    if (!id) {
      setSelectedRole("");
      return;
    }
    const member = members.find(m => m.profileId === id);
    const memberRole = member?.identityRole as ProjectTierRole;
    if (memberRole && availableProjectRoles.includes(memberRole)) {
      setSelectedRole(memberRole);
    } else {
      setSelectedRole(availableProjectRoles[0] ?? "");
    }
  };

  const handleAdd = async () => {
    if (!selectedId || !selectedRole) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const member = members.find(m => m.profileId === selectedId);
    const res = await addProjectMember(client, projectId, selectedId, selectedRole);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`Added ${member?.name ?? "member"} as ${ROLE_LABEL[selectedRole as IdentityRole] ?? selectedRole} to the project.`);
    onAdded();
    setTimeout(onClose, 1200);
  };

  return (
    <Modal open={open} onClose={onClose} title="Add team member" size="sm">
      <div className="space-y-4">
        {error && <Alert variant="danger">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center py-6"><Spinner size={20} /></div>
        ) : members.length === 0 ? (
          <p className="text-sm text-fg-secondary py-4 text-center">All org members are already on this project.</p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-1">
                Select Member
              </label>
              <Select
                value={selectedId}
                onChange={e => handleMemberChange(e.target.value)}
                options={[
                  { value: "", label: "Select a member…" },
                  ...members.map(m => ({
                    value: m.profileId,
                    label: `${m.name} (${ROLE_LABEL[m.identityRole as IdentityRole] ?? m.identityRole})`,
                  })),
                ]}
              />
            </div>

            {selectedId && (
              <div>
                <label className="block text-xs font-semibold text-fg-secondary uppercase tracking-wider mb-1">
                  Assign Project Role ({projectType})
                </label>
                <Select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value as ProjectTierRole)}
                  options={[
                    { value: "", label: "Select project role…" },
                    ...availableProjectRoles.map(r => ({
                      value: r,
                      label: ROLE_LABEL[r as IdentityRole] ?? r,
                    })),
                  ]}
                />
              </div>
            )}

            <Button onClick={() => void handleAdd()} disabled={busy || !selectedId || !selectedRole} className="w-full">
              {busy ? <Spinner size={14} /> : null}
              Add to project
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
