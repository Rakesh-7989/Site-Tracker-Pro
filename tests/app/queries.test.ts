// SiteTrack Pro — queries.ts tests (Phase 3).

import { describe, it, expect } from "vitest";
import { listProjectsForOrg, createProject, memberProjectScope, type MemberProjectScope } from "@/app/queries";
import type { AuthSession } from "@/auth";

// Build a chainable mock matching the subset of the Supabase client we use.
function mockClient(opts: {
  select?: { data: unknown[] | null; error: unknown | null };
  insert?: { data: unknown; error: unknown | null };
}) {
  const trace: { inCalls: Array<[string, unknown[]]> } = { inCalls: [] };
  const client = {
    trace,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order: async () => opts.select ?? { data: [], error: null },
                in: (col: string, val: unknown[]) => {
                  trace.inCalls.push([col, val]);
                  return { order: async () => opts.select ?? { data: [], error: null } };
                },
                single: async () => opts.insert ?? { data: { id: "new-id" }, error: null },
              };
            },
            single: async () => opts.insert ?? { data: { id: "new-id" }, error: null },
          };
        },
        insert() {
          return {
            select() {
              return { single: async () => opts.insert ?? { data: { id: "new-id" }, error: null } };
            },
          };
        },
      };
    },
  };
  return client;
}

/** Minimal AuthSession shape for scope-derivation tests. */
function sessionFor(identityRole: string, opts: { isAdmin?: boolean; memberIds?: string[]; activeOrgId?: string | null } = {}): AuthSession {
  return {
    user: { id: "u-1", email: "member@example.com", identityRole: identityRole as AuthSession["user"]["identityRole"], name: "Member", isStaff: false },
    orgs: [{ orgId: "o-1", orgName: "Org", orgSlug: "org", segment: null, isAdmin: !!opts.isAdmin, joinedAt: "", status: "active" }],
    activeOrgId: opts.activeOrgId === undefined ? "o-1" : opts.activeOrgId,
    projectMemberships: (opts.memberIds ?? []).map((projectId) => ({
      projectId,
      projectName: projectId,
      projectType: "construction" as const,
      role: "pm" as const,
      assignedAt: "",
      removedAt: null,
    })),
  } as AuthSession;
}

describe("memberProjectScope", () => {
  it("orgadmin sees all org projects", () => {
    expect(memberProjectScope(sessionFor("orgadmin", { memberIds: ["a"] }))).toEqual({ mode: "all" });
  });
  it("superadmin sees all org projects", () => {
    expect(memberProjectScope(sessionFor("superadmin", { memberIds: [] }))).toEqual({ mode: "all" });
  });
  it("org admin member (isAdmin) sees all", () => {
    expect(memberProjectScope(sessionFor("architect", { isAdmin: true, memberIds: ["a"] }))).toEqual({ mode: "all" });
  });
  it("regular member is scoped to assigned project ids", () => {
    const r = memberProjectScope(sessionFor("architect", { memberIds: ["p-1", "p-2"] }));
    expect(r).toEqual({ mode: "member", projectIds: ["p-1", "p-2"] });
  });
  it("regular member with no memberships is scoped to an empty set", () => {
    expect(memberProjectScope(sessionFor("architect", { memberIds: [] }))).toEqual({ mode: "member", projectIds: [] });
  });
  it("org admin flag on an unrelated inactive org does not count", () => {
    const r = memberProjectScope({
      ...sessionFor("architect", { memberIds: ["p-1"] }),
      orgs: [{ orgId: "other", orgName: "Other", orgSlug: "o", segment: null, isAdmin: true, joinedAt: "", status: "active" }],
    });
    expect(r).toEqual({ mode: "member", projectIds: ["p-1"] });
  });
});

describe("listProjectsForOrg", () => {
  it("maps rows to ProjectSummary defensively", async () => {
    const client = mockClient({
      select: {
        data: [
          { id: "p-1", name: "Vasavi", type: "construction", status: "active", location: "Hyderabad" },
          { id: "p-2", name: null, type: undefined, status: null, location: null },
        ],
        error: null,
      },
    });
    const r = await listProjectsForOrg(client, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data[0]!.name).toBe("Vasavi");
      expect(r.data[1]!.name).toBe("Untitled");      // null → fallback
      expect(r.data[1]!.type).toBe("construction");  // undefined → default
      expect(r.data[1]!.location).toBeNull();
    }
  });

  it("returns ok:false on query error", async () => {
    const client = mockClient({ select: { data: null, error: { message: "boom" } } });
    const r = await listProjectsForOrg(client, "o-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/boom/);
  });

  it("returns empty list gracefully when no rows", async () => {
    const client = mockClient({ select: { data: [], error: null } });
    const r = await listProjectsForOrg(client, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });

  it("applies an IN filter on assigned projects when member-scoped", async () => {
    const client = mockClient({
      select: { data: [{ id: "p-1", name: "Mine", type: "construction", status: "active", location: null }], error: null },
    });
    const r = await listProjectsForOrg(client, "o-1", { mode: "member", projectIds: ["p-1"] } as MemberProjectScope);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(1);
    expect(client.trace.inCalls).toEqual([["id", ["p-1"]]]);
  });

  it("short-circuits to empty when member has no assigned projects", async () => {
    const client = mockClient({ select: { data: [{ id: "p-other", name: "Not Mine" }], error: null } });
    const r = await listProjectsForOrg(client, "o-1", { mode: "member", projectIds: [] } as MemberProjectScope);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
    expect(client.trace.inCalls).toHaveLength(0); // never issued an IN/order query
  });

  it("does not scope when mode is all (org admins)", async () => {
    const client = mockClient({ select: { data: [{ id: "p-1", name: "A", type: "design" }], error: null } });
    const r = await listProjectsForOrg(client, "o-1", { mode: "all" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(1);
    expect(client.trace.inCalls).toHaveLength(0);
  });
});

describe("createProject", () => {
  it("returns the new id on success", async () => {
    const client = mockClient({ insert: { data: { id: "p-new" }, error: null } });
    const r = await createProject(client, { orgId: "o-1", name: "New", type: "interior" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("p-new");
  });

  it("returns ok:false on insert error", async () => {
    const client = mockClient({ insert: { data: null, error: { message: "RLS denied" } } });
    const r = await createProject(client, { orgId: "o-1", name: "New", type: "design" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/RLS denied/);
  });
});
