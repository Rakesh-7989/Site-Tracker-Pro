// SiteTrack Pro — monthly statement view (v4 Phase D backlog).
// Org-wide financial summary for a given month across the caller's member
// projects. Mirrors the RevenueView org-rollup pattern.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClient } from "@/lib/supabase";
import { useOrgSwitcher, useCan } from "@/auth";
import { Card, Spinner, Alert, AccessDenied } from "@/components/ui/atoms";
import { Select } from "@/components/ui/forms";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { fmtRupees } from "@/app/financeQueries";
import { listOrgMonthlyStatement, monthlyStatementTotals, type MonthlyStatementRow } from "@/app/monthlyStatementQueries";
import { currentMonthRange } from "@/lib/dateLocal";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "consultant", label: "Consultant" },
  { value: "design", label: "Design" },
  { value: "construction", label: "Construction" },
  { value: "interior", label: "Interior" },
];

export function MonthlyStatementView(): JSX.Element {
  return <MonthlyStatementInner />;
}

function MonthlyStatementInner(): JSX.Element {
  const { activeOrg } = useOrgSwitcher();
  const ctx = { orgId: activeOrg?.orgId };
  const canView = useCan("budget:view", ctx) || useCan("revenue:view", ctx);

  const [rows, setRows] = useState<MonthlyStatementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [month, setMonth] = useState(() => currentMonthRange().from.slice(0, 7)); // YYYY-MM

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    if (!activeOrg?.orgId) { setError("No active organization."); setLoading(false); return; }
    const range = currentMonthRange();
    const monthStart = month ? `${month}-01` : range.from;
    const monthEnd = month ? `${month}-${new Date(Number(month.slice(0,4)), Number(month.slice(5)), 0).getDate()}` : range.to;
    const res = await listOrgMonthlyStatement(client, activeOrg.orgId, monthStart, monthEnd);
    if (res.ok) setRows(res.data); else setError(res.error);
    setLoading(false);
  }, [activeOrg?.orgId, month]);

  useEffect(() => { void reload(); }, [reload]);

  const totals = useMemo(() => monthlyStatementTotals(rows), [rows]);
  const shown = filter === "all" ? rows : rows.filter(r => r.type === filter);

  if (!canView) return <AccessDenied message="You don't have permission to view the monthly statement." />;

  const columns: Column<MonthlyStatementRow>[] = [
    {
      key: "name", header: "Project", className: "flex-1 min-w-0",
      render: r => (
        <div>
          <div className="font-display font-semibold text-fg-primary tracking-editorial text-sm">{r.name}</div>
          <div className="text-[11px] text-fg-secondary capitalize">{r.type ?? "—"}</div>
        </div>
      ),
    },
    { key: "invoicedPhase", header: "Phase Invoices", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.invoicedPhase)}</span> },
    { key: "invoicedHourly", header: "Hourly Invoices", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.invoicedHourly)}</span> },
    { key: "invoicedRetainer", header: "Retainer Invoices", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.invoicedRetainer)}</span> },
    { key: "invoicedTotal", header: "Total Invoiced", className: "flex-shrink-0 text-right", render: r => <span className="text-sm font-mono">{fmtRupees(r.invoicedTotal)}</span> },
    { key: "mrr", header: "Retainer MRR", className: "flex-shrink-0 text-right", render: r => <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-success-tint text-success">{fmtRupees(r.mrr)}</span> },
    { key: "expenses", header: "Expenses", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.expenses)}</span> },
    { key: "raBills", header: "RA Bills", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.raBills)}</span> },
    { key: "poReceipts", header: "PO Receipts", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-secondary">{fmtRupees(r.poReceipts)}</span> },
    { key: "billableHours", header: "Billable Hrs", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-tertiary">{r.billableHours.toFixed(1)}</span> },
    { key: "billedValue", header: "Billed Value", hideOnMobile: true, className: "flex-shrink-0 text-right", render: r => <span className="text-xs text-fg-tertiary">{fmtRupees(Math.round(r.billedValue))}</span> },
  ];

  return (
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3 border-b border-default">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-warning mb-2">— Finance</div>
        <h1 className="font-display text-4xl font-light text-fg-primary tracking-editorial leading-none">Monthly Statement</h1>
        <p className="text-fg-secondary text-sm mt-2">Consolidated invoicing, retainers, expenses, RA bills, procurement receipts, and consultancy billable effort for the selected month.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-3 items-end mb-6">
        <Select className="w-48" value={month} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMonth(e.target.value)} options={generateMonthOptions(12)} />
        <Select className="w-48" value={filter} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value)} options={FILTER_OPTIONS} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Projects</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Invoiced</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(totals.invoicedTotal)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Retainer MRR</div><div className="font-display text-2xl font-bold text-success mt-1">{fmtRupees(totals.mrr)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">Expenses</div><div className="font-display text-2xl font-bold text-warning mt-1">{fmtRupees(totals.expenses)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">RA Bills</div><div className="font-display text-2xl font-bold text-info mt-1">{fmtRupees(totals.raBills)}</div></Card>
        <Card className="p-4"><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-fg-tertiary">PO Receipts</div><div className="font-display text-2xl font-bold text-fg-primary mt-1">{fmtRupees(totals.poReceipts)}</div></Card>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16"><Spinner size={22} /></div>
      ) : shown.length === 0 ? (
        <Card className="p-10 text-center text-sm text-fg-secondary">
          No financial data for the selected month. Add invoices, expenses, RA bills, or retainers to see them here.
        </Card>
      ) : (
        <div className="bg-panel rounded-2xl overflow-hidden shadow-editorial border-default">
          <DataTable columns={columns} rows={shown} rowKey={r => r.projectId} />
        </div>
      )}
    </div>
  );
}

function generateMonthOptions(count: number): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const y = d.getFullYear();
    opts.push({ value: `${y}-${m}`, label: d.toLocaleString("en-IN", { month: "short", year: "numeric" }) });
  }
  return opts;
}