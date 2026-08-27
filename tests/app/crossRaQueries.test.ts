// SiteTrack Pro — cross-project RA bills query + rollup tests.

import { describe, it, expect } from "vitest";
import { getOrgRaBills, crossRaRollup, type CrossRaBill } from "@/app/queries/crossRaQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clientProject = (projects: Array<Record<string, unknown>>, rabills: Array<Record<string, unknown>>): any => ({
  from: (table: string) => {
    if (table === "projects") {
      return { select: () => ({ eq: () => ({ in: async () => ({ data: projects, error: null }) }) }) };
    }
    if (table === "ra_bills") {
      return { select: () => ({ in: () => ({ order: async () => ({ data: rabills, error: null }) }) }) };
    }
    return { select: () => ({ eq: () => ({ in: async () => ({ data: null, error: null }) }) }) };
  },
  rpc: async () => ({ data: null, error: null }),
});

const mk = (o: Partial<CrossRaBill>): CrossRaBill => ({
  id: "x", no: "RA-1", subcontractor: null, scope: null, billAmount: 1000, retentionPct: 5,
  paidAmount: 0, status: "submitted", billDate: null, projectId: "p1", projectName: "A",
  projectType: "construction", netPayable: 950, ...o,
});

describe("getOrgRaBills", () => {
  it("maps fields, computes netPayable, attaches project name", async () => {
    const c = clientProject(
      [{ id: "p1", name: "Tower A", type: "construction" }],
      [
        { id: "1", no: "RA-1", project_id: "p1", subcontractor: "MEP Co", scope: "floor 2", bill_amount: 200000, retention_pct: 10, paid_amount: 0, status: "approved", bill_date: "2026-06-01" },
        { id: "2", no: "RA-2", project_id: "p1", subcontractor: null, scope: null, bill_amount: 500, retention_pct: 0, paid_amount: 400, status: "paid", bill_date: null },
      ],
    );
    const r = await getOrgRaBills(c, "org");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data[0]).toMatchObject({ projectName: "Tower A", no: "RA-1", billAmount: 200000, retentionPct: 10, status: "approved", netPayable: 180000 });
    expect(r.data[1].netPayable).toBe(500);
    expect(r.data[1].paidAmount).toBe(400);
  });

  it("coerces an unknown status to submitted; returns [] for no projects", async () => {
    const c = clientProject([], []);
    const e = await getOrgRaBills(c, "org");
    expect(e).toEqual({ ok: true, data: [] });
  });
});

describe("crossRaRollup", () => {
  it("sums billed/net/paid and groups by status", () => {
    const t = crossRaRollup([
      mk({ id: "1", billAmount: 1000, retentionPct: 10, netPayable: 900, status: "submitted" }),
      mk({ id: "2", billAmount: 2000, retentionPct: 0, netPayable: 2000, status: "approved" }),
      mk({ id: "3", billAmount: 5000, retentionPct: 5, netPayable: 4750, status: "paid", paidAmount: 4000 }),
    ]);
    expect(t.count).toBe(3);
    expect(t.billed).toBe(8000);
    expect(t.netPayable).toBe(7650);
    expect(t.paid).toBe(4000);
    expect(t.byStatus).toEqual({ submitted: 1000, approved: 2000, paid: 5000, rejected: 0 });
  });

  it("handles an empty list", () => {
    const t = crossRaRollup([]);
    expect(t.count).toBe(0);
    expect(t.byStatus).toEqual({ submitted: 0, approved: 0, paid: 0, rejected: 0 });
  });
});