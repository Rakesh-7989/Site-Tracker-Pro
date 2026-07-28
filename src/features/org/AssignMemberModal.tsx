import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Spinner, Alert } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import {
  ROLE_LABEL,
  orgTierForIdentityRole,
  type IdentityRole,
} from "@/auth";
import {
  lookupUserForInvite,
  addOrgMember,
  setIdentityRole,
  inviteNewOrgMember,
  type InviteCandidate,
} from "@/app/orgMemberQueries";
import { getClient } from "@/lib/supabase";

export interface AssignMemberModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  identityRole: string;
  plan: string | null;
  onAssigned: () => void;
}

export function AssignMemberModal({
  open,
  onClose,
  orgId,
  orgName: _orgName,
  identityRole,
  plan: _plan,
  onAssigned,
}: AssignMemberModalProps): JSX.Element {
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidate, setCandidate] = useState<InviteCandidate | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [inviteName, setInviteName] = useState("");

  const roleLabel = ROLE_LABEL[identityRole as IdentityRole] ?? identityRole;

  useEffect(() => {
    if (open) {
      setEmail("");
      setCandidate(undefined);
      setError(null);
      setNotice(null);
      setInviteName("");
    }
  }, [open]);

  const search = async () => {
    if (!email.trim()) return;
    setSearching(true);
    setError(null);
    setCandidate(undefined);
    const client = await getClient();
    if (!client) {
      setError("Backend not configured.");
      setSearching(false);
      return;
    }
    const res = await lookupUserForInvite(client, email.trim());
    if (res.ok) setCandidate(res.data);
    else setError(res.error);
    setSearching(false);
  };

  const assignExisting = async () => {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const client = await getClient();
    if (!client) {
      setError("Backend not configured.");
      setBusy(false);
      return;
    }

    const idResult = await setIdentityRole(client, candidate.profileId, identityRole);
    if (!idResult.ok) {
      setError(idResult.error);
      setBusy(false);
      return;
    }

    const orgResult = await addOrgMember(client, {
      orgId,
      profileId: candidate.profileId,
      role: orgTierForIdentityRole(identityRole as IdentityRole),
    });
    if (!orgResult.ok) {
      setError(orgResult.error);
      setBusy(false);
      return;
    }

    setNotice(`Assigned ${candidate.name} as ${roleLabel}.`);
    setBusy(false);
    onAssigned();
    setTimeout(onClose, 1200);
  };

  const assignAndInvite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const client = await getClient();
    if (!client) {
      setError("Backend not configured.");
      setBusy(false);
      return;
    }

    const res = await inviteNewOrgMember(client, {
      orgId,
      email: email.trim(),
      name: inviteName.trim() || undefined,
      identityRole,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAssigned();
    if (res.data?.emailSent === false) {
      setNotice(`Invited ${inviteName || email} as ${roleLabel}. Email not sent — ask them to log in at sitetrack.in.`);
    } else {
      setNotice(`Invited ${inviteName || email} as ${roleLabel}.`);
      setTimeout(onClose, 1200);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign: ${roleLabel}`}
      subtitle="Choose an existing user or invite a new person"
      size="lg"
    >
      <div className="space-y-5">
        {error && <Alert variant="danger">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-ink-700">Find existing user</h4>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              type="email"
              placeholder="their@email.com"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setCandidate(undefined);
                setNotice(null);
              }}
              onKeyDown={e => { if (e.key === "Enter") void search(); }}
            />
            <Button
              variant="secondary"
              onClick={() => void search()}
              disabled={searching || !email.trim()}
            >
              {searching ? <Spinner size={14} /> : "Search"}
            </Button>
          </div>

          {candidate === null && (
            <Alert variant="info" className="mt-3">
              No account found. Fill in a name below to invite them.
            </Alert>
          )}

          {candidate && (
            <div className="mt-3 p-3 rounded-xl bg-cream-100 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-cream-200 flex items-center justify-center text-sm font-semibold text-ink-600">
                  {candidate.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-ink-800 text-sm">{candidate.name}</div>
                  <div className="text-[11px] text-ink-400">
                    Current identity: {ROLE_LABEL[candidate.identityRole as IdentityRole] ?? candidate.identityRole}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => void assignExisting()}
                  disabled={busy}
                >
                  {busy ? <Spinner size={14} /> : null}
                  Assign as {roleLabel}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-cream-200 pt-4">
          <h4 className="text-xs font-semibold text-ink-700 mb-3">Or invite a new person</h4>
          <div className="space-y-3">
            <Input
              placeholder="Full name"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="their@email.com"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setCandidate(undefined);
                setNotice(null);
              }}
            />
            <Button
              onClick={() => void assignAndInvite()}
              disabled={busy || !email.trim()}
              leftIcon="send"
            >
              {busy ? <Spinner size={14} /> : null}
              Assign &amp; Invite
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
