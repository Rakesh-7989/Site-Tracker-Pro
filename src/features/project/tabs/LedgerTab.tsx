// SiteTrack Pro — project Inventory Ledger tab (v3 port, Batch 3, DB-wired).
// ST-018 depth: stock summary w/ tones, issue-to recipient, actor + notes, CSV export.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listLedger, createLedgerTxn, deleteLedgerTxn, stockRows, type LedgerTxn, type LedgerDirection } from "@/app/queries/financeQueries";
import { buildCsv, downloadCsv, csvDateStamp } from "@/lib/utils/genericCsv";

 
import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";
const DIR = [{ value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }, { value: "return", label: "Return" }, { value: "wastage", label: "Wastage" }];
const dirTone = (d: LedgerDirection): "success" | "warning" | "danger" | "info" => (d === "inward" ? "success" : d === "outward" ? "info" : d === "return" ? "warning" : "danger");
const LEVEL_TONE: Record<"out" | "low" | "ok", "danger" | "warning" | "success"> = { out: "danger", low: "warning", ok: "success" };
const LEVEL_LABEL: Record<"out" | "low" | "ok", string> = { out: "Out of stock", low: "Zero stock", ok: "In stock" };
const LEVEL_ORDER: Record<"out" | "low" | "ok", number> = { out: 0, low: 1, ok: 2 };
const LEDGER_CSV_COLUMNS: ReadonlyArray<{ key: string; label?: string }> = [
  { key: "id" }, { key: "txn_date", label: "Date" }, { key: "material" }, { key: "unit" }, { key: "qty" },
  { key: "direction" }, { key: "source" }, { key: "ref_no", label: "Ref" }, { key: "issued_to", label: "Issued to" },
  { key: "notes" }, { key: "recorded_by", label: "Recorded by" },
];

export function LedgerTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canEdit = useCan("material:add", { orgId: activeOrg?.orgId, projectId });
  const [rows, setRows] = useState<LedgerTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mat, setMat] = useState(""); const [unit, setUnit] = useState(""); const [qty, setQty] = useState(""); const [dir, setDir] = useState<LedgerDirection>("inward"); const [to, setTo] = useState(""); const [notes, setNotes] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listLedger(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const q = Number(qty);
    if (!mat.trim() || !Number.isFinite(q) || q <= 0 || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createLedgerTxn(c, { projectId, material: mat.trim(), unit: unit.trim() || undefined, qty: q, direction: dir, issuedTo: to.trim() || null, notes: notes.trim() || null, recordedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, txnDate: new Date().toISOString().slice(0, 10), material: mat.trim(), unit: unit.trim() || null, qty: q, direction: dir, source: null, refNo: null, issuedTo: to.trim() || null, notes: notes.trim() || null, recordedByName: null }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setMat(""); setUnit(""); setQty(""); setTo(""); setNotes("");
  };

  const stock = useMemo(() => stockRows(rows).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.material.localeCompare(b.material)), [rows]);

  const exportCsv = () => {
    const content = buildCsv(
      rows.map(r => ({ id: r.id, txn_date: r.txnDate, material: r.material, unit: r.unit ?? "", qty: r.qty, direction: r.direction, source: r.source ?? "", ref_no: r.refNo ?? "", issued_to: r.issuedTo ?? "", notes: r.notes ?? "", recorded_by: r.recordedByName ?? "" })),
      LEDGER_CSV_COLUMNS,
    );
    downloadCsv(`ledger-${projectId}-${csvDateStamp()}.csv`, content);
  };

  const showsRecipient = dir === "outward" || dir === "return" || dir === "wastage";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-fg-primary">Inventory ledger</h2>
        {rows.length > 0 && <Button size="sm" variant="secondary" leftIcon="download" onClick={exportCsv}>Export CSV</Button>}
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {stock.length > 0 && (
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary mb-2">Current stock</div>
          <div className="flex flex-wrap gap-2">
            {stock.map(s => (
              <span key={s.material} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] bg-bg-secondary text-fg-primary">
                <span className="font-semibold">{s.material}</span>: <b>{s.balance}</b>{s.unit ? ` ${s.unit}` : ""}
                <Badge tone={LEVEL_TONE[s.level]}>{LEVEL_LABEL[s.level]}</Badge>
              </span>
            ))}
          </div>
        </Card>
      )}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Material</span><Input className="mt-1" value={mat} onChange={e => setMat(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Unit</span><Input fit className="mt-1 w-20" placeholder="bag" value={unit} onChange={e => setUnit(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span><Input fit className="mt-1 w-20" type="number" value={qty} onChange={e => setQty(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Direction</span><Select fit className="mt-1 w-auto" value={dir} onChange={e => setDir(e.target.value as LedgerDirection)} options={DIR} /></div>
          {showsRecipient && <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Issued to</span><Input className="mt-1" placeholder="e.g. Contractor Ravi" value={to} onChange={e => setTo(e.target.value)} /></div>}
          {showsRecipient && <div className="flex-1 min-w-[120px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Notes</span><Input className="mt-1" placeholder="e.g. slab pour, block B" value={notes} onChange={e => setNotes(e.target.value)} /></div>}
          <Button onClick={() => void add()} disabled={busy === "add" || !mat.trim() || !qty}>{busy === "add" ? <Spinner size={14} /> : "Record"}</Button>
        </Card>
      )}
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
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No transactions.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate flex items-center gap-2"><Badge tone={dirTone(r.direction)}>{r.direction}</Badge>{r.material} · {r.qty}{r.unit ? ` ${r.unit}` : ""}</div>
                <div className="text-[11px] text-fg-tertiary">{r.txnDate}{r.refNo ? ` · ${r.refNo}` : ""}{r.issuedTo ? ` · → ${r.issuedTo}` : ""}{r.recordedByName ? ` · by ${r.recordedByName}` : ""}{r.notes ? ` · ${r.notes}` : ""}</div></div>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteLedgerTxn(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><span className="text-error">✕</span></Button>}
            </Card>))}</div>}
    </div>
  );
}