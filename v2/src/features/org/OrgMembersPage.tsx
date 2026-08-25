import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/forms";
import { SkeletonPage } from "@/components/ui/Skeleton";
import {
  inviteExistingOrgMember,
  inviteNewOrgMember,
  listOrgMembers,
  lookupUserForInvite,
} from "./orgMemberQueries";

const ROLE_OPTIONS = [
  "orgadmin",
  "pm",
  "architect",
  "site_engineer",
  "contractor",
  "client",
] as const;

export function OrgMembersPage() {
  const { session } = useAuth();
  const t = useT();
  const qc = useQueryClient();
  const orgId = session?.activeOrgId ?? "";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("site_engineer");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const q = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listOrgMembers(getClient(), orgId),
    enabled: !!orgId,
  });

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!orgId || !session) return;
    try {
      const candidate = await lookupUserForInvite(getClient(), email.trim());
      if (candidate) {
        await inviteExistingOrgMember(getClient(), {
          orgId,
          profileId: candidate.profileId,
          role,
          invitedBy: session.user.id,
        });
        setNotice({ ok: true, text: `Invitation pending for ${email.trim()} — they accept it from their workspace.` });
      } else {
        await inviteNewOrgMember(getClient(), { orgId, email: email.trim(), identityRole: role });
        setNotice({ ok: true, text: `Invite email sent to ${email.trim()}.` });
      }
      setEmail("");
      void qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!orgId) return <SkeletonPage rows={3} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-fg-primary">{t("org.membersTitle")}</h1>

      <Card title={t("org.inviteTitle")} padding="md">
        <form onSubmit={onInvite} className="flex flex-wrap items-end gap-3">
          <Input
            label={t("org.emailLabel")}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-64"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-secondary">{t("org.roleLabel")}</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Workspace role"
              className="h-10 rounded-[var(--st-radius-md)] border border-default bg-panel px-3 text-sm text-fg-primary focus-ring"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">{t("org.sendInvite")}</Button>
        </form>
        {notice && <div className="mt-2"><Alert variant={notice.ok ? "success" : "error"}>{notice.text}</Alert></div>}
      </Card>

      <Card title={`${t("org.teamLabel")} (${q.data?.length ?? 0})`} padding="none">
        {q.isLoading ? (
          <SkeletonPage rows={4} />
        ) : q.isError ? (
          <div className="p-4"><Alert variant="error">{String(q.error)}</Alert></div>
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <ul className="divide-y divide-[var(--st-border)]">
            {(q.data ?? []).map((m) => (
              <li key={m.profileId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg-primary truncate">
                    {m.name}
                    {m.profileId === session?.user.id && (
                      <span className="ml-2 text-xs text-fg-tertiary">{t("org.you")}</span>
                    )}
                  </div>
                  <div className="text-xs text-fg-tertiary">
                    {m.identityRole || "—"}
                    {m.joinedAt ? ` · joined ${m.joinedAt.slice(0, 10)}` : ""}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {m.isAdmin && <Badge tone="accent">{t("org.adminChip")}</Badge>}
                  <Badge tone={m.active ? "success" : "warning"}>
                    {m.active ? t("org.activeChip") : t("org.pendingChip")}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
