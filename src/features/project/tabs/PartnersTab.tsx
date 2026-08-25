// SiteTrack Pro - Partners tab (cross-org collaboration C1, host view).
// Mint one-time invite CODES for partner FIRMS (their own SiteTrack orgs);
// the firm's admin redeems the code from their workspace. Scope is editable,
// revoke blinds the whole org instantly. Money stays host-only.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { getTypedClient } from "@/lib/db";
import {
  listProjectPartners,
  invitePartnerOrg,
  setPartnerScope,
  revokePartnerOrg,
  PARTNER_SCOPE_LABEL,
  PARTNER_STATUS_LABEL,
  type ProjectPartner,
  type PartnerScope,
} from "@/app/partnerQueries";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";

const STATUS_TONE: Record<ProjectPartner["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  invited: "warning",
  revoked: "neutral",
};

const SCOPE_OPTIONS: { value: PartnerScope; label: string }[] = [
  { value: "viewer", label: "Viewer (read-only)" },
  { value: "contributor", label: "Contributor" },
  { value: "manager", label: "Manager" },
];

export function PartnersTab({ projectId }: { projectId: string }): JSX.Element {
  const canManage = useCan("project:settings:edit");
  const [partners, setPartners] = useState<ProjectPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<PartnerScope>("viewer");
  const [minting, setMinting] = useState(false);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const client = await getTypedClient();
      if (!client) { setError("Backend not configured."); setPartners([]); return; }
      setPartners(await listProjectPartners(client, projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const mintInvite = async () => {
    setBusyState();
    try {
      const client = await getTypedClient();
      if (!client) { setError("Backend not configured."); return; }
      const res = await invitePartnerOrg(client, { projectId, scope });
      if (!res.ok) { setError(res.error); return; }
      setFreshCode(res.partner.inviteCode);
      setCopied(false);
      await reload();
    } finally {
      setMinting(false);
    }
  };

  // Local busy flag helper keeps minting state in one place.
  function setBusyState(): void {
    setMinting(true);
    setError(null);
    setFreshCode(null);
  }

  const columns: Column<ProjectPartner>[] = [
    {
      key: "firm", header: "Partner firm",
      render: p => (
        <span className="font-semibold text-fg-primary text-sm">
          {p.orgName ?? (p.status === "invited" ? "Awaiting redemption" : `Org ${p.orgId?.slice(0, 8) ?? "?"}…`)}
        </span>
      ),
    },
    {
      key: "scope", header: "Scope", hideOnMobile: true,
      render: p => (
        <Select
          fit compact
          value={p.scope}
          disabled={!canManage}
          onChange={async e => {
            const client = await getTypedClient();
            if (!client) return;
            const r = await setPartnerScope(client, p.id, e.target.value as PartnerScope);
            if (!r.ok) setError(r.error ?? "Could not change scope.");
            else void reload();
          }}
          options={SCOPE_OPTIONS}
        />
      ),
    },
    { key: "status", header: "Status", render: p => <Badge tone={STATUS_TONE[p.status]}>{PARTNER_STATUS_LABEL[p.status]}</Badge> },
    {
      key: "code", header: "Invite code", hideOnMobile: true,
      render: p => p.status === "invited" && p.inviteCode
        ? <code className="font-mono text-xs bg-bg-secondary px-1.5 py-0.5 rounded break-all">{p.inviteCode}</code>
        : <span className="text-fg-tertiary text-xs">—</span>,
    },
    {
      key: "acceptedAt", header: "Accepted", hideOnMobile: true,
      render: p => <span className="text-xs text-fg-secondary">{p.acceptedAt ? p.acceptedAt.slice(0, 10) : "—"}</span>,
    },
    ...(canManage
      ? [{
          key: "actions" as const, header: "",
          render: (p: ProjectPartner) => (
            <Button
              size="sm" variant="ghost"
              leftIcon="trash"
              aria-label={`Revoke ${p.orgName ?? "pending invite"}`}
              onClick={async () => {
                const label = p.orgName ?? "this pending invite";
                if (!window.confirm(`Revoke ${label}? Every member of that firm loses access immediately.`)) return;
                const client = await getTypedClient();
                if (!client) return;
                const r = await revokePartnerOrg(client, p.id);
                if (!r.ok) setError(r.error ?? "Revoke failed.");
                else void reload();
              }}
            >
              Revoke
            </Button>
          ),
        }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-fg-primary">Partner firms</h2>
          <p className="text-sm text-fg-secondary">
            Other organizations collaborating on this project — read-only in this release. Financials stay host-only.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Select
              compact fit
              value={scope}
              onChange={e => setScope(e.target.value as PartnerScope)}
              options={SCOPE_OPTIONS}
              aria-label="Invite scope"
            />
            <Button leftIcon="plus" loading={minting} onClick={() => void mintInvite()}>
              New invite code
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {freshCode && (
        <Alert variant="success" title={`Invite code ready (${SCOPE_OPTIONS.find(s => s.value === scope)?.label})`}>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm bg-bg-secondary px-2 py-1 rounded border border-default">{freshCode}</code>
            <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(freshCode); setCopied(true); }}>
              {copied ? "Copied" : "Copy code"}
            </Button>
            <span className="text-xs text-fg-secondary">
              Share it with the partner firm's admin — they redeem it under Projects → Shared with us.
            </span>
          </div>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : partners.length === 0 ? (
        <Card padding="md">
          <div className="flex items-center gap-3 text-fg-secondary text-sm">
            No partner firms yet. Generate an invite code and share it with an architect / contractor / consultant organization.
          </div>
        </Card>
      ) : (
        <DataTable dense rows={partners} columns={columns} rowKey={p => p.id} />
      )}

      <Card padding="sm">
        <div className="text-xs text-fg-tertiary leading-relaxed">
          <b>Scopes:</b> {PARTNER_SCOPE_LABEL.viewer} · {PARTNER_SCOPE_LABEL.contributor} · {PARTNER_SCOPE_LABEL.manager}.
          Revoking removes every member of that firm immediately and is written to the immutable audit log.
        </div>
      </Card>
    </div>
  );
}
