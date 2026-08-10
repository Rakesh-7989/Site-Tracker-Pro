// SiteTrack Pro — member-scope propagation across org-rollup query functions.
// When a non-admin member opens /projects, /pm, the planning dropdowns, or the
// kiosks, every org-rollup helper must restrict its project fetch to the
// member's assigned project ids (`.in("id", ids)`) and short-circuit to an
// empty result on an empty assignment set (PostgREST ignores `IN ()`).

import { describe, it, expect } from "vitest";
import { listProjectsByType, getOrgUtilization, getOrgUtilizationByPhase } from "@/app/utilizationQueries";
import { getOrgRaBills } from "@/app/crossRaQueries";
import { listOrgFfe } from "@/app/ffeQueries";
import { listOrgMonthlyStatement } from "@/app/monthlyStatementQueries";
import { listOrgInvoices } from "@/app/crossInvoiceQueries";
import { listOrgDownloadEvents } from "@/app/downloadAuditQueries";
import {
  listProjectsWithBudget, getOrgProjectKPIs, getOrgCashFlowForecast, getExecDashboard,
} from "@/app/crossAnalyticsQueries";
import { listOrgProjects } from "@/app/procurementQuotes";
import type { MemberProjectScope } from "@/app/queries";

type Raw = { data: unknown; error: unknown };

const MEMBER_EMPTY: MemberProjectScope = { mode: "member", projectIds: [] };
const MEMBER_TWO: MemberProjectScope = { mode: "member", projectIds: ["p1", "p2"] };

// Chainable + awaitable filter builder. `.in/.eq/.order/.limit` return the
// same object so both `.in("id", ids)` + a trailing `.in("type", …)` can be
// chained; `await q` resolves via `then` to the configured raw result.
function mockClient(rtByTable: Record<string, Raw>) {
  const log: string[] = [];
  const from = (t: string): any => {
    log.push(`from:${t}`);
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.lt = () => b;
    b.in = (col: string) => { log.push(`in:${col}`); return b; };
    b.then = (onFul: (v: Raw) => void): void => { onFul(rtByTable[t] ?? { data: [], error: null }); };
    return b;
  };
  return { client: { from }, log };
}

