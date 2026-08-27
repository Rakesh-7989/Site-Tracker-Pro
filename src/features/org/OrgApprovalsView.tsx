// SiteTrack Pro — Org Approval Chains (/org/approvals). One chain per resource:
// an ordered list of rungs (>= ₹threshold → approver role). DB-wired
// (approval_chains table, migration 78). PK is (org_id, resource) → upsert.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listChains, upsertChain, deleteChain, APPROVAL_RESOURCES, APPROVAL_RUNG_ROLES, type ApprovalChain, type ApprovalResource, type ApprovalRung } from "@/app/queries/orgConfigQueries";

 
import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";
const RES_LABEL: Record<ApprovalResource, string> = { expense: "Expense", po: "Purchase order", ra_bill: "RA bill", change_order: "Change order", invoice: "Invoice", drawing_release: "Drawing release" };
const RES_OPTS = APPROVAL_RESOURCES.map(r => ({ value: r, label: RES_LABEL[r] }));
const ROLE_OPTS = APPROVAL_RUNG_ROLES.map(r => ({ value: r, label: r }));
const fmtThreshold = (n: number): string => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString("en-IN")}`);

export function OrgApprovalsView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:approvals:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Approval chains require org admin." />;
  return <Inner orgId={activeOrg.orgId} updatedBy={session.user.id} />;
}

function Inner({ orgId, updatedBy }: { orgId: string; updatedBy: string }): JSX.Element {
  const [rows, setRows] = useState<ApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Builder state
  const [resource, setResource] = useState<ApprovalResource>("expense");
  const [name, setName] = useState("");
  const [rungs, setRungs] = useState<ApprovalRung[]>([]);
  const [thr, setThr] = useState(""); const [role, setRole] = useState<string>(APPROVAL_RUNG_ROLES[0]);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listChains(client, orgId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [orgId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  const addRung = () => { const t = Number(thr); if (!(t >= 0)) return; setRungs(rs => [...rs, { threshold: t, role }].sort((a, b) => a.threshold - b.threshold)); setThr(""); };
  const save = async () => {
    if (!name.trim() || rungs.length === 0) return;
    const prevRows = rows;
    await run("save", c => upsertChain(c, { orgId, resource, name: name.trim(), rungs, updatedBy }), {
      apply: () => setRows(prev => { const filtered = prev.filter(x => x.resource !== resource); return [...filtered, { resource, name: name.trim(), rungs }]; }),
      rollback: () => setRows(prevRows),
    });
    setName(""); setRungs([]);
  };
  const editExisting = (ch: ApprovalChain) => { setResource(ch.resource); setName(ch.name); setRungs(ch.rungs); };

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Approval chains</h1>
      <p className="text-sm text-fg-secondary -mt-2">For each resource, define who must sign off above a ₹ threshold. One chain per resource.</p>
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="p-3 space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Resource</span><Select fit className="mt-1 w-40" value={resource} onChange={e => setResource(e.target.value as ApprovalResource)} options={RES_OPTS} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Chain name</span><Input className="mt-1" placeholder="e.g. Standard sign-off" value={name} onChange={e => setName(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 flex-wrap items-end border-t border-default pt-3">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">{'>='} Amount ₹</span><Input fit className="mt-1 w-28" type="number" value={thr} onChange={e => setThr(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Approver</span><Select fit className="mt-1 w-32" value={role} onChange={e => setRole(e.target.value)} options={ROLE_OPTS} /></div>
          <Button size="sm" variant="secondary" onClick={addRung} disabled={!thr}>+ Rung</Button>
        </div>
        {rungs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rungs.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-secondary rounded-full pl-2 pr-1 py-0.5">
                {'>='}{fmtThreshold(r.threshold)} → {r.role}
                <button type="button" onClick={() => setRungs(rs => rs.filter((_, j) => j !== i))} className="text-fg-tertiary hover:text-error"><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex justify-end"><Button onClick={() => void save()} disabled={busy === "save" || !name.trim() || rungs.length === 0}>{busy === "save" ? <Spinner size={14} /> : "Save chain"}</Button></div>
      </Card>

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
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No approval chains configured.</div>
        : <div className="space-y-2">{rows.map(ch => (
            <Card key={ch.resource} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary flex items-center gap-2"><Badge tone="info">{RES_LABEL[ch.resource]}</Badge> {ch.name}</div>
                <div className="text-[11px] text-fg-tertiary mt-1">{ch.rungs.map(r => `>=${fmtThreshold(r.threshold)} → ${r.role}`).join("  ·  ") || "no rungs"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => editExisting(ch)}><Icon name="sliders" size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => void run(`d-${ch.resource}`, c => deleteChain(c, orgId, ch.resource), { apply: () => setRows(prev => prev.filter(x => x.resource !== ch.resource)), rollback: () => setRows(prev => [...prev, ch]) })}><Icon name="trash" size={14} className="text-error" /></Button>
              </div>
            </Card>))}</div>}
    </div>
  );
}
