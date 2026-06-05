// SiteTrack Pro — platform (superadmin) query tests.

import { describe, it, expect } from "vitest";
import { listPlatformOrgs, listPlatformUsers, getPlatformStats } from "@/app/platformAdminQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

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

describe("listPlatformUsers", () => {
  it("maps profile + email + staff + org count", async () => {
    const r = await listPlatformUsers(rpcClient({ data: [
      { id: "u1", name: "Rakesh", email: "r@a.com", role: "superadmin", is_staff: true, org_count: 2, created_at: "2026-02-02" },
      { id: "u2", name: "X", email: null, role: "client", is_staff: false, org_count: 0, created_at: "2026-03-03" },
    ], error: null }));
    expect(r.ok && r.data[0]).toMatchObject({ name: "Rakesh", email: "r@a.com", role: "superadmin", isStaff: true, orgCount: 2 });
    expect(r.ok && r.data[1]).toMatchObject({ email: null, isStaff: false, orgCount: 0 });
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
