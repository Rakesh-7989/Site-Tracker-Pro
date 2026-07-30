// SiteTrack Pro — project BOQ (Bill of Quantities) tab (v3 port, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert, Icon } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { fmtRupees } from "@/app/financeQueries";
import { listBoq, createBoq, deleteBoq, type BoqItem, type BoqCategory } from "@/app/siteAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { getClient } from "@/lib/supabase";
import { useAction } from "@/hooks/useAction";
const CATS: BoqCategory[] = ["Civil", "MEP", "Finishing", "External", "Other"];
const CAT_OPTS = CATS.map(c => ({ value: c, label: c }));

export function BoqTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("boq:edit", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<BoqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState(""); const [unit, setUnit] = useState(""); const [qty, setQty] = useState(""); const [rate, setRate] = useState(""); const [cat, setCat] = useState<BoqCategory>("Civil");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listBoq(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const q = Number(qty); const r = Number(rate);
    if (!desc.trim() || !(q > 0) || !(r >= 0)) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createBoq(c, { projectId, description: desc.trim(), unit: unit.trim() || undefined, qty: q, rate: r, category: cat, sortOrder: rows.length }), {
      apply: () => setRows(prev => [{ id: tmpId, description: desc.trim(), unit: unit.trim() || undefined, qty: q, rate: r, amount: q * r, category: cat, code: null } as unknown as BoqItem, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setDesc(""); setUnit(""); setQty(""); setRate("");
  };

  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink-900">Bill of Quantities</h2>
        {rows.length > 0 && <div className="text-sm text-ink-600">Total <span className="font-bold text-ink-900">{fmtRupees(total)}</span></div>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[160px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Item description</span><Input className="mt-1" placeholder="e.g. M25 RCC for columns" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Unit</span><Input className="mt-1 w-20" placeholder="cum" value={unit} onChange={e => setUnit(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Qty</span><Input className="mt-1 w-20" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Rate ₹</span><Input className="mt-1 w-24" type="number" value={rate} onChange={e => setRate(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Category</span><Select className="mt-1 w-28" value={cat} onChange={e => setCat(e.target.value as BoqCategory)} options={CAT_OPTS} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !desc.trim() || !qty || !rate}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No BOQ items yet.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{r.code ? `${r.code} · ` : ""}{r.description}</div>
                <div className="text-[11px] text-ink-400">{[r.qty != null && `${r.qty}${r.unit ? " " + r.unit : ""}`, r.rate != null && `@ ${fmtRupees(r.rate)}`].filter(Boolean).join(" · ")}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge tone="neutral">{r.category}</Badge>
                <span className="text-sm font-semibold text-ink-900 w-24 text-right">{r.amount != null ? fmtRupees(r.amount) : "—"}</span>
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteBoq(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
