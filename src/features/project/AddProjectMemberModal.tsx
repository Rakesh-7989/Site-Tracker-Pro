import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Spinner, Alert } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { ROLE_LABEL, type IdentityRole } from "@/auth";
import { getClient } from "@/lib/supabase/supabase";
import {
  listAvailableOrgMembers,
  addProjectMember,
  type OrgMemberOption,
} from "@/app/queries/projectMemberQueries";

export interface AddProjectMemberModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  orgId: string;
  currentMemberIds: string[];
  onAdded: () => void;
}

export function AddProjectMemberModal({
  open,
  onClose,
  projectId,
  orgId,
  currentMemberIds,
  onAdded,
}: AddProjectMemberModalProps): JSX.Element {
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    setSelectedId("");
    void (async () => {
      const client = await getClient();
      if (!client) { setError("Backend not configured."); setLoading(false); return; }
      const res = await listAvailableOrgMembers(client, orgId, currentMemberIds);
      if (res.ok) setMembers(res.data);
      else setError(res.error);
      setLoading(false);
    })();
  }, [open, orgId, currentMemberIds]);

  const handleAdd = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setBusy(false); return; }
    const member = members.find(m => m.profileId === selectedId);
    const res = await addProjectMember(client, projectId, selectedId, member?.identityRole ?? "client");
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`Added ${member?.name ?? "member"} to the project.`);
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
            <Select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              options={[
                { value: "", label: "Select a member…" },
                ...members.map(m => ({
                  value: m.profileId,
                  label: `${m.name} (${ROLE_LABEL[m.identityRole as IdentityRole] ?? m.identityRole})`,
                })),
              ]}
            />
            <Button onClick={() => void handleAdd()} disabled={busy || !selectedId} className="w-full">
              {busy ? <Spinner size={14} /> : null}
              Add to project
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
