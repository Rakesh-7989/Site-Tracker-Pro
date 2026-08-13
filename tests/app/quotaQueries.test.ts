// SiteTrack Pro — quota queries + pure helpers tests.

import { describe, it, expect } from "vitest";
import { fetchOrgQuota, quotaPct, atQuota, usageRollup, anyAtQuota, resourceAtQuota } from "@/app/quotaQueries";

describe("fetchOrgQuota mapper", () => {
  it("maps users + projects rows with camelCase", async () => {
    const client = {
      rpc: () => Promise.resolve({
        error: null,
        data: [
          { resource: "users", current_count: 7, max_allowed: 5, at_quota: true },
          { resource: "projects", current_count: 3, max_allowed: 10, at_quota: false },
        ],
      }),
    };
    const res = await fetchOrgQuota(client, "org1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toEqual([
      { resource: "users", currentCount: 7, maxAllowed: 5, atQuota: true },
      { resource: "projects", currentCount: 3, maxAllowed: 10, atQuota: false },
    ]);
  });

  it("surfaces RPC errors", async () => {
    const client = { rpc: () => Promise.resolve({ error: { message: "denied" }, data: null }) };
    const res = await fetchOrgQuota(client, "org1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });

  it("handles missing max_allowed (unlimited)", async () => {
    const client = {
      rpc: () => Promise.resolve({
        error: null,
        data: [{ resource: "projects", current_count: 99, max_allowed: null, at_quota: false }],
      }),
    };
    const res = await fetchOrgQuota(client, "org1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0].maxAllowed).toBeNull();
  });
});

describe("quotaPct pure", () => {
  it("returns pct when max > 0", () => {
    expect(quotaPct({ resource: "users", currentCount: 3, maxAllowed: 10, atQuota: false })).toBe(30);
  });
  it("caps at 100", () => {
    expect(quotaPct({ resource: "users", currentCount: 12, maxAllowed: 10, atQuota: true })).toBe(100);
  });
  it("returns null when max is null", () => {
    expect(quotaPct({ resource: "projects", currentCount: 50, maxAllowed: null, atQuota: false })).toBeNull();
  });
  it("returns null when max is 0", () => {
    expect(quotaPct({ resource: "users", currentCount: 1, maxAllowed: 0, atQuota: false })).toBeNull();
  });
});

describe("atQuota pure", () => {
  it("true when atQuota flag set", () => {
    expect(atQuota({ resource: "users", currentCount: 5, maxAllowed: 5, atQuota: true })).toBe(true);
  });
  it("false when atQuota flag false", () => {
    expect(atQuota({ resource: "users", currentCount: 3, maxAllowed: 10, atQuota: false })).toBe(false);
  });
});

describe("usageRollup pure", () => {
  it("rolls up users + projects with pct + atQuota", () => {
    const rows = [
      { resource: "users" as const, currentCount: 4, maxAllowed: 5, atQuota: false },
      { resource: "projects" as const, currentCount: 2, maxAllowed: 10, atQuota: false },
    ];
    const rollup = usageRollup(rows);
    expect(rollup.users).toEqual({ current: 4, max: 5, pct: 80, atQuota: false });
    expect(rollup.projects).toEqual({ current: 2, max: 10, pct: 20, atQuota: false });
  });
  it("handles missing rows with defaults", () => {
    const rollup = usageRollup([]);
    expect(rollup.users).toEqual({ current: 0, max: null, pct: null, atQuota: false });
    expect(rollup.projects).toEqual({ current: 0, max: null, pct: null, atQuota: false });
  });
  it("handles unlimited max (null)", () => {
    const rows = [
      { resource: "projects" as const, currentCount: 99, maxAllowed: null, atQuota: false },
    ];
    const rollup = usageRollup(rows);
    expect(rollup.projects.max).toBeNull();
    expect(rollup.projects.pct).toBeNull();
  });
});

describe("anyAtQuota / resourceAtQuota pure", () => {
  const rollup = {
    users: { current: 5, max: 5, pct: 100, atQuota: true },
    projects: { current: 3, max: 10, pct: 30, atQuota: false },
    storage: { current: 0, max: null, pct: null, atQuota: false },
    deliverables: { current: 0, max: null, pct: null, atQuota: false },
    crm_leads: { current: 0, max: null, pct: null, atQuota: false },
  };
  it("anyAtQuota true when users at quota", () => {
    expect(anyAtQuota(rollup)).toBe(true);
  });
  it("resourceAtQuota users true", () => {
    expect(resourceAtQuota(rollup, "users")).toBe(true);
  });
  it("resourceAtQuota projects false", () => {
    expect(resourceAtQuota(rollup, "projects")).toBe(false);
  });
});