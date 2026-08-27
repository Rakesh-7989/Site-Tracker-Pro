// SiteTrack Pro — Cross-project analytics & rollups (v6 Phase 4).
// Org-wide KPIs across caller's member projects: budget vs actual, cash flow,
// project P&L, WIP, resource allocation, executive dashboard.

import { raNetPayable } from "./financeQueries";
import { netReceivable } from "./crossInvoiceQueries";
import type { MemberProjectScope } from "./queries";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

const PROJECT_TYPES = ["construction", "architecture", "interior", "consultancy", "design"] as const;

export interface ProjectBrief { id: string; name: string; type: string | null; budget?: number; }

// ── KPI Rollups ────────────────────────────────────────────────────────────

export interface ProjectKPIs {
  projectId: string;
  projectName: string;
  projectType: string | null;
  // Budget vs Actual
  budget: number;
  expenses: number;
  poCommitted: number;
  raBilled: number;
  invoiced: number;
  received: number;
  // Cash flow
  cashIn: number;       // invoiced received + RA paid
  cashOut: number;      // expenses + PO + RA paid
  netCashFlow: number;
  // P&L (simplified)
  revenue: number;      // invoiced net + RA billed net
  cost: number;         // expenses + PO committed + RA paid
  grossMargin: number;
  grossMarginPct: number;
  // WIP
  wipValue: number;     // work done but not billed
  // Status
  health: "green" | "amber" | "red";
}

export interface OrgKPIRollup {
  projectCount: number;
  totalBudget: number;
  totalExpenses: number;
  totalPOCommitted: number;
  totalRABilled: number;
  totalInvoiced: number;
  totalReceived: number;
  totalCashIn: number;
  totalCashOut: number;
  totalNetCashFlow: number;
  totalRevenue: number;
  totalCost: number;
  totalGrossMargin: number;
  totalGrossMarginPct: number;
  byType: Record<string, { count: number; revenue: number; cost: number; margin: number }>;
  byHealth: Record<"green" | "amber" | "red", number>;
}

// Pure: compute project health from margins and cash flow
export function computeHealth(k: ProjectKPIs): "green" | "amber" | "red" {
  if (k.grossMarginPct >= 15 && k.netCashFlow >= 0) return "green";
  if (k.grossMarginPct >= 5 && k.netCashFlow > -k.budget * 0.1) return "amber";
  return "red";
}

// Pure: org-wide rollup
export function orgKPIRollup(projects: ProjectKPIs[]): OrgKPIRollup {
  const rollup: OrgKPIRollup = {
    projectCount: projects.length,
    totalBudget: 0,
    totalExpenses: 0,
    totalPOCommitted: 0,
    totalRABilled: 0,
    totalInvoiced: 0,
    totalReceived: 0,
    totalCashIn: 0,
    totalCashOut: 0,
    totalNetCashFlow: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalGrossMargin: 0,
    totalGrossMarginPct: 0,
    byType: {},
    byHealth: { green: 0, amber: 0, red: 0 },
  };
  for (const p of projects) {
    rollup.totalBudget += p.budget;
    rollup.totalExpenses += p.expenses;
    rollup.totalPOCommitted += p.poCommitted;
    rollup.totalRABilled += p.raBilled;
    rollup.totalInvoiced += p.invoiced;
    rollup.totalReceived += p.received;
    rollup.totalCashIn += p.cashIn;
    rollup.totalCashOut += p.cashOut;
    rollup.totalNetCashFlow += p.netCashFlow;
    rollup.totalRevenue += p.revenue;
    rollup.totalCost += p.cost;
    rollup.totalGrossMargin += p.grossMargin;
    rollup.byHealth[p.health] += 1;
    const t = p.projectType ?? "other";
    if (!rollup.byType[t]) rollup.byType[t] = { count: 0, revenue: 0, cost: 0, margin: 0 };
    rollup.byType[t].count += 1;
    rollup.byType[t].revenue += p.revenue;
    rollup.byType[t].cost += p.cost;
    rollup.byType[t].margin += p.grossMargin;
  }
  rollup.totalGrossMarginPct = rollup.totalRevenue > 0 ? Math.round((rollup.totalGrossMargin / rollup.totalRevenue) * 100) : 0;
  return rollup;
}

