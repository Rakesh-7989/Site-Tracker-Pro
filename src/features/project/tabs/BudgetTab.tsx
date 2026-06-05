// SiteTrack Pro — project Budget / Expenses tab (v3 port, Batch 3, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon, StatCard } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listExpenses, createExpense, setExpenseStatus, deleteExpense, fmtRupees, type Expense, type ExpenseStatus } from "@/app/financeQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getClient(): Promise<any | null> { const mod = await import("../../../lib/supabase.js"); /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ return await (mod as any).getSupabaseClient(); }
const CAT = [{ value: "material", label: "Material" }, { value: "labour", label: "Labour" }, { value: "equipment", label: "Equipment" }, { value: "admin", label: "Admin" }, { value: "permit", label: "Permit" }, { value: "other", label: "Other" }];
const STT = [{ value: "recorded", label: "Recorded" }, { value: "reimbursed", label: "Reimbursed" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "disputed", label: "Disputed" }];

export function BudgetTab({ projectId }: { projectId: string }): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId, projectId };
  const canEdit = useCan("expense:add", ctx);
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cat, setCat] = useState("material"); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [paidTo, setPaidTo] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listExpenses(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const run = useCallback(async (k: string, fn: (c: unknown) => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(k); setError(null); const client = await getClient(); if (!client) { setError("Backend not configured."); setBusy(null); return; }
    const res = await fn(client); if (!res.ok) setError(res.error ?? "Action failed."); await reload(); setBusy(null);
  }, [reload]);
  const add = async () => { const amt = Number(amount); if (!desc.trim() || !Number.isFinite(amt) || amt <= 0 || !session) return; await run("add", c => createExpense(c, { projectId, category: cat, description: desc.trim(), amount: amt, paidTo: paidTo.trim() || undefined, recordedBy: session.user.id })); setDesc(""); setAmount(""); setPaidTo(""); };

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-ink-900">Budget &amp; expenses</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {rows.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><StatCard icon="credit-card" label="Total spent" value={fmtRupees(total)} accent="orange" /><StatCard icon="doc" label="Entries" value={rows.length} accent="blue" /></div>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Category</span><Select className="mt-1 w-auto" value={cat} onChange={e => setCat(e.target.value)} options={CAT} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Description</span><Input className="mt-1" placeholder="e.g. Excavator rent" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Amount ₹</span><Input className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Paid to</span><Input className="mt-1 w-28" value={paidTo} onChange={e => setPaidTo(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !desc.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
        </Card>
      )}
      {loading ? <div className="grid place-items-center py-10"><Spinner size={22} /></div>
        : rows.length === 0 ? <div className="text-sm text-ink-500">No expenses recorded.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-ink-800 truncate">{fmtRupees(r.amount)} · <span className="font-normal capitalize">{r.category}</span></div>
                <div className="text-[11px] text-ink-400 truncate">{r.description}{r.paidTo ? ` → ${r.paidTo}` : ""}{r.expenseDate ? ` · ${r.expenseDate}` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select className="w-auto text-xs" value={r.status} onChange={e => void run(`s-${r.id}`, c => setExpenseStatus(c, r.id, e.target.value as ExpenseStatus))} options={STT} />
                  : <span className="text-xs text-ink-500">{r.status}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteExpense(c, r.id))}><Icon name="trash" size={14} className="text-rose-500" /></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
