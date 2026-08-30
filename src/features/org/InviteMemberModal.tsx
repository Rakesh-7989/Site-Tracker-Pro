import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Button, Input, Select, FormField, Modal, Alert, Spinner } from "@/components/ui";
import { lookupUserForInvite, inviteExistingOrgMember, inviteNewOrgMember, type InviteCandidate } from "@/app/queries/orgMemberQueries";
import { getClient } from "@/lib/supabase/supabase";
import type { IdentityRole } from "@/auth";
import { QuotaGate } from "@/auth/QuotaGate";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  onInvited: () => void;
}

export function InviteMemberModal({ open, onClose, orgId, orgName, onInvited }: InviteMemberModalProps) {
  const t = useT();
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [candidate, setCandidate] = useState<InviteCandidate | null>(null);
  const [role, setRole] = useState<IdentityRole>("client");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);

  const handleLookup = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const client = await getClient();
    if (!client) { setError(t("auth.invite.backendError")); setLoading(false); return; }
    const res = await lookupUserForInvite(client, email.trim());
    if (res.ok) {
      if (res.data) {
        setCandidate(res.data);
        setName(res.data.name);
        setStep("details");
      } else {
        setCandidate(null);
        setName("");
        setStep("details");
      }
    } else {
      setError(res.error);
    }
    setLoading(false);
  };

  const handleInvite = async () => {
    if (step === "email") {
      await handleLookup();
      return;
    }
    if (!name.trim()) return;
    const client = await getClient();
    if (!client) { setError(t("auth.invite.backendError")); return; }
    setLoading(true);
    setError(null);
    let res;
    if (candidate) {
      res = await inviteExistingOrgMember(client, {
        orgId,
        profileId: candidate.profileId,
        role,
        invitedBy: (await client.auth.getUser()).data.user?.id ?? "",
      });
    } else {
      res = await inviteNewOrgMember(client, {
        orgId,
        email: email.trim(),
        name: name.trim() || undefined,
        identityRole: role,
      });
    }
    if (res.ok) {
      setInvited(true);
      setTimeout(() => { onInvited(); onClose(); }, 1500);
    } else {
      setError(res.error);
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title={t("auth.invite.title", { org: orgName })} size="md">
      {invited ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">OK</div>
          <h3 className="font-display text-lg font-bold text-fg-primary">{t("auth.invite.success")}</h3>
          <p className="text-fg-secondary text-sm mt-1">{t("auth.invite.successDesc")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          {step === "email" && (
            <div className="space-y-3">
              <FormField label={t("auth.invite.fieldEmail")} htmlFor="invite-email">
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t("auth.invite.emailPlaceholder")}
                  disabled={loading}
                />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose} disabled={loading}>{t("auth.invite.cancel")}</Button>
                <Button onClick={handleLookup} disabled={loading || !email.trim()}>
                  {loading ? <Spinner size={14} /> : t("auth.invite.lookup")}
                </Button>
              </div>
            </div>
          )}

          {step === "details" && (
            <QuotaGate resource="users">
              <div className="space-y-3">
              <p className="text-sm text-fg-secondary">
                {candidate
                  ? t("auth.invite.existingUser", { name: candidate.name })
                  : t("auth.invite.newUser")}
              </p>
              {!candidate && (
                <FormField label={t("auth.invite.fieldName")} htmlFor="invite-name">
                  <Input
                    id="invite-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t("auth.invite.namePlaceholder")}
                    disabled={loading}
                  />
                </FormField>
              )}
              <FormField label={t("auth.invite.fieldRole")} htmlFor="invite-role">
                <Select
                  id="invite-role"
                  value={role}
                  onChange={e => setRole(e.target.value as IdentityRole)}
                  options={["client", "architect", "pm", "contractor"].map(r => ({ value: r, label: r }))}
                  disabled={loading}
                />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setStep("email")} disabled={loading}>{t("auth.invite.back")}</Button>
                <Button onClick={handleInvite} disabled={loading || !name.trim()}>
                  {loading ? <Spinner size={14} /> : t("auth.invite.sendInvite")}
                </Button>
              </div>
            </div>
            </QuotaGate>
          )}
        </div>
      )}
    </Modal>
    );
}