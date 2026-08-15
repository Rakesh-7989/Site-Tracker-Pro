// SiteTrack Pro — Org Admin home (/org). Single-org overview: plan, project +
// member counts, and quick links to the other org-admin panels. Read-only
// (org_admin_overview RPC, migration 77).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Icon, Badge, Spinner, Alert, Button, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import type { IconName } from "@/components/ui/icons";
import { getOrgOverview, deleteOrganization, PLAN_LABEL, type OrgOverview } from "@/app/orgAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { getClient } from "@/lib/supabase";
import { QuotaMeter } from "@/features/org/QuotaMeter";
const LINKS: Array<{ to: string; label: string; icon: IconName; desc: string }> = [
  { to: "/org/members", label: "People", icon: "users", desc: "Members, roles & invites" },
  { to: "/org/billing", label: "Billing", icon: "credit-card", desc: "Plan, seats & subscription" },
  { to: "/org/integrations", label: "Integrations", icon: "plug", desc: "WhatsApp · AI · payments" },
  { to: "/audit", label: "Activity", icon: "shield", desc: "Org-wide audit trail" },
  { to: "/admin/roles", label: "Role Permissions", icon: "lock", desc: "Custom roles & capabilities" },
];

export function OrgDashboardView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canView = useCan("org:members:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canView) return <AccessDenied message="Org admin access required." />;
  return <OrgDashboardInner orgId={activeOrg.orgId} orgName={activeOrg.orgName} />;
}

function OrgDashboardInner({ orgId, orgName }: { orgId: string; orgName: string }): JSX.Element {
  const [data, setData] = useState<OrgOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDanger, setShowDanger] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgOverview(client, orgId); if (res.ok) setData(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const orgDisplayName = data?.name || orgName;
  const doDelete = async () => {
    if (confirmName.trim() !== orgDisplayName) return;
    setDeleting(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setDeleting(false); return; }
    const res = await deleteOrganization(client, orgId);
    if (res.ok) { window.location.href = "/dashboard"; } // org gone → fresh session
    else { setError(res.error); setDeleting(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg-primary">{data?.name || orgName}</h1>
          <div className="text-sm text-fg-secondary">Organization admin</div>
        </div>
        {data && <Badge tone="info">{PLAN_LABEL[data.plan] ?? data.plan} plan</Badge>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div> : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-4"><div className="text-3xl font-display font-bold text-fg-primary">{data?.projectCount ?? 0}</div><div className="text-xs text-fg-secondary mt-0.5">Projects</div></Card>
            <Card className="p-4"><div className="text-3xl font-display font-bold text-fg-primary">{data?.memberCount ?? 0}</div><div className="text-xs text-fg-secondary mt-0.5">Members</div></Card>
            <QuotaMeter orgId={orgId} />
            <Card className="p-4"><div className="text-sm font-semibold text-fg-primary">{data?.sub?.status ? data.sub.status : "No subscription"}</div><div className="text-xs text-fg-secondary mt-0.5">Billing status</div></Card>
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-fg-tertiary mb-2">Manage</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {LINKS.map(l => (
                <Link key={l.to} to={l.to}>
                  <Card className="p-4 hover:border-accent transition cursor-pointer h-full">
                    <div className="w-9 h-9 rounded-lg bg-accent-tint text-accent grid place-items-center mb-2"><Icon name={l.icon} size={18} /></div>
                    <div className="text-sm font-semibold text-fg-primary">{l.label}</div>
                    <div className="text-[11px] text-fg-tertiary mt-0.5">{l.desc}</div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* Danger zone — DPDP right-to-erasure */}
          <div>
            <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-error mb-2">Danger zone</h2>
            <Card className="p-4 border-error">
              {!showDanger ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm text-fg-secondary">Permanently delete this organization and <b>all</b> its data (projects, finance, members...). This cannot be undone.</div>
                  <Button size="sm" variant="secondary" onClick={() => setShowDanger(true)}>Delete organization</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-fg-primary">Type <b className="text-error">{orgDisplayName}</b> to confirm permanent deletion:</div>
                  <Input value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={orgDisplayName} autoComplete="off" />
                  <div className="flex gap-2 justify-end flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => { setShowDanger(false); setConfirmName(""); }}>Cancel</Button>
                    <button type="button" disabled={deleting || confirmName.trim() !== orgDisplayName}
                      onClick={() => void doDelete()}
                      className="text-sm font-semibold text-white bg-error hover:bg-error disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition inline-flex items-center gap-2">
                      {deleting ? <Spinner size={14} /> : "Permanently delete"}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
