// SiteTrack Pro — FF&E schedule tab (v4 D3, architecture segment).
// Furniture/fixture/equipment schedule register for design/interior projects.
// create/edit/delete → ffe:manage; plan gated by PlanFeature "ffe" at the tab
// level (tabs-config). Status + costs follow the ffe_entries CHECK (151).
// Full budget rollup: committed (non-cancelled qty×unit_cost) vs procured, plus
// a per-space breakdown.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getClient } from "@/lib/supabase";
import { useCan, useOrgSwitcher } from "@/auth";
import { useAction } from "@/hooks/useAction";
import { Card, Button, Badge, Spinner, Alert } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import {
  listFfeEntries, upsertFfeEntry, setFfeStatus, deleteFfeEntry,
  ffeBudgetRollup, FFE_CATEGORIES,
  type FfeEntry, type FfeCategory, type FfeStatus,
} from "@/app/ffeQueries";
import { listProjectQuotes, bestQuote, quoteTotal, type ProcurementQuote } from "@/app/procurementQuotes";
import { listPOs, type PurchaseOrder } from "@/app/financeQueries";
import { localDateISO } from "@/lib/dateLocal";

const STATUS_TONE: Record<FfeStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  specified: "neutral", selected: "info", ordered: "warning", installed: "success", cancelled: "danger",
};
const STATUS_LABEL: Record<FfeStatus, string> = {
  specified: "Specified", selected: "Selected", ordered: "Ordered", installed: "Installed", cancelled: "Cancelled",
};
const CATEGORY_LABEL: Record<FfeCategory, string> = {
  furniture: "Furniture", fixture: "Fixture", equipment: "Equipment",
};
const NEXT: Record<FfeStatus, FfeStatus> = {
  specified: "selected", selected: "ordered", ordered: "installed", installed: "installed", cancelled: "specified",
};
const formatINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const EMPTY = {
  code: "", category: "furniture" as FfeCategory, name: "", spaceOrRoom: "",
  manufacturer: "", model: "", finish: "", dimensions: "", qty: "1", unitCost: "", notes: "",
};

