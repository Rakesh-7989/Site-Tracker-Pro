// SiteTrack Pro â€” Org Approval Chains (/org/approvals). One chain per resource:
// an ordered list of rungs (â‰¥ â‚¹threshold â†’ approver role). DB-wired
// (approval_chains table, migration 78). PK is (org_id, resource) â†’ upsert.

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listChains, upsertChain, deleteChain, APPROVAL_RESOURCES, APPROVAL_RUNG_ROLES, type ApprovalChain, type ApprovalResource, type ApprovalRung } from "@/app/orgConfigQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const RES_LABEL: Record<ApprovalResource, string> = { expense: "Expense", po: "Purchase order", ra_bill: "RA bill", change_order: "Change order", invoice: "Invoice", drawing_release: "Drawing release" };
const RES_OPTS = APPROVAL_RESOURCES.map(r => ({ value: r, label: RES_LABEL[r] }));
const ROLE_OPTS = APPROVAL_RUNG_ROLES.map(r => ({ value: r, label: r }));
const fmtThreshold = (n: number): string => (n >= 100000 ? `â‚¹${(n / 100000).toFixed(1)}L` : `â‚¹${n.toLocaleString("en-IN")}`);

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
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="font-display text-2xl font-bold text-ink-900">Approval chains</h1>
      <p className="text-sm text-ink-500 -mt-2">For each resource, define who must sign off above a â‚¹ threshold. One chain per resource.</p>
      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="p-3 space-y-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Resource</span><Select className="mt-1 w-40" value={resource} onChange={e => setResource(e.target.value as ApprovalResource)} options={RES_OPTS} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Chain name</span><Input className="mt-1" placeholder="e.g. Standard sign-off" value={name} onChange={e => setName(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 flex-wrap items-end border-t border-cream-100 pt-3">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">â‰¥ Amount â‚¹</span><Input className="mt-1 w-28" type="number" value={thr} onChange={e => setThr(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Approver</span><Select className="mt-1 w-32" value={role} onChange={e => setRole(e.target.value)} options={ROLE_OPTS} /></div>
          <Button size="sm" variant="secondary" onClick={addRung} disabled={!thr}>+ Rung</Button>
        </div>
        {rungs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rungs.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-cream-100 rounded-full pl-2 pr-1 py-0.5">
                â‰¥{fmtThreshold(r.threshold)} â†’ {r.role}
                <button type="button" onClick={() => setRungs(rs => rs.filter((_, j) => j !== i))} className="text-ink-400 hover:text-rose-500"><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex justify-end"><Button onClick={() => void save()} disabled={busy === "save" || !name.trim() || rungs.length === 0}>{busy === "save" ? <Spinner size={14} /> : "Save chain"}</Button></div>
      </Card>

      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No approval chains configured.</div>
        : <div className="space-y-2">{rows.map(ch => (
            <Card key={ch.resource} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 flex items-center gap-2"><Badge tone="info">{RES_LABEL[ch.resource]}</Badge> {ch.name}</div>
                <div className="text-[11px] text-ink-400 mt-1">{ch.rungs.map(r => `â‰¥${fmtThreshold(r.threshold)} â†’ ${r.role}`).join("  Â·  ") || "no rungs"}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="ghost" onClick={() => editExisting(ch)}><Icon name="sliders" size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => void run(`d-${ch.resource}`, c => deleteChain(c, orgId, ch.resource), { apply: () => setRows(prev => prev.filter(x => x.resource !== ch.resource)), rollback: () => setRows(prev => [...prev, ch]) })}><Icon name="trash" size={14} className="text-rose-500" /></Button>
              </div>
            </Card>))}</div>}
    </div>
  );
}
