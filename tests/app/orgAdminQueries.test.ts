// SiteTrack Pro — org-admin panel query tests (Batch 6).

import { describe, it, expect } from "vitest";
import { getOrgOverview, listOrgActivity } from "@/app/orgAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({
  rpc: async () => result,
});

describe("getOrgOverview", () => {
  it("maps overview + nested subscription", async () => {
    const r = await getOrgOverview(rpcClient({ data: {
      name: "Sri Builders", slug: "sri", plan: "pro", projectCount: 4, memberCount: 7, createdAt: "2026-01-01",
      sub: { provider: "cashfree", status: "active", plan: "pro", currentPeriodEnd: "2026-12-31", trialEndsAt: null },
    }, error: null }), "org1");
    expect(r.ok && r.data).toMatchObject({ name: "Sri Builders", plan: "pro", projectCount: 4, memberCount: 7 });
    expect(r.ok && r.data?.sub).toMatchObject({ provider: "cashfree", status: "active", currentPeriodEnd: "2026-12-31", trialEndsAt: null });
  });

  it("null data (not an org admin) returns ok with null", async () => {
    const r = await getOrgOverview(rpcClient({ data: null, error: null }), "org1");
    expect(r).toEqual({ ok: true, data: null });
  });

  it("surfaces rpc error", async () => {
    const r = await getOrgOverview(rpcClient({ data: null, error: { message: "boom" } }), "org1");
    expect(r).toEqual({ ok: false, error: "boom" });
  });
});

describe("listOrgActivity", () => {
  it("maps audit rows snake→camel", async () => {
    const r = await listOrgActivity(rpcClient({ data: [
      { id: "a1", actor_name: "Rakesh", actor_role: "orgadmin", action: "APPROVE", resource: "ra_bill", resource_id: "abcd1234ef", message: "RA-1 approved", ts: "2026-06-05T10:00:00Z" },
    ], error: null }), "org1");
    expect(r.ok && r.data[0]).toMatchObject({ actorName: "Rakesh", action: "APPROVE", resource: "ra_bill", message: "RA-1 approved" });
  });

  it("defaults missing actor to System + surfaces error", async () => {
    const r = await listOrgActivity(rpcClient({ data: [{ id: "a1", action: "LOGIN", ts: "x" }], error: null }), "org1");
    expect(r.ok && r.data[0].actorName).toBe("System");
    const e = await listOrgActivity(rpcClient({ data: null, error: { message: "denied" } }), "org1");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});
