// SiteTrack Pro - Partners tab (cross-org collaboration C1, host view).
// Mint one-time invite CODES for partner FIRMS (their own SiteTrack orgs);
// the firm's admin redeems the code from their workspace. Scope is editable,
// revoke blinds the whole org instantly. Money stays host-only.

import { useCallback, useEffect, useState } from "react";
import { useCan } from "@/auth";
import { useT } from "@/i18n/I18nProvider";
import { getTypedClient } from "@/lib/supabase/db";
import {
  listProjectPartners,
  invitePartnerOrg,
  setPartnerScope,
  revokePartnerOrg,
  type ProjectPartner,
  type PartnerScope } from "@/app/queries/partnerQueries";
import { Card, Button, Badge, Alert } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";

const STATUS_TONE: Record<ProjectPartner["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  invited: "warning",
  revoked: "neutral" };

export function PartnersTab({ projectId }: { projectId: string }): JSX.Element {
  const canManage = useCan("project:settings:edit");
  const t = useT();
  const [partners, setPartners] = useState<ProjectPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<PartnerScope>("viewer");
  const [minting, setMinting] = useState(false);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const SCOPE_OPTIONS: { value: PartnerScope; label: string }[] = [
    { value: "viewer", label: t("partner.scopeViewer") },
    { value: "contributor", label: t("partner.scopeContributor") },
    { value: "manager", label: t("partner.scopeManager") },
  ];

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const client = await getTypedClient();
      if (!client) { setError(t("partner.backendError")); setPartners([]); return; }
      setPartners(await listProjectPartners(client, projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => { void reload(); }, [reload]);

  const mintInvite = async () => {
    setBusyState();
    try {
      const client = await getTypedClient();
      if (!client) { setError(t("partner.backendError")); return; }
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
      key: "firm", header: t("partner.colFirm"),
      render: p => (
        <span className="font-semibold text-fg-primary text-sm">
          {p.orgName ?? (p.status === "invited" ? t("partner.awaitingRedemption") : `Org ${p.orgId?.slice(0, 8) ?? "?"}…`)}
        </span>
      ) },
    {
      key: "scope", header: t("partner.colScope"), hideOnMobile: true,
      render: p => (
        <Select
          fit compact
          value={p.scope}
          disabled={!canManage}
          onChange={async e => {
            const client = await getTypedClient();
            if (!client) return;
            const r = await setPartnerScope(client, p.id, e.target.value as PartnerScope);
            if (!r.ok) setError(r.error ?? t("partner.scopeChangeFailed"));
            else void reload();
          }}
          options={SCOPE_OPTIONS}
        />
      ) },
    { key: "status", header: "Status", render: p => <Badge tone={STATUS_TONE[p.status]}>{t(`partner.status${p.status.charAt(0).toUpperCase() + p.status.slice(1)}` as "partner.statusInvited")}</Badge> },
    {
      key: "code", header: t("partner.colInviteCode"), hideOnMobile: true,
      render: p => p.status === "invited" && p.inviteCode
        ? <code className="font-mono text-xs bg-bg-secondary px-1.5 py-0.5 rounded break-all">{p.inviteCode}</code>
        : <span className="text-fg-tertiary text-xs">—</span> },
    {
      key: "acceptedAt", header: t("partner.colAccepted"), hideOnMobile: true,
      render: p => <span className="text-xs text-fg-secondary">{p.acceptedAt ? p.acceptedAt.slice(0, 10) : "—"}</span> },
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
                if (!window.confirm(t("partner.revokeConfirm", { label }))) return;
                const client = await getTypedClient();
                if (!client) return;
                const r = await revokePartnerOrg(client, p.id);
                if (!r.ok) setError(r.error ?? t("partner.revokeFailed"));
                else void reload();
              }}
            >
              Revoke
            </Button>
          ) }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-fg-primary">{t("partner.sectionTitle")}</h2>
          <p className="text-sm text-fg-secondary">
            {t("partner.sectionDesc")}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Select
              compact fit
              value={scope}
              onChange={e => setScope(e.target.value as PartnerScope)}
              options={SCOPE_OPTIONS}
              aria-label={t("partner.inviteScopeLabel")}
            />
            <Button leftIcon="plus" loading={minting} onClick={() => void mintInvite()}>
              {t("partner.newInviteCode")}
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {freshCode && (
        <Alert variant="success" title={`${t("partner.inviteCodeReady")} (${SCOPE_OPTIONS.find(s => s.value === scope)?.label})`}>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm bg-bg-secondary px-2 py-1 rounded border border-default">{freshCode}</code>
            <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(freshCode); setCopied(true); }}>
              {copied ? t("partner.copied") : t("partner.copyCode")}
            </Button>
            <span className="text-xs text-fg-secondary">
              {t("partner.shareHint")}
            </span>
          </div>
        </Alert>
      )}

      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-default p-3 flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-elevated rounded animate-pulse w-1/3" />
                <div className="h-3 bg-elevated rounded animate-pulse w-1/4" />
              </div>
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
              <div className="h-5 bg-elevated rounded-full animate-pulse w-16" />
            </div>
          ))}
        </div>
      ) : partners.length === 0 ? (
        <Card padding="md">
          <div className="flex items-center gap-3 text-fg-secondary text-sm">
            {t("partner.emptyState")}
          </div>
        </Card>
      ) : (
        <DataTable dense rows={partners} columns={columns} rowKey={p => p.id} />
      )}

      <Card padding="sm">
        <div className="text-xs text-fg-tertiary leading-relaxed">
          <b>{t("partner.scopesLabel")}</b> {t("partner.scopeViewer")} · {t("partner.scopeContributor")} · {t("partner.scopeManager")}.
          {t("partner.revokeHint")}
        </div>
      </Card>
    </div>
  );
}
