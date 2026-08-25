import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase";
import { useT } from "@/i18n";
import {
  invitePartnerOrg,
  listProjectPartners,
  revokePartnerOrg,
  setPartnerScope,
  type PartnerScope,
} from "./partnerQueries";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/forms";

const STATUS_TONE: Record<string, "info" | "success" | "error"> = {
  invited: "info",
  active: "success",
  revoked: "error",
};

export function PartnersTab({ projectId }: { projectId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [scope, setScope] = useState<PartnerScope>("viewer");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["partners", projectId],
    queryFn: () => listProjectPartners(getClient(), projectId),
  });

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["partners", projectId] });
  }

  const invite = useMutation({
    mutationFn: () => invitePartnerOrg(getClient(), projectId, scope),
    onSuccess: (p) => {
      setLastCode(p.inviteCode);
      setCopied(false);
      invalidate();
    },
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const changeScope = useMutation({
    mutationFn: ({ id, next }: { id: string; next: PartnerScope }) =>
      setPartnerScope(getClient(), id, next),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokePartnerOrg(getClient(), id),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof Error ? e.message : String(e)),
  });

  if (q.isLoading) return <Alert variant="info">Loading partners…</Alert>;
  if (q.isError) return <Alert variant="error">{String(q.error)}</Alert>;

  const rows = q.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Card title={t("detail.inviteFirm")} padding="md">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t("detail.accessScope")}
            value={scope}
            onChange={(e) => setScope(e.target.value as PartnerScope)}
            options={[
              { value: "viewer", label: "Viewer — read-only" },
              { value: "contributor", label: "Contributor" },
              { value: "manager", label: "Manager" },
            ]}
            className="w-56"
          />
          <Button loading={invite.isPending} onClick={() => invite.mutate()}>
            {t("detail.genCode")}
          </Button>
        </div>
        {invite.isError && (
          <div className="mt-2">
            <Alert variant="error">{String(invite.error)}</Alert>
          </div>
        )}
        {actionError && !invite.isError && (
          <div className="mt-2">
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}
        {lastCode && (
          <div className="mt-3 rounded-[var(--st-radius-md)] bg-elevated px-4 py-3 flex items-center justify-between gap-3">
            <code className="text-sm text-fg-primary break-all">{lastCode}</code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(lastCode).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-fg-tertiary">
          Share the code with the partner firm's admin — they redeem it from their own
          workspace. The link binds to their org on redemption.
        </p>
      </Card>

      <Card title={`Partner firms (${rows.length})`} padding="none">
        {rows.length === 0 ? (
          <EmptyState
            title="No partner firms yet"
            message="Bring architects, contractors or consultants into this project."
          />
        ) : (
          <ul className="divide-y divide-[var(--st-border)]">
            {rows.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg-primary truncate">
                    {p.orgName ?? t("detail.awaitingRedemption")}
                  </div>
                  <div className="text-xs text-fg-tertiary">
                    {p.status === "invited" && p.inviteCode ? `code ${p.inviteCode}` : ""}
                    {p.acceptedAt ? `joined ${p.acceptedAt.slice(0, 10)}` : ""}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                  <Select
                    value={p.scope}
                    onChange={(e) =>
                      changeScope.mutate({ id: p.id, next: e.target.value as PartnerScope })
                    }
                    options={[
                      { value: "viewer", label: "Viewer" },
                      { value: "contributor", label: "Contributor" },
                      { value: "manager", label: "Manager" },
                    ]}
                    className="w-32"
                  />
                  <Button size="sm" variant="danger" onClick={() => revoke.mutate(p.id)}>
                    {t("detail.revoke")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
