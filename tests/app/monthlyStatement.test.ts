// SiteTrack Pro — monthly statement pure-helper tests.
// Tests buildMonthlyStatement, monthlyStatementTotals, and listOrgMonthlyStatement
// query mapper.

import { describe, it, expect } from "vitest";
import {
  buildMonthlyStatement, monthlyStatementTotals, listOrgMonthlyStatement,
  type MonthlyStatementRow, type ProjectBrief,
} from "@/app/monthlyStatementQueries";

const proj = (id: string, name: string, type: string | null = "consultant"): ProjectBrief => ({ id, name, type });

interface InvoiceRaw { projectId: string; amount: number; source: string | null; issuedDate: string | null; }
interface RetainerRaw { projectId: string; monthlyAmount: number; status: string; startDate: string; endDate: string | null; }
interface ExpenseRaw { projectId: string; amount: number; expenseDate: string | null; }
interface RaBillRaw { projectId: string; billAmount: number; billDate: string | null; }
interface PoReceiptRaw { projectId: string; amount: number; receivedDate: string | null; }
interface TimeEntryRaw { projectId: string; hours: number; rate: number | null; billable: boolean; date: string; approvalStatus: string; }

const inv = (o: InvoiceRaw): InvoiceRaw => o;
const ret = (o: RetainerRaw): RetainerRaw => o;
const exp = (o: ExpenseRaw): ExpenseRaw => o;
const ra = (o: RaBillRaw): RaBillRaw => o;
const pr = (o: PoReceiptRaw): PoReceiptRaw => o;
const te = (o: TimeEntryRaw): TimeEntryRaw => o;

describe("monthlyStatementQueries buildMonthlyStatement", () => {
  const monthStart = "2026-08-01";
  const monthEnd = "2026-08-31";

  it("aggregates invoices by source within the month", () => {
    const rows = buildMonthlyStatement(
      [proj("p1", "HQ", "consultant"), proj("p2", "Lobby", "design")],
      [
        inv({ projectId: "p1", amount: 50000, source: "phase", issuedDate: "2026-08-15" }),
        inv({ projectId: "p1", amount: 30000, source: "hourly", issuedDate: "2026-08-20" }),
        inv({ projectId: "p2", amount: 20000, source: "retainer", issuedDate: "2026-08-10" }),
        inv({ projectId: "p1", amount: 10000, source: "phase", issuedDate: "2026-07-31" }), // outside month
      ],
      [], [], [], [], [], monthStart, monthEnd,
    );
    const p1 = rows.find(r => r.projectId === "p1")!;
    const p2 = rows.find(r => r.projectId === "p2")!;
    expect(p1.invoicedPhase).toBe(50000);
    expect(p1.invoicedHourly).toBe(30000);
    expect(p1.invoicedRetainer).toBe(0);
    expect(p1.invoicedTotal).toBe(80000);
    expect(p2.invoicedRetainer).toBe(20000);
    expect(p2.invoicedTotal).toBe(20000);
  });

  it("includes MRR for retainers active during the month", () => {
    const rows = buildMonthlyStatement(
      [proj("p1", "HQ", "consultant")],
      [],
      [
        ret({ projectId: "p1", monthlyAmount: 10000, status: "active", startDate: "2026-07-01", endDate: null }),
        ret({ projectId: "p1", monthlyAmount: 5000, status: "paused", startDate: "2026-07-01", endDate: null }),
        ret({ projectId: "p1", monthlyAmount: 8000, status: "active", startDate: "2026-09-01", endDate: null }), // starts next month
      ],
      [], [], [], [], monthStart, monthEnd,
    );
    expect(rows[0].mrr).toBe(10000);
  });

  it("aggregates expenses, RA bills, PO receipts within month", () => {
    const rows = buildMonthlyStatement(
      [proj("p1", "HQ", "construction")],
      [],
      [],
      [exp({ projectId: "p1", amount: 15000, expenseDate: "2026-08-10" }), exp({ projectId: "p1", amount: 5000, expenseDate: "2026-07-15" })],
      [ra({ projectId: "p1", billAmount: 100000, billDate: "2026-08-25" })],
      [pr({ projectId: "p1", amount: 25000, receivedDate: "2026-08-28" })],
      [], monthStart, monthEnd,
    );
    expect(rows[0].expenses).toBe(15000);
    expect(rows[0].raBills).toBe(100000);
    expect(rows[0].poReceipts).toBe(25000);
  });

  it("aggregates consultancy billable hours and billed value", () => {
    const rows = buildMonthlyStatement(
      [proj("p1", "HQ", "consultant")],
      [], [], [], [], [],
      [
        te({ projectId: "p1", hours: 4, rate: 2000, billable: true, date: "2026-08-10", approvalStatus: "approved" }),
        te({ projectId: "p1", hours: 2, rate: 1500, billable: true, date: "2026-08-15", approvalStatus: "approved" }),
        te({ projectId: "p1", hours: 3, rate: 1000, billable: false, date: "2026-08-20", approvalStatus: "approved" }), // non-billable
        te({ projectId: "p1", hours: 5, rate: 2000, billable: true, date: "2026-08-25", approvalStatus: "pending" }), // not approved
        te({ projectId: "p1", hours: 1, rate: 500, billable: true, date: "2026-07-30", approvalStatus: "approved" }), // outside month
      ],
      monthStart, monthEnd,
    );
    expect(rows[0].billableHours).toBe(6); // 4 + 2
    expect(rows[0].billedValue).toBe(11000); // 4*2000 + 2*1500
  });

  it("returns zero rows for no projects", () => {
    const rows = buildMonthlyStatement([], [], [], [], [], [], [], monthStart, monthEnd);
    expect(rows).toEqual([]);
  });
});