export function FfeTab({ projectId }: { projectId: string }): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("ffe:manage", { orgId: activeOrg?.orgId, projectId });

  const [rows, setRows] = useState<FfeEntry[]>([]);
  const [quotes, setQuotes] = useState<ProcurementQuote[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const [ffeRes, qRes, poRes] = await Promise.all([
      listFfeEntries(client, projectId),
      listProjectQuotes(client, projectId),
      listPOs(client, projectId),
    ]);
    if (ffeRes.ok) setRows(ffeRes.data); else setError(ffeRes.error);
    if (qRes.ok) setQuotes(qRes.data);
    if (poRes.ok) setPos(poRes.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void reload(); }, [reload]);

  const { busy, run } = useAction(reload, setError);

  const save = async () => {
    if (!form.name.trim()) return;
    const isEdit = !!editingId;
    const prev = rows;
    const optimistic: FfeEntry = {
      id: editingId ?? "tmp-" + Date.now(),
      code: form.code.trim(),
      category: form.category,
      name: form.name.trim(),
      spaceOrRoom: form.spaceOrRoom.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      finish: form.finish.trim() || null,
      dimensions: form.dimensions.trim() || null,
      qty: Math.max(1, Number(form.qty) || 1),
      unitCost: Math.max(0, Number(form.unitCost) || 0),
      status: "specified",
      notes: form.notes.trim() || null,
      createdAt: "",
    };
    await run(isEdit ? "edit" : "add", c => upsertFfeEntry(c, {
      id: editingId, projectId,
      code: form.code.trim(), category: form.category, name: form.name.trim(),
      spaceOrRoom: form.spaceOrRoom.trim() || null, manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null, finish: form.finish.trim() || null,
      dimensions: form.dimensions.trim() || null, qty: Math.max(1, Number(form.qty) || 1),
      unitCost: Math.max(0, Number(form.unitCost) || 0), notes: form.notes.trim() || null,
    }), {
      apply: () => setRows(prev =>
        isEdit ? prev.map(x => x.id === editingId ? optimistic : x) : [optimistic, ...prev]),
      rollback: () => setRows(prev),
    });
    setForm(EMPTY); setEditingId(null);
  };

  const toggle = async (e: FfeEntry) => {
    const next = NEXT[e.status];
    const prevRows = rows;
    await run(`s-${e.id}`, c => setFfeStatus(c, e.id, next), {
      apply: () => setRows(prev => prev.map(x => x.id === e.id ? { ...x, status: next } : x)),
      rollback: () => setRows(prevRows),
    });
  };

  const remove = async (e: FfeEntry) => {
    const prevRows = rows;
    await run(`d-${e.id}`, c => deleteFfeEntry(c, e.id), {
      apply: () => setRows(prev => prev.filter(x => x.id !== e.id)),
      rollback: () => setRows(prevRows),
    });
  };

  const rollup = ffeBudgetRollup(rows);
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const today = localDateISO();
  const poByQuote = new Map(pos.filter(p => p.quoteId).map(p => [p.quoteId as string, p]));
  const entryProc = (e: FfeEntry): { count: number; best: string | null; po: PurchaseOrder | null } => {
    const mine = quotes.filter(q => q.ffeEntryId === e.id);
    const best = bestQuote(mine, today);
    const po = mine.map(q => poByQuote.get(q.id)).find((p): p is PurchaseOrder => !!p) ?? null;
    return { count: mine.length, best: best ? formatINR(quoteTotal(best)) : null, po };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-fg-primary">FF&E Schedule</h2>
        {rows.length > 0 && <span className="text-sm text-fg-secondary">{rows.filter(e => e.status === "installed").length}/{rows.length} installed</span>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Committed</div>
          <div className="text-xl font-bold text-fg-primary">{formatINR(rollup.committed)}</div>
          <div className="text-[11px] text-fg-tertiary">{rollup.count} entries</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Procured</div>
          <div className="text-xl font-bold text-accent">{formatINR(rollup.procured)}</div>
          <div className="text-[11px] text-fg-tertiary">selected / ordered / installed</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">By space</div>
          {rollup.bySpace.length === 0 ? (
            <div className="text-sm text-fg-tertiary">No entries yet.</div>
          ) : (
            <div className="space-y-0.5">
              {rollup.bySpace.slice(0, 4).map(b => (
                <div key={b.space} className="flex justify-between text-[12px]">
                  <span className="text-fg-secondary truncate pr-2">{b.space}</span>
                  <span className="font-semibold text-fg-primary">{formatINR(b.committed)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {canManage && (
        <Card className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Name</span>
            <Input className="mt-1" placeholder="e.g. Auditorium chairs" value={form.name} onChange={e => set("name")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Category</span>
            <Select className="mt-1" options={FFE_CATEGORIES.map(c => ({ value: c, label: CATEGORY_LABEL[c] }))} value={form.category} onChange={e => set("category")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Space / room</span>
            <Input className="mt-1" placeholder="e.g. Lobby" value={form.spaceOrRoom} onChange={e => set("spaceOrRoom")(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Qty</span>
              <Input className="mt-1" type="number" min={1} value={form.qty} onChange={e => set("qty")(e.target.value)} />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Unit cost</span>
              <Input className="mt-1" type="number" min={0} prefix="₹" value={form.unitCost} onChange={e => set("unitCost")(e.target.value)} />
            </div>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Code</span>
            <Input className="mt-1" placeholder="e.g. F-01" value={form.code} onChange={e => set("code")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Manufacturer</span>
            <Input className="mt-1" value={form.manufacturer} onChange={e => set("manufacturer")(e.target.value)} />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Model</span>
            <Input className="mt-1" value={form.model} onChange={e => set("model")(e.target.value)} />
          </div>
          <div className="flex gap-2 items-end">
            <Button className="flex-1" onClick={() => void save()} disabled={busy === "add" || busy === "edit" || !form.name.trim()}>
              {busy === "add" || busy === "edit" ? <Spinner size={14} /> : editingId ? "Save" : "Add"}
            </Button>
            {editingId && <Button variant="ghost" onClick={() => { setForm(EMPTY); setEditingId(null); }}>Cancel</Button>}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid place-items-center py-10"><Spinner size={22} /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-fg-secondary">No FF&E entries yet.{canManage ? " Add the first one above." : ""}</div>
      ) : (
        <div className="space-y-2">
          {rows.map(e => (
            <Card key={e.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-fg-primary truncate">{e.name}</span>
                    <Badge tone="neutral">{CATEGORY_LABEL[e.category]}</Badge>
                    {e.code && <Badge tone="neutral">{e.code}</Badge>}
                  </div>
                  <div className="text-[11px] text-fg-tertiary">
                    {e.qty} × {formatINR(e.unitCost)} = <span className="font-semibold text-fg-primary">{formatINR(e.qty * e.unitCost)}</span>
                    {e.spaceOrRoom && ` · ${e.spaceOrRoom}`}
                    {e.manufacturer && ` · ${e.manufacturer}`}
                    {e.model && ` · ${e.model}`}
                  </div>
                  {(e.finish || e.dimensions || e.notes) && (
                    <div className="text-[11px] text-fg-tertiary">
                      {[e.finish, e.dimensions].filter(Boolean).join(" · ")}
                      {e.notes && <span className="block">{e.notes}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(() => { const p = entryProc(e); return p.count > 0 && (
                    <Link to="/procurement" className="text-[11px] font-semibold text-accent hover:text-accent-2 underline-offset-2 hover:underline">
                      {p.po ? `PO ${p.po.poNo} · ${formatINR(p.po.amount)}` : `${p.count} quote${p.count === 1 ? "" : "s"} · best ${p.best ?? "—"}`}
                    </Link>
                  ); })()}
                  {canManage ? (
                    <button type="button" disabled={busy === `s-${e.id}`} onClick={() => void toggle(e)} title="Advance status">
                      <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                    </button>
                  ) : (
                    <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                  )}
                  {canManage && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => {
                        setEditingId(e.id);
                        setForm({ code: e.code, category: e.category, name: e.name, spaceOrRoom: e.spaceOrRoom ?? "", manufacturer: e.manufacturer ?? "", model: e.model ?? "", finish: e.finish ?? "", dimensions: e.dimensions ?? "", qty: String(e.qty), unitCost: String(e.unitCost), notes: e.notes ?? "" });
                      }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(e)}>
                        <IconTrash />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function IconTrash() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-error"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>;
}