// ── Query Mappers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectsWithBudget(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<ProjectBrief[]>> {
  try {
    let q = client
      .from("projects")
      .select("id, name, type, budget")
      .eq("org_id", orgId);
    if (scope.mode === "member") {
      // PostgREST ignores `IN ()` on an empty array — short-circuit instead.
      if (scope.projectIds.length === 0) return ok([]);
      q = q.in("id", scope.projectIds);
    }
    const { data, error } = await q.in("type", [...PROJECT_TYPES]);
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), type: r.type == null ? null : String(r.type),
      budget: Number(r.budget ?? 0),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgProjectKPIs(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<ProjectKPIs[]>> {
  try {
    // 1. Projects with budgets
    const projectsRes = await listProjectsWithBudget(client, orgId, scope);
    if (!projectsRes.ok) return projectsRes;
    if (projectsRes.data.length === 0) return ok([]);
    const ids = projectsRes.data.map(p => p.id);
    const nameById = new Map(projectsRes.data.map(p => [p.id, { name: p.name, type: p.type, budget: p.budget }]));

    // 2. Parallel fetch all financial data for these projects
    const [
      expensesRes,
      poRes,
      raRes,
      invoiceRes,
      paymentRes,
      raPaymentRes,
    ] = await Promise.all([
      client.from("expenses").select("project_id, amount, status").in("project_id", ids),
      client.from("purchase_orders").select("project_id, amount, status").in("project_id", ids),
      client.from("ra_bills").select("project_id, bill_amount, retention_pct, paid_amount, status, bill_date").in("project_id", ids),
      client.from("invoices").select("id, project_id, amount, gst, tds, status, issued_date, due_date").in("project_id", ids),
      client.from("payments").select("project_id, amount, target_type, target_id, received_on").in("project_id", ids).eq("target_type", "invoice"),
      client.from("payments").select("project_id, amount, target_type, target_id, received_on").in("project_id", ids).eq("target_type", "ra_bill"),
    ]);

    if (expensesRes.error) return dbe(expensesRes.error);
    if (poRes.error) return dbe(poRes.error);
    if (raRes.error) return dbe(raRes.error);
    if (invoiceRes.error) return dbe(invoiceRes.error);
    if (paymentRes.error) return dbe(paymentRes.error);
    if (raPaymentRes.error) return dbe(raPaymentRes.error);

    // 3. Aggregate by project
    const expenseByProject = new Map<string, number>();
    for (const r of (expensesRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      if (!["rejected", "cancelled"].includes(String(r.status ?? ""))) {
        expenseByProject.set(pid, (expenseByProject.get(pid) ?? 0) + Number(r.amount ?? 0));
      }
    }

    const poByProject = new Map<string, number>();
    for (const r of (poRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      if (!["cancelled", "rejected"].includes(String(r.status ?? ""))) {
        poByProject.set(pid, (poByProject.get(pid) ?? 0) + Number(r.amount ?? 0));
      }
    }

    const raByProject = new Map<string, { billed: number; paid: number }>();
    for (const r of (raRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      const billAmount = Number(r.bill_amount ?? 0);
      const retentionPct = Number(r.retention_pct ?? 0);
      const paidAmount = Number(r.paid_amount ?? 0);
      const status = String(r.status ?? "submitted");
      const net = raNetPayable({ billAmount, retentionPct });
      const entry = raByProject.get(pid) ?? { billed: 0, paid: 0 };
      if (["approved", "paid"].includes(status)) entry.billed += net;
      if (status === "paid") entry.paid += paidAmount;
      raByProject.set(pid, entry);
    }

    const invoiceByProject = new Map<string, { invoiced: number; received: number }>();
    const invoiceIds = new Set<string>();
    for (const r of (invoiceRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      const amount = Number(r.amount ?? 0);
      const gst = Number(r.gst ?? 0);
      const tds = Number(r.tds ?? 0);
      const net = netReceivable(amount, gst, tds);
      const entry = invoiceByProject.get(pid) ?? { invoiced: 0, received: 0 };
      if (!["draft", "cancelled"].includes(String(r.status ?? ""))) entry.invoiced += net;
      invoiceByProject.set(pid, entry);
      invoiceIds.add(String(r.id));
    }

    // 4. Payments received for invoices
    for (const r of (paymentRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      const entry = invoiceByProject.get(pid) ?? { invoiced: 0, received: 0 };
      entry.received += Number(r.amount ?? 0);
      invoiceByProject.set(pid, entry);
    }

    // 5. Payments received for RA bills
    const raPaymentByProject = new Map<string, number>();
    for (const r of (raPaymentRes.data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id);
      raPaymentByProject.set(pid, (raPaymentByProject.get(pid) ?? 0) + Number(r.amount ?? 0));
    }

    // 6. Build KPIs per project
    const kpis: ProjectKPIs[] = projectsRes.data.map(p => {
      const budget = p.budget ?? 0;
      const expenses = expenseByProject.get(p.id) ?? 0;
      const poCommitted = poByProject.get(p.id) ?? 0;
      const raBilled = raByProject.get(p.id)?.billed ?? 0;
      const raPaid = raByProject.get(p.id)?.paid ?? 0;
      const invoiced = invoiceByProject.get(p.id)?.invoiced ?? 0;
      const received = invoiceByProject.get(p.id)?.received ?? 0;
      const raReceived = raPaymentByProject.get(p.id) ?? 0;

      const cashIn = received + raReceived;
      const cashOut = expenses + poCommitted + raPaid;
      const netCashFlow = cashIn - cashOut;
      const revenue = invoiced + raBilled;
      const cost = expenses + poCommitted + raPaid;
      const grossMargin = revenue - cost;
      const grossMarginPct = revenue > 0 ? Math.round((grossMargin / revenue) * 100) : 0;

      const kpi: ProjectKPIs = {
        projectId: p.id,
        projectName: nameById.get(p.id)?.name ?? "",
        projectType: nameById.get(p.id)?.type ?? null,
        budget,
        expenses,
        poCommitted,
        raBilled,
        invoiced,
        received,
        cashIn,
        cashOut,
        netCashFlow,
        revenue,
        cost,
        grossMargin,
        grossMarginPct,
        wipValue: 0, // placeholder - would need progress data
        health: "green", // computed below
      };
      kpi.health = computeHealth(kpi);
      return kpi;
    });

    return ok(kpis);
  } catch (e) { return er(e); }
}

// ── Cash Flow Forecast ────────────────────────────────────────────────────

export interface CashFlowForecastRow {
  period: string;          // YYYY-MM
  projectedIn: number;     // expected receipts
  projectedOut: number;    // expected payments
  net: number;             // projectedIn - projectedOut
  cumulative: number;      // running total
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgCashFlowForecast(client: any, orgId: string, months = 6, scope: MemberProjectScope = { mode: "all" }): Promise<Result<CashFlowForecastRow[]>> {
  try {
    const projectsRes = await listProjectsWithBudget(client, orgId, scope);
    if (!projectsRes.ok) return projectsRes;
    if (projectsRes.data.length === 0) return ok([]);
    const ids = projectsRes.data.map(p => p.id);

    // Get outstanding invoices with due dates
    const { data: invData, error: invErr } = await client
      .from("invoices")
      .select("project_id, amount, gst, tds, due_date, status")
      .in("project_id", ids)
      .in("status", ["sent", "partial", "overdue"]);
    if (invErr) return dbe(invErr);

    // Get outstanding RA bills with due dates
    const { data: raData, error: raErr } = await client
      .from("ra_bills")
      .select("project_id, bill_amount, retention_pct, due_date, status")
      .in("project_id", ids)
      .in("status", ["approved", "submitted"]);
    if (raErr) return dbe(raErr);

    // Get pending POs
    const { data: poData, error: poErr } = await client
      .from("purchase_orders")
      .select("project_id, amount, status")
      .in("project_id", ids)
      .in("status", ["issued", "acknowledged"]);
    if (poErr) return dbe(poErr);

    // Get pending expenses
    const { data: expData, error: expErr } = await client
      .from("expenses")
      .select("project_id, amount, status")
      .in("project_id", ids)
      .in("status", ["submitted", "approved"]);
    if (expErr) return dbe(expErr);

    // Aggregate by month
    const now = new Date();
    const monthsMap = new Map<string, { in: number; out: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthsMap.set(key, { in: 0, out: 0 });
    }

    // Project invoice receipts by due date
    for (const r of (invData ?? []) as Array<Record<string, unknown>>) {
      const due = r.due_date ? String(r.due_date) : null;
      if (!due) continue;
      const key = due.slice(0, 7);
      if (monthsMap.has(key)) {
        const net = netReceivable(Number(r.amount ?? 0), Number(r.gst ?? 0), Number(r.tds ?? 0));
        monthsMap.get(key)!.in += net;
      }
    }

    // Project RA bill receipts by due date
    for (const r of (raData ?? []) as Array<Record<string, unknown>>) {
      const due = r.due_date ? String(r.due_date) : null;
      if (!due) continue;
      const key = due.slice(0, 7);
      if (monthsMap.has(key)) {
        const net = raNetPayable({ billAmount: Number(r.bill_amount ?? 0), retentionPct: Number(r.retention_pct ?? 0) });
        monthsMap.get(key)!.in += net;
      }
    }

    // Project PO payments (assume 30 days from now if no date)
    for (const r of (poData ?? []) as Array<Record<string, unknown>>) {
      const key = `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}`; // next month
      if (monthsMap.has(key)) {
        monthsMap.get(key)!.out += Number(r.amount ?? 0);
      }
    }

    // Project expense payments
    for (const r of (expData ?? []) as Array<Record<string, unknown>>) {
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // this month
      if (monthsMap.has(key)) {
        monthsMap.get(key)!.out += Number(r.amount ?? 0);
      }
    }

    // Build forecast rows with cumulative
    let cumulative = 0;
    const rows: CashFlowForecastRow[] = [];
    for (const [period, vals] of monthsMap) {
      const net = vals.in - vals.out;
      cumulative += net;
      rows.push({ period, projectedIn: vals.in, projectedOut: vals.out, net, cumulative });
    }

    return ok(rows);
  } catch (e) { return er(e); }
}

// ── Executive Dashboard Summary ──────────────────────────────────────────

export interface ExecDashboard {
  kpis: OrgKPIRollup;
  cashFlow: CashFlowForecastRow[];
  topProjects: ProjectKPIs[];           // by revenue
  atRiskProjects: ProjectKPIs[];        // red health
  overdueInvoices: number;
  overdueRA: number;
  pendingApprovals: number;             // expenses + POs + RA needing approval
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getExecDashboard(client: any, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<Result<ExecDashboard>> {
  try {
    const [kpisRes, cashFlowRes] = await Promise.all([
      getOrgProjectKPIs(client, orgId, scope),
      getOrgCashFlowForecast(client, orgId, 6, scope),
    ]);
    if (!kpisRes.ok) return kpisRes;
    if (!cashFlowRes.ok) return cashFlowRes;

    const kpis = kpisRes.data;
    const rollup = orgKPIRollup(kpis);
    const sortedByRevenue = [...kpis].sort((a, b) => b.revenue - a.revenue);
    const topProjects = sortedByRevenue.slice(0, 5);
    const atRiskProjects = kpis.filter(p => p.health === "red").sort((a, b) => a.netCashFlow - b.netCashFlow).slice(0, 5);

    // Quick counts for alerts
    const projectsRes = await listProjectsWithBudget(client, orgId, scope);
    let overdueInvoices = 0, overdueRA = 0, pendingApprovals = 0;
    if (projectsRes.ok && projectsRes.data.length > 0) {
      const ids = projectsRes.data.map(p => p.id);
      const [invRes, raRes, expRes, poRes] = await Promise.all([
        client.from("invoices").select("id").in("project_id", ids).in("status", ["overdue"]),
        client.from("ra_bills").select("id").in("project_id", ids).in("status", ["submitted", "approved"]).lt("due_date", new Date().toISOString().slice(0, 10)),
        client.from("expenses").select("id").in("project_id", ids).in("status", ["submitted", "approved"]),
        client.from("purchase_orders").select("id").in("project_id", ids).in("status", ["draft", "issued"]),
      ]);
      overdueInvoices = (invRes.data ?? []).length;
      overdueRA = (raRes.data ?? []).length;
      pendingApprovals = (expRes.data ?? []).length + (poRes.data ?? []).length;
    }

    return ok({
      kpis: rollup,
      cashFlow: cashFlowRes.data,
      topProjects,
      atRiskProjects,
      overdueInvoices,
      overdueRA,
      pendingApprovals,
    });
  } catch (e) { return er(e); }
}