// SiteTrack Pro — platform (superadmin) query tests.

import { describe, it, expect } from "vitest";
import { createPlatformOrg, listPlatformOrgs, listPlatformUsers, getPlatformStats, setOrgPlan, planUnlocksCustomRoles, ASSIGNABLE_PLANS } from "@/app/platformAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }, capture?: Array<{ name: string; args: unknown }>): any => ({
  rpc: async (name: string, args: unknown) => {
    capture?.push({ name, args });
    return result;
  },
});

describe("listPlatformOrgs", () => {
  it("maps counts + surfaces error", async () => {
    const r = await listPlatformOrgs(rpcClient({ data: [
      { id: "o1", name: "ABC", slug: "abc", plan: "pro", member_count: 7, project_count: 3, created_at: "2026-01-01" },
    ], error: null }));
    expect(r.ok && r.data[0]).toMatchObject({ name: "ABC", plan: "pro", memberCount: 7, projectCount: 3 });
    const e = await listPlatformOrgs(rpcClient({ data: null, error: { message: "denied" } }));
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("createPlatformOrg", () => {
  it("calls the owner-only RPC and maps the returned organization", async () => {
    const calls: Array<{ name: string; args: unknown }> = [];
    const r = await createPlatformOrg(rpcClient({
      data: { ok: true, id: "o1", name: "G Architects", slug: "g-architects-ab12cd", plan: "pro", created_at: "2026-06-20" },
      error: null,
    }, calls), { name: " G Architects ", plan: "pro" });

    expect(r.ok && r.data).toMatchObject({ id: "o1", name: "G Architects", plan: "pro", memberCount: 0, projectCount: 0 });
    expect(calls[0]).toEqual({ name: "create_platform_org", args: { p_name: "G Architects", p_plan: "pro" } });
  });

  it("requires an organization name", async () => {
    const r = await createPlatformOrg(rpcClient({ data: null, error: null }), { name: " ", plan: "basic" });
    expect(r).toEqual({ ok: false, error: "Organization name is required." });
  });
});

describe("listPlatformUsers", () => {
  it("maps profile + email + staff + tier + org count", async () => {
    const r = await listPlatformUsers(rpcClient({ data: [
      { id: "u1", name: "Rakesh", email: "r@a.com", role: "superadmin", is_staff: true, staff_tier: "head", org_count: 2, created_at: "2026-02-02" },
      { id: "u2", name: "X", email: null, role: "client", is_staff: false, staff_tier: null, org_count: 0, created_at: "2026-03-03" },
    ], error: null }));
    expect(r.ok && r.data[0]).toMatchObject({ name: "Rakesh", email: "r@a.com", role: "superadmin", isStaff: true, staffTier: "head", orgCount: 2 });
    expect(r.ok && r.data[1]).toMatchObject({ email: null, isStaff: false, staffTier: null, orgCount: 0 });
  });
});

describe("getPlatformStats", () => {
  it("maps counts + plan breakdown", async () => {
    const r = await getPlatformStats(rpcClient({ data: { orgCount: 5, userCount: 12, projectCount: 8, staffCount: 1, pendingSignups: 2, approvedSignups: 3, plans: { basic: 2, pro: 3 } }, error: null }));
    expect(r.ok && r.data).toMatchObject({ orgCount: 5, userCount: 12, pendingSignups: 2, approvedSignups: 3 });
    expect(r.ok && r.data?.plans).toEqual({ basic: 2, pro: 3 });
  });
  it("null data (non-superadmin) → ok null; error surfaced", async () => {
    expect(await getPlatformStats(rpcClient({ data: null, error: null }))).toEqual({ ok: true, data: null });
    expect(await getPlatformStats(rpcClient({ data: null, error: { message: "denied" } }))).toEqual({ ok: false, error: "denied" });
  });
});

describe("setOrgPlan + plan helpers", () => {
  it("returns the from/to transition on success", async () => {
    const r = await setOrgPlan(rpcClient({ data: { ok: true, org: "ABC", from: "basic", to: "enterprise" }, error: null }), "o1", "enterprise");
    expect(r).toEqual({ ok: true, data: { org: "ABC", from: "basic", to: "enterprise" } });
  });
  it("surfaces an unknown-plan payload error", async () => {
    const r = await setOrgPlan(rpcClient({ data: { ok: false, error: "unknown plan: gold" }, error: null }), "o1", "gold");
    expect(r).toEqual({ ok: false, error: "unknown plan: gold" });
  });
  it("surfaces an rpc-level error (non-superadmin)", async () => {
    const r = await setOrgPlan(rpcClient({ data: null, error: { message: "only a superadmin can change an organization plan" } }), "o1", "pro");
    expect(r.ok).toBe(false);
  });
  it("planUnlocksCustomRoles starts at business and includes enterprise + custom", () => {
    expect(planUnlocksCustomRoles("business")).toBe(true);
    expect(planUnlocksCustomRoles("enterprise")).toBe(true);
    expect(planUnlocksCustomRoles("custom")).toBe(true);
    expect(planUnlocksCustomRoles("basic")).toBe(false);
    expect(planUnlocksCustomRoles("pro")).toBe(false);
  });
  it("ASSIGNABLE_PLANS includes enterprise", () => {
    expect(ASSIGNABLE_PLANS).toContain("enterprise");
  });
});
