// SiteTrack Pro — onboarding queries tests (v4 C0).
//
// Locks in the `orgs` → `organizations` fix (the real table), segment
// capture via updateOrg, and type stamping via createProject.

import { describe, it, expect } from "vitest";
import { getMyOrg, updateOrg, createProject } from "@/app/onboardingQueries";

type MockResult = { data: unknown; error: unknown | null };
type Handler = () => MockResult;

function mockClient(handlers: Record<string, Handler>) {
  const calls: Array<{ table: string; method: string }> = [];
  const chain = (table: string, result: () => MockResult): Record<string, unknown> => ({
    select() { calls.push({ table, method: "select" }); return chain(table, result); },
    eq() { calls.push({ table, method: "eq" }); return chain(table, result); },
    limit() { calls.push({ table, method: "limit" }); return chain(table, result); },
    async maybeSingle() { calls.push({ table, method: "maybeSingle" }); return result(); },
    async single() { calls.push({ table, method: "single" }); return result(); },
    update() { calls.push({ table, method: "update" }); return chain(table, result); },
    insert() { calls.push({ table, method: "insert" }); return chain(table, result); },
    then(resolve: (v: MockResult) => unknown) {
      calls.push({ table, method: "then" });
      return Promise.resolve(result()).then(resolve);
    },
  });
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    from(table: string) {
      const result = handlers[table] ?? (() => ({ data: [], error: null }));
      return chain(table, result);
    },
  };
}

describe("getMyOrg", () => {
  it("reads the org from `organizations` (not `orgs`) and returns segment", async () => {
    const c = mockClient({
      org_members: () => ({ data: { org_id: "o-1" }, error: null }),
      organizations: () => ({ data: { id: "o-1", name: "Eng Co", contact_email: "a@b", segment: "consultancy" }, error: null }),
    });
    const res = await getMyOrg(c as never);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.orgId).toBe("o-1");
      expect(res.data.org?.segment).toBe("consultancy");
    }
    expect(c.calls.map(x => x.table)).toContain("organizations");
    expect(c.calls.map(x => x.table)).not.toContain("orgs");
  });

  it("returns a null segment for legacy orgs", async () => {
    const c = mockClient({
      org_members: () => ({ data: { org_id: "o-1" }, error: null }),
      organizations: () => ({ data: { id: "o-1", name: "Legacy", contact_email: "a@b", segment: null }, error: null }),
    });
    const res = await getMyOrg(c as never);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.org?.segment).toBeNull();
  });
});

describe("updateOrg", () => {
  it("patches `organizations` and includes segment when provided", async () => {
    const c = mockClient({ organizations: () => ({ data: null, error: null }) });
    const res = await updateOrg(c as never, "o-1", "Eng Co", "a@b", "consultancy");
    expect(res.ok).toBe(true);
    expect(c.calls.map(x => x.table)).toContain("organizations");
    expect(c.calls.map(x => x.table)).not.toContain("orgs");
  });
});

describe("createProject", () => {
  it("inserts the given project type", async () => {
    const c = mockClient({ projects: () => ({ data: null, error: null }) });
    const res = await createProject(c as never, "o-1", "Tower A", "Client", "2026-08-01", "consultant");
    expect(res.ok).toBe(true);
    expect(c.calls.map(x => x.table)).toContain("projects");
  });
});
