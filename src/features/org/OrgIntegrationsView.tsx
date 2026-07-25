// SiteTrack Pro â€” Org Integrations (/org/integrations). An org admin connects
// their OWN 3rd-party provider accounts. Secrets are write-only from the UI
// (never read back â€” status is booleans only). DB-wired (migration 83).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input } from "@/components/ui/forms";
import type { IconName } from "@/components/ui/icons";
import { getIntegrationStatus, saveProvider, clearProvider, PROVIDERS, SECRET_FIELDS, type IntegrationStatus, type ProviderMeta } from "@/app/orgIntegrationsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { useAction } from "@/hooks/useAction";

import { getClient } from "@/lib/supabase";
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
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-safety-50 text-safety-600 grid place-items-center"><Icon name={meta.icon as IconName} size={18} /></div>
          <div><div className="font-semibold text-ink-800">{meta.label}</div><div className="text-[11px] text-ink-400">{meta.help}</div></div>
        </div>
        <Badge tone={configured ? "success" : "neutral"}>{configured ? "Connected" : "Not set"}</Badge>
      </div>
      {!open ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{configured ? "Reconfigure" : "Connect"}</Button>
          {configured && <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>Disconnect</Button>}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {meta.fields.map(([k, label]) => (
            <label key={k} className="block"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
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
  const [status, setStatus] = useState<IntegrationStatus>({ whatsapp: false, ai: false, razorpay: false, cashfree: false });
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
      <h1 className="font-display text-2xl font-bold text-ink-900">Integrations</h1>
      <p className="text-sm text-ink-500 -mt-2">Connect your own provider accounts. Keys are stored encrypted-at-RLS and never shown again after saving â€” re-enter to change.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="grid place-items-center py-12"><Spinner size={24} /></div>
        : <div className="grid sm:grid-cols-2 gap-3">{PROVIDERS.map(p => (
            <ProviderCard key={p.id} meta={p} configured={status[p.id]} busy={busy === p.id}
              onSave={cfg => void run(p.id, c => saveProvider(c, orgId, p.id, cfg, userId), { apply: () => setStatus(prev => ({ ...prev, [p.id]: true })), rollback: () => setStatus(prev => ({ ...prev, [p.id]: false })) })}
              onClear={() => void run(p.id, c => clearProvider(c, orgId, p.id, userId), { apply: () => setStatus(prev => ({ ...prev, [p.id]: false })), rollback: () => setStatus(prev => ({ ...prev, [p.id]: true })) })} />
          ))}</div>}
    </div>
  );
}