describe("monthlyStatementQueries monthlyStatementTotals", () => {
  it("sums all fields across projects", () => {
    const rows: MonthlyStatementRow[] = [
      { projectId: "p1", name: "A", type: "consultant", invoicedPhase: 10, invoicedHourly: 20, invoicedRetainer: 30, invoicedTotal: 60, mrr: 5, expenses: 7, raBills: 11, poReceipts: 13, billableHours: 8, billedValue: 100 },
      { projectId: "p2", name: "B", type: "design", invoicedPhase: 20, invoicedHourly: 30, invoicedRetainer: 40, invoicedTotal: 90, mrr: 10, expenses: 14, raBills: 22, poReceipts: 26, billableHours: 16, billedValue: 200 },
    ];
    const t = monthlyStatementTotals(rows);
    expect(t).toEqual({
      invoicedPhase: 30, invoicedHourly: 50, invoicedRetainer: 70, invoicedTotal: 150,
      mrr: 15, expenses: 21, raBills: 33, poReceipts: 39,
      billableHours: 24, billedValue: 300,
    });
  });
});

describe("monthlyStatementQueries listOrgMonthlyStatement", () => {
  const makeChain = (result: { data?: unknown; error?: unknown }) => {
    const thenable = {
      then(onfulfilled: (value: { data?: unknown; error?: unknown }) => void) { return Promise.resolve(result).then(onfulfilled); },
      order: () => thenable,
    };
    return {
      select: () => ({ eq: () => ({ in: () => thenable }), in: () => thenable }),
    };
  };

  const mockClient = (opts: {
    projects?: { data?: unknown; error?: unknown };
    invoices?: { data?: unknown; error?: unknown };
    retainers?: { data?: unknown; error?: unknown };
    expenses?: { data?: unknown; error?: unknown };
    raBills?: { data?: unknown; error?: unknown };
    poReceipts?: { data?: unknown; error?: unknown };
    timeEntries?: { data?: unknown; error?: unknown };
  }) => ({
    from: (table: string) => {
      if (table === "projects") return makeChain(opts.projects ?? { data: [], error: null });
      if (table === "invoices") return makeChain(opts.invoices ?? { data: [], error: null });
      if (table === "retainers") return makeChain(opts.retainers ?? { data: [], error: null });
      if (table === "expenses") return makeChain(opts.expenses ?? { data: [], error: null });
      if (table === "ra_bills") return makeChain(opts.raBills ?? { data: [], error: null });
      if (table === "po_receipts") return makeChain(opts.poReceipts ?? { data: [], error: null });
      return makeChain(opts.timeEntries ?? { data: [], error: null });
    },
  });

  it("maps invoices/retainers/expenses/ra/po/time into statement rows", async () => {
    const client = mockClient({
      projects: { data: [{ id: "p1", name: "HQ", type: "consultant" }], error: null },
      invoices: { data: [{ project_id: "p1", amount: 50000, source: "phase", issued_date: "2026-08-15" }], error: null },
      retainers: { data: [{ project_id: "p1", monthly_amount: 10000, status: "active", start_date: "2026-07-01", end_date: null }], error: null },
      expenses: { data: [{ project_id: "p1", amount: 5000, expense_date: "2026-08-10" }], error: null },
      raBills: { data: [{ project_id: "p1", bill_amount: 20000, bill_date: "2026-08-20" }], error: null },
      poReceipts: { data: [{ project_id: "p1", amount: 8000, received_date: "2026-08-25" }], error: null },
      timeEntries: { data: [{ project_id: "p1", hours: 4, rate: 2000, billable: true, date: "2026-08-12", approval_status: "approved" }], error: null },
    });
    const r = await listOrgMonthlyStatement(client, "org-1", "2026-08-01", "2026-08-31");
    expect(r.ok).toBe(true);
    const rows = (r as { ok: true; data: MonthlyStatementRow[] }).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId: "p1", name: "HQ",
      invoicedPhase: 50000, invoicedTotal: 50000,
      mrr: 10000, expenses: 5000, raBills: 20000, poReceipts: 8000,
      billableHours: 4, billedValue: 8000,
    });
  });

  it("short-circuits to empty when org has no projects", async () => {
    const client = mockClient({ projects: { data: [], error: null } });
    const r = await listOrgMonthlyStatement(client, "org-1", "2026-08-01", "2026-08-31");
    expect(r).toEqual({ ok: true, data: [] });
  });

  it("propagates project-list errors", async () => {
    const client = mockClient({ projects: { data: null, error: { message: "denied" } } });
    const r = await listOrgMonthlyStatement(client, "org-1", "2026-08-01", "2026-08-31");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("denied");
  });
});