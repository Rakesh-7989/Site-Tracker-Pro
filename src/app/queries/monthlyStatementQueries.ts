// SiteTrack Pro — monthly statement rollup (v4 Phase D backlog).
// Org-wide financial summary for a given month across the caller's member
// projects: invoices (by source), retainers, expenses, RA bills, time entries
// (consultancy), and PO receipts (procurement). Mirrors the RevenueView +
// UtilizationView org-rollup pattern (project list once, then .in fetches).

import { listProjectsByType } from "./utilizationQueries";
import type { MemberProjectScope } from "./queries";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export interface ProjectBrief { id: string; name: string; type: string | null; }

export interface MonthlyStatementRow {
  projectId: string;
  name: string;
  type: string | null;
  /** Invoiced in month by source */
  invoicedPhase: number;
  invoicedHourly: number;
  invoicedRetainer: number;
  invoicedTotal: number;
  /** Retainer MRR (active during month) */
  mrr: number;
  /** Expenses recorded in month */
  expenses: number;
  /** RA bills submitted in month */
  raBills: number;
  /** PO receipts received in month (procurement settlement) */
  poReceipts: number;
  /** Consultancy: billable hours logged in month */
  billableHours: number;
  /** Consultancy: billed value (hours × rate) in month */
  billedValue: number;
}

/** Pure helper: aggregate monthly statement from raw data. */
export function buildMonthlyStatement(
  projects: ProjectBrief[],
  invoices: Array<{ projectId: string; amount: number; source: string | null; issuedDate: string | null }>,
  retainers: Array<{ projectId: string; monthlyAmount: number; status: string; startDate: string; endDate: string | null }>,
  expenses: Array<{ projectId: string; amount: number; expenseDate: string | null }>,
  raBills: Array<{ projectId: string; billAmount: number; billDate: string | null }>,
  poReceipts: Array<{ projectId: string; amount: number; receivedDate: string | null }>,
  timeEntries: Array<{ projectId: string; hours: number; rate: number | null; billable: boolean; date: string; approvalStatus: string }>,
  monthStart: string, // YYYY-MM-DD
  monthEnd: string,   // YYYY-MM-DD
): MonthlyStatementRow[] {
  const monthStartTs = new Date(monthStart + "T00:00:00").getTime();
  const monthEndTs = new Date(monthEnd + "T23:59:59.999").getTime();

  const inMonth = (d: string | null) => {
    if (!d) return false;
    const ts = new Date(d + "T00:00:00").getTime();
    return ts >= monthStartTs && ts <= monthEndTs;
  };

  const byProject = new Map<string, MonthlyStatementRow>(
    projects.map(p => [p.id, {
      projectId: p.id, name: p.name, type: p.type,
      invoicedPhase: 0, invoicedHourly: 0, invoicedRetainer: 0, invoicedTotal: 0,
      mrr: 0, expenses: 0, raBills: 0, poReceipts: 0,
      billableHours: 0, billedValue: 0,
    }])
  );

  for (const inv of invoices) {
    if (!inMonth(inv.issuedDate)) continue;
    const row = byProject.get(inv.projectId);
    if (!row) continue;
    row.invoicedTotal += inv.amount;
    if (inv.source === "phase") row.invoicedPhase += inv.amount;
    else if (inv.source === "hourly") row.invoicedHourly += inv.amount;
    else if (inv.source === "retainer") row.invoicedRetainer += inv.amount;
  }

  for (const ret of retainers) {
    if (ret.status !== "active") continue;
    const row = byProject.get(ret.projectId);
    if (!row) continue;
    // Retainer active during month?
    const retStart = new Date(ret.startDate + "T00:00:00").getTime();
    const retEnd = ret.endDate ? new Date(ret.endDate + "T23:59:59.999").getTime() : Infinity;
    if (retStart <= monthEndTs && retEnd >= monthStartTs) {
      row.mrr += ret.monthlyAmount;
    }
  }

  for (const exp of expenses) {
    if (!inMonth(exp.expenseDate)) continue;
    const row = byProject.get(exp.projectId);
    if (row) row.expenses += exp.amount;
  }

  for (const ra of raBills) {
    if (!inMonth(ra.billDate)) continue;
    const row = byProject.get(ra.projectId);
    if (row) row.raBills += ra.billAmount;
  }

  for (const pr of poReceipts) {
    if (!inMonth(pr.receivedDate)) continue;
    const row = byProject.get(pr.projectId);
    if (row) row.poReceipts += pr.amount;
  }

  for (const te of timeEntries) {
    if (!inMonth(te.date)) continue;
    if (!te.billable) continue;
    if (te.approvalStatus !== "approved") continue;
    const row = byProject.get(te.projectId);
    if (!row) continue;
    row.billableHours += num(te.hours);
    if (te.rate != null) row.billedValue += num(te.hours) * num(te.rate);
  }

  return [...byProject.values()].sort((a, b) => b.invoicedTotal - a.invoicedTotal);
}

