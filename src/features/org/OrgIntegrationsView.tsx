// SiteTrack Pro — Org Integrations (/org/integrations). An org admin connects
// their OWN 3rd-party provider accounts. Secrets are write-only from the UI
// (never read back — status is booleans only). DB-wired (migration 83).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import type { IconName } from "@/components/ui/icons";
import { getIntegrationStatus, saveProvider, clearProvider, PROVIDERS, SECRET_FIELDS, type IntegrationStatus, type ProviderMeta } from "@/app/queries/orgIntegrationsQueries";

 
import { useAction } from "@/hooks/useAction";

import { getClient } from "@/lib/supabase/supabase";
export function OrgIntegrationsView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:integrations:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Integrations require org admin." />;
  return <Inner orgId={activeOrg.orgId} userId={session.user.id} />;
}

function ProviderCard({ meta, configured, onSave, onClear, busy }: {
  meta: ProviderMeta; configured: boolean; busy: boolean;
  onSave: (cfg: Record<string, string>) => void; onClear: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const submit = () => { const cfg: Record<string, string> = {}; for (const [k] of meta.fields) { const v = (vals[k] ?? "").trim(); if (v) cfg[k] = v; } if (Object.keys(cfg).length) { onSave(cfg); setOpen(false); setVals({}); } };
  return (
    <Card padding="md" title={
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-accent-tint text-accent grid place-items-center"><Icon name={meta.icon as IconName} size={18} /></div>
        <div><div className="font-semibold text-fg-primary">{meta.label}</div><div className="text-[11px] text-fg-tertiary">{meta.help}</div>{meta.policyNote && <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{meta.policyNote}</div>}</div>
      </div>
    } action={<Badge tone={configured ? "success" : "neutral"}>{configured ? "Connected" : "Not set"}</Badge>}>
      {!open ? (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{configured ? "Reconfigure" : "Connect"}</Button>
          {configured && <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>Disconnect</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {meta.fields.map(([k, label]) => (
            <label key={k} className="block"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{label}</span>
              <Input className="mt-1" type={SECRET_FIELDS.has(k) ? "password" : "text"} autoComplete="off" value={vals[k] ?? ""} onChange={e => setVals(s => ({ ...s, [k]: e.target.value }))} /></label>
          ))}
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setVals({}); }}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={busy}>{busy ? <Spinner size={14} /> : "Save"}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Inner({ orgId, userId }: { orgId: string; userId: string }): JSX.Element {
  const [status, setStatus] = useState<IntegrationStatus>({ whatsapp: false, ai: false, razorpay: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getIntegrationStatus(client, orgId); if (res.ok) setStatus(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="font-display text-2xl font-bold text-fg-primary">Integrations</h1>
      <p className="text-sm text-fg-secondary -mt-2">Connect your own provider accounts. Keys are stored encrypted-at-RLS and never shown again after saving — re-enter to change.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2">
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
        : <div className="grid sm:grid-cols-2 gap-3">{PROVIDERS.map(p => (
            <ProviderCard key={p.id} meta={p} configured={status[p.id]} busy={busy === p.id}
              onSave={cfg => void run(p.id, c => saveProvider(c, orgId, p.id, cfg, userId), { apply: () => setStatus(prev => ({ ...prev, [p.id]: true })), rollback: () => setStatus(prev => ({ ...prev, [p.id]: false })) })}
              onClear={() => void run(p.id, c => clearProvider(c, orgId, p.id, userId), { apply: () => setStatus(prev => ({ ...prev, [p.id]: false })), rollback: () => setStatus(prev => ({ ...prev, [p.id]: true })) })} />
          ))}</div>}
    </div>
  );
}
