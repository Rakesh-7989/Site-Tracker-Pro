// SiteTrack Pro — org analytics query + helper tests.

import { describe, it, expect } from "vitest";
import { getOrgAnalytics, toBars } from "@/app/analyticsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

describe("getOrgAnalytics", () => {
  it("maps the aggregate jsonb", async () => {
    const r = await getOrgAnalytics(rpcClient({ data: {
      projectCount: 3, projectsByStatus: { active: 2, completed: 1 }, totalBudget: 5000000, avgProgress: 42,
      milestoneStatus: { pending: 4 }, taskStatus: { in_progress: 2 },
      finance: { poTotal: 100000, invoiceTotal: 200000, raBillTotal: 50000 },
    }, error: null }), "o");
    expect(r.ok && r.data).toMatchObject({ projectCount: 3, totalBudget: 5000000, avgProgress: 42 });
    expect(r.ok && r.data?.projectsByStatus).toEqual({ active: 2, completed: 1 });
    expect(r.ok && r.data?.finance).toEqual({ poTotal: 100000, invoiceTotal: 200000, raBillTotal: 50000 });
  });
  it("null (non-member) → ok null; error surfaced", async () => {
    expect(await getOrgAnalytics(rpcClient({ data: null, error: null }), "o")).toEqual({ ok: true, data: null });
    expect(await getOrgAnalytics(rpcClient({ data: null, error: { message: "no" } }), "o")).toEqual({ ok: false, error: "no" });
  });
});

describe("toBars", () => {
  it("orders by the given order + underscores → spaces", () => {
    const rows = toBars({ in_progress: 2, pending: 5, completed: 1 }, ["pending", "in_progress", "completed"]);
    expect(rows).toEqual([{ name: "pending", value: 5 }, { name: "in progress", value: 2 }, { name: "completed", value: 1 }]);
  });
});