describe("scope — empty member assignments short-circuit", () => {
  it("listProjectsByType never issues IN / type for an empty set", async () => {
    const { client, log } = mockClient({ projects: { data: [], error: null } });
    const r = await listProjectsByType(client, "org-1", undefined, MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
    expect(log.filter(x => x.startsWith("in:"))).toEqual([]);
  });

  it("listProjectsWithBudget (crossAnalytics) short-circuits", async () => {
    const { client, log } = mockClient({});
    const r = await listProjectsWithBudget(client, "org-1", MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
    expect(log).toEqual(["from:projects"]);
  });

  it("getOrgUtilization + ByPhase short-circuit before child-table fetches", async () => {
    const u = mockClient({});
    const r1 = await getOrgUtilization(u.client, "org-1", MEMBER_EMPTY);
    expect(r1).toEqual({ ok: true, data: [] });
    expect(u.log.some(x => x.startsWith("from:fee_phases") || x.startsWith("from:time_entries"))).toBe(false);

    const p = mockClient({});
    const r2 = await getOrgUtilizationByPhase(p.client, "org-1", MEMBER_EMPTY);
    expect(r2).toEqual({ ok: true, data: [] });
    expect(p.log.some(x => x.startsWith("from:fee_phases") || x.startsWith("from:time_entries"))).toBe(false);
  });

  it("getOrgRaBills short-circuits", async () => {
    const { client, log } = mockClient({});
    const r = await getOrgRaBills(client, "org-1", MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
    expect(log.some(x => x.startsWith("from:ra_bills"))).toBe(false);
  });

  it("listOrgFfe short-circuits", async () => {
    const { client } = mockClient({});
    const r = await listOrgFfe(client, "org-1", MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
  });

  it("listOrgMonthlyStatement short-circuits", async () => {
    const { client, log } = mockClient({});
    const r = await listOrgMonthlyStatement(client, "org-1", "2026-08-01", "2026-08-31", MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
    expect(log.some(x => x.startsWith("from:invoices") || x.startsWith("from:time_entries"))).toBe(false);
  });

  it("listOrgInvoices short-circuits", async () => {
    const { client, log } = mockClient({});
    const r = await listOrgInvoices(client, "org-1", MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
    expect(log.filter(x => x.startsWith("in:")).includes("in:id")).toBe(false);
  });

  it("listOrgDownloadEvents short-circuits", async () => {
    const { client, log } = mockClient({});
    const r = await listOrgDownloadEvents(client, "org-1", 200, MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
    expect(log.some(x => x.startsWith("from:download_events"))).toBe(false);
  });

  it("getOrgProjectKPIs + getOrgCashFlowForecast + getExecDashboard short-circuit", async () => {
    const k = mockClient({});
    const r1 = await getOrgProjectKPIs(k.client, "org-1", MEMBER_EMPTY);
    expect(r1).toEqual({ ok: true, data: [] });

    const c = mockClient({});
    const r2 = await getOrgCashFlowForecast(c.client, "org-1", 6, MEMBER_EMPTY);
    expect(r2).toEqual({ ok: true, data: [] });

    const e = mockClient({});
    const r3 = await getExecDashboard(e.client, "org-1", MEMBER_EMPTY);
    expect(r3.ok).toBe(true);
    const dash = r3 as { ok: true; data: { topProjects: unknown[]; atRiskProjects: unknown[]; overdueInvoices: number; pendingApprovals: number } };
    expect(dash.data.topProjects).toEqual([]);
    expect(dash.data.atRiskProjects).toEqual([]);
    expect(dash.data.overdueInvoices).toBe(0);
    expect(dash.data.pendingApprovals).toBe(0);
  });

  it("listOrgProjects (procurementQuotes) short-circuits", async () => {
    const { client } = mockClient({});
    const r = await listOrgProjects(client, "org-1", undefined, MEMBER_EMPTY);
    expect(r).toEqual({ ok: true, data: [] });
  });
});

describe("scope — non-empty member assignments apply .in(\"id\") and map rows", () => {
  it("listProjectsByType filters by assigned ids then type", async () => {
    const { client, log } = mockClient({
      projects: { data: [
        { id: "p1", name: "Lobby", type: "design" },
        { id: "p2", name: "HQ", type: "interior" },
      ], error: null },
    });
    const r = await listProjectsByType(client, "org-1", ["design", "interior"], MEMBER_TWO);
    expect(r.ok).toBe(true);
    expect((r as { data: Array<{ id: string; name: string }> }).data.map(p => p.id)).toEqual(["p1", "p2"]);
    expect(log).toEqual(["from:projects", "in:id", "in:type"]);
  });

  it("admin (mode \"all\") never applies .in(\"id\") — regression lock", async () => {
    const { client, log } = mockClient({ projects: { data: [{ id: "p1", name: "Lobby", type: "design" }], error: null } });
    const r = await listProjectsByType(client, "org-1", undefined);
    expect(r.ok).toBe(true);
    expect(log).toEqual(["from:projects", "in:type"]);
  });

  it("getOrgRaBills filters bills by the scoped projects", async () => {
    const { client, log } = mockClient({
      projects: { data: [{ id: "p1", name: "Lobby Fit-out", type: "interior" }], error: null },
      ra_bills: { data: [
        { id: "b1", no: "RA-01", subcontractor: "Vendor A", scope: "Tile works", bill_amount: 100000, retention_pct: 10, paid_amount: 0, status: "approved", bill_date: "2026-08-01", project_id: "p1" },
      ], error: null },
    });
    const r = await getOrgRaBills(client, "org-1", MEMBER_TWO);
    expect(r.ok).toBe(true);
    const rows = (r as { data: Array<{ id: string; no: string; projectName: string; netPayable: number }> }).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "b1", no: "RA-01", projectName: "Lobby Fit-out", netPayable: 90000 });
    expect(log).toEqual(["from:projects", "in:id", "in:type", "from:ra_bills", "in:project_id"]);
  });

  it("listOrgFfe groups entries under scoped projects", async () => {
    const { client, log } = mockClient({
      projects: { data: [{ id: "p1", name: "Lobby", type: "interior" }], error: null },
      ffe_entries: { data: [
        { id: "e1", project_id: "p1", code: "F-01", category: "furniture", name: "Sofa", space_or_room: "Lobby", manufacturer: "X", model: null, finish: null, dimensions: null, qty: 4, unit_cost: 2500, status: "ordered", notes: null, created_at: "2026-08-01" },
      ], error: null },
    });
    const r = await listOrgFfe(client, "org-1", MEMBER_TWO);
    expect(r.ok).toBe(true);
    const data = (r as { data: Array<{ projectId: string; entries: unknown[] }> }).data;
    expect(data).toHaveLength(1);
    expect(data[0].entries).toHaveLength(1);
    expect(log).toEqual(["from:projects", "in:id", "in:type", "from:ffe_entries", "in:project_id"]);
  });

  it("listOrgProjects applies the assigned-ids filter without a type filter", async () => {
    const { client, log } = mockClient({
      projects: { data: [{ id: "p2", name: "HQ", type: "construction" }], error: null },
    });
    const r = await listOrgProjects(client, "org-1", undefined, MEMBER_TWO);
    expect(r.ok).toBe(true);
    expect((r as { data: Array<{ id: string }> }).data.map(p => p.id)).toEqual(["p2"]);
    expect(log).toEqual(["from:projects", "in:id"]);
  });
});