export interface MonthlyStatementTotals {
  invoicedPhase: number;
  invoicedHourly: number;
  invoicedRetainer: number;
  invoicedTotal: number;
  mrr: number;
  expenses: number;
  raBills: number;
  poReceipts: number;
  billableHours: number;
  billedValue: number;
}

/** Sum totals across all projects. */
export function monthlyStatementTotals(rows: MonthlyStatementRow[]): MonthlyStatementTotals {
  return rows.reduce((acc, r) => {
    acc.invoicedPhase += r.invoicedPhase;
    acc.invoicedHourly += r.invoicedHourly;
    acc.invoicedRetainer += r.invoicedRetainer;
    acc.invoicedTotal += r.invoicedTotal;
    acc.mrr += r.mrr;
    acc.expenses += r.expenses;
    acc.raBills += r.raBills;
    acc.poReceipts += r.poReceipts;
    acc.billableHours += r.billableHours;
    acc.billedValue += r.billedValue;
    return acc;
  }, {
    invoicedPhase: 0, invoicedHourly: 0, invoicedRetainer: 0, invoicedTotal: 0,
    mrr: 0, expenses: 0, raBills: 0, poReceipts: 0,
    billableHours: 0, billedValue: 0,
  });
}

 
export async function listOrgMonthlyStatement(
  client: any,
  orgId: string,
  monthStart: string, // YYYY-MM-DD
  monthEnd: string,   // YYYY-MM-DD
  scope: MemberProjectScope = { mode: "all" }
): Promise<Result<MonthlyStatementRow[]>> {
  try {
    const projectsRes = await listProjectsByType(
      client,
      orgId,
      ["consultant", "design", "construction", "interior"],
      scope,
    );
    if (!projectsRes.ok) return projectsRes;
    if (projectsRes.data.length === 0) return ok([]);
    const ids = projectsRes.data.map(p => p.id);

    const [invRes, retRes, expRes, raRes, prRes, teRes] = await Promise.all([
      client.from("invoices").select("project_id, amount, source, issued_date").in("project_id", ids),
      client.from("retainers").select("project_id, monthly_amount, status, start_date, end_date").in("project_id", ids),
      client.from("expenses").select("project_id, amount, expense_date").in("project_id", ids),
      client.from("ra_bills").select("project_id, bill_amount, bill_date").in("project_id", ids),
      client.from("po_receipts").select("amount, received_date, po:purchase_orders(project_id)").in("po.project_id", ids),
      client.from("time_entries").select("project_id, hours, rate, billable, date, approval_status").in("project_id", ids),
    ]);

    if (invRes.error) return dbe(invRes.error);
    if (retRes.error) return dbe(retRes.error);
    if (expRes.error) return dbe(expRes.error);
    if (raRes.error) return dbe(raRes.error);
    if (prRes.error) return dbe(prRes.error);
    if (teRes.error) return dbe(teRes.error);

    const invoices = ((invRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      projectId: String(r.project_id ?? ""),
      amount: num(r.amount),
      source: r.source == null ? null : String(r.source),
      issuedDate: r.issued_date == null ? null : String(r.issued_date).slice(0, 10),
    }));
    const retainers = ((retRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      projectId: String(r.project_id ?? ""),
      monthlyAmount: num(r.monthly_amount),
      status: String(r.status ?? "active"),
      startDate: String(r.start_date ?? ""),
      endDate: r.end_date == null ? null : String(r.end_date),
    }));
    const expenses = ((expRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      projectId: String(r.project_id ?? ""),
      amount: num(r.amount),
      expenseDate: r.expense_date == null ? null : String(r.expense_date).slice(0, 10),
    }));
    const raBills = ((raRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      projectId: String(r.project_id ?? ""),
      billAmount: num(r.bill_amount),
      billDate: r.bill_date == null ? null : String(r.bill_date).slice(0, 10),
    }));
    const poReceipts = ((prRes.data ?? []) as Array<Record<string, unknown>>).map(r => {
      const po = r.po as Record<string, unknown> | undefined;
      return {
        projectId: String(po?.project_id ?? ""),
        amount: num(r.amount),
        receivedDate: r.received_date == null ? null : String(r.received_date).slice(0, 10),
      };
    });
    const timeEntries = ((teRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      projectId: String(r.project_id ?? ""),
      hours: num(r.hours),
      rate: r.rate == null ? null : num(r.rate),
      billable: Boolean(r.billable),
      date: String(r.date ?? "").slice(0, 10),
      approvalStatus: String(r.approval_status ?? "pending"),
    }));

    return ok(buildMonthlyStatement(
      projectsRes.data,
      invoices,
      retainers,
      expenses,
      raBills,
      poReceipts,
      timeEntries,
      monthStart,
      monthEnd,
    ));
  } catch (e) { return er(e); }
}