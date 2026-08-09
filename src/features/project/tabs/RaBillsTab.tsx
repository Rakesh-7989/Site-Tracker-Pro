// SiteTrack Pro — RA bills tab, extended to support measurement-book backing
// (ST-019): an RA bill can be built from a selection of unlinked MB entries
// (auto-computed amount), and each bill shows its linked MB rows.
// V6 Phase 2: MB-backed RA bills — recalculate from MB, drift detection.

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon, Badge } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listRaBills, createRaBill, setRaBillStatus, deleteRaBill, raNetPayable, fmtRupees, type RaBill, type RaBillStatus } from "@/app/financeQueries";
import { listUnlinkedMb, listMbForRa, unlinkMb, mbSelectionTotal, sumMbForRa, listMbDriftsForRa, type RaMbEntry, type MbSum, type MbDrift } from "@/app/mbRaQueries";
import { ReceiptsPanel } from "./ReceiptsPanel";

import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const STT = [{ value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" }];

export function RaBillsTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canCreate = useCan("rabill:create", ctx);
  const canApprove = useCan("rabill:approve", ctx);
  const [rows, setRows] = useState<RaBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [no, setNo] = useState(""); const [sub, setSub] = useState(""); const [scope, setScope] = useState(""); const [amount, setAmount] = useState(""); const [ret, setRet] = useState("5");
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [openMb, setOpenMb] = useState<string | null>(null);

  // MB-backed create: load unlinked MB entries, let the user pick some.
  const [unlinked, setUnlinked] = useState<RaMbEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mbLoading, setMbLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listRaBills(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);

  const loadUnlinked = useCallback(async () => {
    if (!canCreate) return;
    setMbLoading(true);
    const client = await getClient(); if (!client) { setMbLoading(false); return; }
    const res = await listUnlinkedMb(client, projectId);
    if (res.ok) { setUnlinked(res.data); setSelected(prev => new Set([...prev].filter(id => res.data.some(m => m.id === id)))); }
    setMbLoading(false);
  }, [canCreate, projectId]);
  useEffect(() => { void loadUnlinked(); }, [loadUnlinked]);

  const toggle = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selRows = unlinked.filter(r => selected.has(r.id));
  const selTotal = mbSelectionTotal(selRows);

  const add = async () => {
    const manualAmt = Number(amount);
    const mbIds = [...selected];
    const amt = mbIds.length ? selTotal : manualAmt;
    if (!no.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createRaBill(c, { projectId, no: no.trim(), subcontractor: sub.trim() || undefined, scope: scope.trim() || undefined, billAmount: amt, retentionPct: Number(ret) || 5, mbIds }), {
      apply: () => setRows(prev => [{ id: tmpId, no: no.trim(), subcontractor: sub.trim() || null, scope: scope.trim() || null, billAmount: amt, retentionPct: Number(ret) || 5, paidAmount: 0, billDate: null, status: "submitted" as RaBillStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setNo(""); setSub(""); setScope(""); setAmount(""); setSelected(new Set());
    void loadUnlinked();
  };

  const columns: Column<RaBill>[] = [
    {
      key: "detail", header: "RA Bill", className: "flex-1 min-w-0",
      render: r => (
        <RaRow r={r} canApprove={canApprove} openPay={openPay} setOpenPay={setOpenPay} openMb={openMb} setOpenMb={setOpenMb} projectId={projectId} run={run} />
      ),
    },
    {
      key: "status", header: "Status", className: "flex-shrink-0",
      render: r => canApprove ? (
        <Select className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as RaBillStatus; void run(`s-${r.id}`, c => setRaBillStatus(c, r.id, v, v === "paid" ? raNetPayable(r) : undefined), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
      ) : <span className="text-xs text-fg-secondary">{r.status}</span>,
    },
    ...(canCreate ? [{
      key: "actions" as const, header: "", className: "flex-shrink-0",
      render: (r: RaBill) => (
        <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteRaBill(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}>
          <Icon name="trash" size={14} className="text-error" />
        </Button>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">RA Bills</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {canCreate && (
        <Card className="p-3 space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Bill No</span><Input className="mt-1 w-24" placeholder="RA-1" value={no} onChange={e => setNo(e.target.value)} /></div>
            <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Subcontractor</span><Input className="mt-1" value={sub} onChange={e => setSub(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Retention %</span><Input className="mt-1 w-20" type="number" value={ret} onChange={e => setRet(e.target.value)} /></div>
            <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ₹</span><Input className="mt-1 w-28" type="number" value={selected.size ? String(selTotal) : amount} onChange={e => setAmount(e.target.value)} disabled={selected.size > 0} placeholder={selected.size ? "from MB" : undefined} /></div>
            <Button onClick={() => void add()} disabled={busy === "add" || !no.trim() || (!selected.size && !amount)}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
          </div>
          <div className="border-t border-default pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Back from Measurement Book</span>
              {mbLoading ? <Spinner size={12} /> : <button className="text-[11px] text-accent font-semibold hover:opacity-70" onClick={() => void loadUnlinked()}>Refresh</button>}
            </div>
            {unlinked.length === 0 ? (
              <div className="text-[11px] text-fg-tertiary py-1">No unlinked MB entries.</div>
            ) : (
              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                {unlinked.map(m => (
                  <label key={m.id} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-bg-secondary rounded px-1 py-0.5">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="mt-0.5 accent-accent" />
                    <span className="min-w-0">
                      <span className="text-fg-primary font-semibold">{m.mbNo}</span>
                      {m.pageNo ? <span className="text-fg-tertiary"> / p.{m.pageNo}</span> : null}
                      <span className="text-fg-secondary truncate block">{m.description}</span>
                      <span className="text-fg-tertiary">{m.unit ? `${m.qty} ${m.unit}` : m.qty}{m.rate ? " @ " + fmtRupees(m.rate) : ""} = <span className="font-mono text-fg-primary">{fmtRupees(m.amount ?? 0)}</span></span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selRows.length > 0 && (
              <div className="text-[11px] text-fg-secondary mt-1">Selected {selRows.length} entries · Total <span className="font-mono text-fg-primary font-semibold">{fmtRupees(selTotal)}</span></div>
            )}
          </div>
        </Card>
      )}
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} loading={loading} error={error} emptyMessage="No RA bills." />
    </div>
  );
}

function MbRows({ raBillId, canApprove, run }: { raBillId: string; canApprove: boolean; run: ReturnType<typeof useAction>["run"] }): JSX.Element {
  const [mb, setMb] = useState<RaMbEntry[]>([]);
  const [drift, setDrift] = useState<MbDrift[]>([]);
  const [loading, setLoading] = useState(true);
  const [sum, setSum] = useState<MbSum | null>(null);
  const [sumLoading, setSumLoading] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const client = await getClient(); if (!client) { setLoading(false); return; }
      const res = await listMbForRa(client, raBillId);
      if (live) { if (res.ok) setMb(res.data); setLoading(false); }
    })();
    return () => { live = false; };
  }, [raBillId]);

  useEffect(() => {
    let live = true;
    (async () => {
      const client = await getClient(); if (!client) return;
      const res = await listMbDriftsForRa(client, raBillId);
      if (live) { if (res.ok) setDrift(res.data); }
    })();
    return () => { live = false; };
  }, [raBillId]);

  const handleRecalc = async () => {
    const client = await getClient(); if (!client) return;
    setSumLoading(true);
    const res = await sumMbForRa(client, raBillId);
    if (res.ok) setSum(res.data);
    setSumLoading(false);
  };

  if (loading) return <div className="py-1"><Spinner size={14} /></div>;
  if (mb.length === 0) return <div className="text-[11px] text-fg-tertiary py-1">No linked MB entries.</div>;

  const hasDrifts = drift.length > 0;
  const isBilled = mb.some(m => m.status === "billed");

  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-fg-secondary">Linked MB entries ({mb.length})</span>
        <div className="flex items-center gap-1.5">
          {canApprove && !sumLoading && (
            <Button size="sm" variant="ghost" onClick={handleRecalc}>
              <Icon name="refresh" size={12} /> Recalc from MB
            </Button>
          )}
          {sum && (
            <span className="text-[10px] font-mono text-fg-primary bg-bg-secondary px-1.5 py-0.5 rounded">
              MB total: {fmtRupees(sum.totalAmount)} · {sum.rowCount} rows
            </span>
          )}
        </div>
      </div>

      {hasDrifts && (
        <div className="border-l-2 border-warning bg-warning-tint/20 p-1.5 rounded-r text-[10px] text-warning mb-1" role="alert">
          <div className="font-semibold">⚠ Drift detected ({drift.length})</div>
          {drift.slice(0, 3).map(d => (
            <div key={d.id} className="truncate">{d.changedBy} · {d.changedAt.slice(0, 16)} · {d.mbId.slice(0, 8)}</div>
          ))}
          {drift.length > 3 && <div className="text-warning/70">+{drift.length - 3} more</div>}
        </div>
      )}

      {isBilled && !hasDrifts && (
        <div className="border-l-2 border-success bg-success-tint/20 p-1.5 rounded-r text-[10px] text-success mb-1">
          All MB entries billed — no drift detected.
        </div>
      )}

      <div className="space-y-0.5">
        {mb.map(m => (
          <div key={m.id} className="flex items-center justify-between gap-2 text-[11px] text-fg-secondary">
            <span className="truncate">{m.mbNo} · {m.description}</span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <span className="font-mono text-fg-primary">{fmtRupees(m.amount ?? 0)}</span>
              <Badge tone={m.status === "billed" ? "success" : m.status === "verified" ? "info" : "neutral"}>{m.status}</Badge>
              {canApprove && (
                <button className="text-error hover:opacity-70" onClick={() => void run(`u-${m.id}`, c => unlinkMb(c, m.id), { apply: () => setMb(prev => prev.filter(x => x.id !== m.id)) })}>
                  <Icon name="trash" size={12} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RaRow({ r, canApprove, openPay, setOpenPay, openMb, setOpenMb, projectId, run }: {
  r: RaBill; canApprove: boolean; openPay: string | null; setOpenPay: (v: string | null) => void;
  openMb: string | null; setOpenMb: (v: string | null) => void; projectId: string; run: ReturnType<typeof useAction>["run"];
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-fg-primary truncate">{r.no} · {fmtRupees(r.billAmount)}</div>
      <div className="text-[11px] text-fg-tertiary truncate">{r.subcontractor ?? "—"} · net {fmtRupees(raNetPayable(r))} ({r.retentionPct}% ret)</div>
      <div className="flex items-center gap-3 mt-0.5">
        <button className="text-[11px] text-accent font-semibold hover:opacity-70" onClick={() => setOpenMb(openMb === r.id ? null : r.id)}>
          {openMb === r.id ? "Hide MB ▾" : "MB backing ▸"}
        </button>
        <button className="text-[11px] text-accent font-semibold hover:opacity-70" onClick={() => setOpenPay(openPay === r.id ? null : r.id)}>
          {openPay === r.id ? "Hide payments ▾" : "Payments ▸"}
        </button>
      </div>
      {openPay === r.id && (
        <ReceiptsPanel projectId={projectId} targetType="ra_bill" targetId={r.id} summary={`Net ${fmtRupees(raNetPayable(r))}`} />
      )}
      {openMb === r.id && <MbRows raBillId={r.id} canApprove={canApprove} run={run} />}
    </div>
  );
}