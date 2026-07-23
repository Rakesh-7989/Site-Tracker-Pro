// SiteTrack Pro â€” project Inventory Ledger tab (v3 port, Batch 3, DB-wired).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listLedger, createLedgerTxn, deleteLedgerTxn, stockBalance, type LedgerTxn, type LedgerDirection } from "@/app/financeQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
const DIR = [{ value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }, { value: "return", label: "Return" }, { value: "wastage", label: "Wastage" }];
const dirTone = (d: LedgerDirection): "success" | "warning" | "danger" | "info" => (d === "inward" ? "success" : d === "outward" ? "info" : d === "return" ? "warning" : "danger");

export function LedgerTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("material:add", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<LedgerTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mat, setMat] = useState(""); const [unit, setUnit] = useState(""); const [qty, setQty] = useState(""); const [dir, setDir] = useState<LedgerDirection>("inward");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLedger(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { const q = Number(qty); if (!mat.trim() || !Number.isFinite(q) || q <= 0 || !session) return; await run("add", c => createLedgerTxn(c, { projectId, material: mat.trim(), unit: unit.trim() || undefined, qty: q, direction: dir, recordedBy: session.user.id })); setMat(""); setUnit(""); setQty(""); };

  const balance = useMemo(() => [...stockBalance(rows).entries()].filter(([, v]) => v !== 0), [rows]);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Inventory ledger</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {balance.length > 0 && (
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2">Current stock</div>
          <div className="flex flex-wrap gap-2">{balance.map(([m, v]) => <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-cream-100 text-ink-700">{m}: <b>{v}</b></span>)}</div>
        </Card>
      )}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Material</span><Input className="mt-1" value={mat} onChange={e => setMat(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Unit</span><Input className="mt-1 w-20" placeholder="bag" value={unit} onChange={e => setUnit(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Qty</span><Input className="mt-1 w-20" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Direction</span><Select className="mt-1 w-auto" value={dir} onChange={e => setDir(e.target.value as LedgerDirection)} options={DIR} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !mat.trim() || !qty}>{busy === "add" ? <Spinner size={14} /> : "Record"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No transactions.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate flex items-center gap-2"><Badge tone={dirTone(r.direction)}>{r.direction}</Badge>{r.material} Â· {r.qty}{r.unit ? ` ${r.unit}` : ""}</div>
                <div className="text-[11px] text-ink-400">{r.txnDate}{r.refNo ? ` Â· ${r.refNo}` : ""}</div></div>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteLedgerTxn(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
            </Card>))}</div>}
    </div>
  );
}
