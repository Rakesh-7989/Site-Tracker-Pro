// SiteTrack Pro — project Budget / Expenses tab (v3 port, Batch 3, DB-wired).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, StatCard } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { listExpenses, createExpense, setExpenseStatus, deleteExpense, fmtRupees, type Expense, type ExpenseStatus } from "@/app/queries/financeQueries";

 
import { getClient } from "@/lib/supabase/supabase";
import { useAction } from "@/hooks/useAction";
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
  const [cat, setCat] = useState("material"); const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [paidTo, setPaidTo] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient(); if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await listExpenses(client, projectId); if (res.ok) setRows(res.data); else setError(res.error); setLoading(false);
  }, [projectId]);
  useEffect(() => { void reload(); }, [reload]);
  const { busy, run } = useAction(reload, setError);
  const add = async () => {
    const amt = Number(amount);
    if (!desc.trim() || !Number.isFinite(amt) || amt <= 0 || !session) return;
    const tmpId = "tmp-" + Date.now();
    await run("add", c => createExpense(c, { projectId, category: cat, description: desc.trim(), amount: amt, paidTo: paidTo.trim() || undefined, recordedBy: session.user.id }), {
      apply: () => setRows(prev => [{ id: tmpId, category: cat, description: desc.trim(), amount: amt, paidTo: paidTo.trim() || null, expenseDate: new Date().toISOString().slice(0, 10), status: "recorded" as ExpenseStatus }, ...prev]),
      rollback: () => setRows(prev => prev.filter(x => x.id !== tmpId)),
    });
    setDesc(""); setAmount(""); setPaidTo("");
  };

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-fg-primary">Budget &amp; expenses</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {rows.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><StatCard icon="credit-card" label="Total spent" value={fmtRupees(total)} accent="orange" /><StatCard icon="doc" label="Entries" value={rows.length} accent="blue" /></div>}
      {canEdit && (
        <Card className="p-3 flex gap-2 flex-wrap items-end">
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Category</span><Select fit className="mt-1 w-auto" value={cat} onChange={e => setCat(e.target.value)} options={CAT} /></div>
          <div className="flex-1 min-w-[140px]"><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Description</span><Input className="mt-1" placeholder="e.g. Excavator rent" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Amount ₹</span><Input fit className="mt-1 w-28" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Paid to</span><Input fit className="mt-1 w-28" value={paidTo} onChange={e => setPaidTo(e.target.value)} /></div>
          <Button onClick={() => void add()} disabled={busy === "add" || !desc.trim() || !amount}>{busy === "add" ? <Spinner size={14} /> : "Add"}</Button>
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
        : rows.length === 0 ? <div className="text-sm text-fg-secondary">No expenses recorded.</div>
        : <div className="space-y-2">{rows.map(r => (
            <Card key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="text-sm font-semibold text-fg-primary truncate">{fmtRupees(r.amount)} · <span className="font-normal capitalize">{r.category}</span></div>
                <div className="text-[11px] text-fg-tertiary truncate">{r.description}{r.paidTo ? ` → ${r.paidTo}` : ""}{r.expenseDate ? ` · ${r.expenseDate}` : ""}</div></div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? <Select fit className="w-auto text-xs" value={r.status} onChange={e => { const v = e.target.value as ExpenseStatus; void run(`s-${r.id}`, c => setExpenseStatus(c, r.id, v), { apply: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: v } : x)), rollback: () => setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x)) }); }} options={STT} />
                  : <span className="text-xs text-fg-secondary">{r.status}</span>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => void run(`d-${r.id}`, c => deleteExpense(c, r.id), { apply: () => setRows(prev => prev.filter(x => x.id !== r.id)), rollback: () => setRows(prev => [...prev, r]) })}><span className="text-error">✕</span></Button>}
              </div>
            </Card>))}</div>}
    </div>
  );
}
