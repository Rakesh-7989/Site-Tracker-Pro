// SiteTrack Pro — fetchAuthSession tests.

import { describe, it, expect } from "vitest";
import {
  normalizeProfile,
  normalizeOrgMembership,
  normalizeProjectMembership,
  pickActiveOrgId,
  buildAuthSession,
  fetchAuthSession,
  fetchRbacLayers,
} from "@/auth/fetchAuthSession";

describe("normalizeProfile", () => {
  it("returns ok=false when row is null", () => {
    const r = normalizeProfile(null, "a@b.in");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("no-profile");
  });

  it("returns ok=false when role is not a known identity role", () => {
    const r = normalizeProfile({ id: "u-1", role: "bogus", name: "x", avatar: null, is_staff: false }, "a@b.in");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid-role");
  });

  it("normalizes a valid row + uses email-prefix fallback for name", () => {
    const r = normalizeProfile({ id: "u-1", role: "architect", name: null, avatar: null, is_staff: false }, "ramesh@firm.in");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.id).toBe("u-1");
      expect(r.user.email).toBe("ramesh@firm.in");
      expect(r.user.identityRole).toBe("architect");
      expect(r.user.isStaff).toBe(false);
    }
  });

  it("preserves explicit avatar + isStaff", () => {
    const r = normalizeProfile({ id: "u-1", role: "superadmin", name: "R", avatar: "https://x/y.png", is_staff: true }, "r@x");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.avatarUrl).toBe("https://x/y.png");
      expect(r.user.isStaff).toBe(true);
    }
  });
});

describe("normalizeOrgMembership", () => {
  it("returns null when the row shape is missing org_id", () => {
    expect(normalizeOrgMembership({ joined_at: "2026-01-01", organizations: { name: "X", slug: "x" } })).toBeNull();
  });

  it("normalizes the nested organizations join", () => {
    const r = normalizeOrgMembership({
      org_id: "o-1",
      is_admin: true,
      joined_at: "2026-01-01T00:00:00Z",
      organizations: { id: "o-1", name: "Demo Builder", slug: "demo-builder", segment: "construction" },
    });
    expect(r).not.toBeNull();
    expect(r!.orgId).toBe("o-1");
    expect(r!.orgName).toBe("Demo Builder");
    expect(r!.segment).toBe("construction");
    expect(r!.isAdmin).toBe(true);
  });

  it("reads a flat segment column when the join shape has none", () => {
    const r = normalizeOrgMembership({
      org_id: "o-1",
      segment: "consultancy",
      organizations: { id: "o-1", name: "Eng Co", slug: "eng-co" },
    });
    expect(r!.segment).toBe("consultancy");
  });

  it("normalizes enabled_modules from the organizations join (migration 155)", () => {
    const r = normalizeOrgMembership({
      org_id: "o-1",
      organizations: { id: "o-1", name: "Firm", slug: "firm", segment: "architecture", enabled_modules: ["projects", "design", "bogus", "design", "finance"] },
    });
    expect(r!.enabledModules).toEqual(["projects", "design", "finance"]);
  });

  it("missing / empty enabled_modules → null (not configured)", () => {
    const noField = normalizeOrgMembership({
      org_id: "o-1",
      organizations: { id: "o-1", name: "Firm", slug: "firm" },
    });
    expect(noField!.enabledModules).toBeNull();

    const empty = normalizeOrgMembership({
      org_id: "o-1",
      organizations: { id: "o-1", name: "Firm", slug: "firm", enabled_modules: [] },
    });
    expect(empty!.enabledModules).toBeNull();
  });

  it("coerces unknown / legacy-null segment to null (never rejects the row)", () => {
    const unknown = normalizeOrgMembership({
      org_id: "o-1",
      segment: "realestate",
      organizations: { id: "o-1", name: "X", slug: "x" },
    });
    expect(unknown!.segment).toBeNull();

    const legacy = normalizeOrgMembership({
      org_id: "o-1",
      organizations: { id: "o-1", name: "X", slug: "x", segment: null },
    });
    expect(legacy!.segment).toBeNull();
  });

  it("returns null when the join is empty", () => {
    expect(normalizeOrgMembership({ is_admin: true, joined_at: "2026-01-01" })).toBeNull();
  });
});

describe("normalizeProjectMembership", () => {
  it("returns null when role is not a valid project tier", () => {
    expect(normalizeProjectMembership({
      project_id: "p-1", role: "superadmin", projects: { id: "p-1", name: "X", type: "construction" },
    })).toBeNull();
  });

  it("returns null when project type is not in the catalog", () => {
    expect(normalizeProjectMembership({
      project_id: "p-1", role: "architect", projects: { id: "p-1", name: "X", type: "residential" },
    })).toBeNull();
  });

  it("normalizes a valid row including assigned_by + removed_at", () => {
    const r = normalizeProjectMembership({
      project_id: "p-1",
      role: "site_engineer",
      assigned_by: "u-pm",
      assigned_at: "2026-06-01T00:00:00Z",
      removed_at: null,
      projects: { id: "p-1", name: "Vasavi", type: "construction" },
    });
    expect(r).not.toBeNull();
    expect(r!.role).toBe("site_engineer");
    expect(r!.projectType).toBe("construction");
    expect(r!.assignedBy).toBe("u-pm");
    expect(r!.removedAt).toBeNull();
  });
});

describe("pickActiveOrgId", () => {
  const orgs = [
    { orgId: "o-1", orgName: "A", orgSlug: "a", segment: null, isAdmin: true, joinedAt: "2026-01-01", status: "active" as const },
    { orgId: "o-2", orgName: "B", orgSlug: "b", segment: null, isAdmin: false, joinedAt: "2026-01-01", status: "active" as const },
  ];
  it("honors preferred when it matches a membership", () => {
    expect(pickActiveOrgId(orgs, "o-2")).toBe("o-2");
  });
  it("falls back to first org when preferred not a member", () => {
    expect(pickActiveOrgId(orgs, "o-other")).toBe("o-1");
  });
  it("falls back to first org when preferred is null", () => {
    expect(pickActiveOrgId(orgs, null)).toBe("o-1");
  });
  it("returns null when no memberships", () => {
    expect(pickActiveOrgId([], "o-x")).toBeNull();
  });
});

describe("buildAuthSession", () => {
  it("filters invalid rows + chooses active org", () => {
    const user = { id: "u-1", email: "x@y", name: "R", identityRole: "architect" as const, isStaff: false };
    const session = buildAuthSession(
      user,
      [
        { org_id: "o-1", is_admin: true, joined_at: "2026-01-01", organizations: { id: "o-1", name: "A", slug: "a", segment: "construction" } },
        { org_id: "o-bad", joined_at: "x", organizations: { id: "o-bad", name: "", slug: "b" } },
      ],
      [
        { project_id: "p-1", role: "site_engineer", assigned_by: null, assigned_at: "x", removed_at: null, projects: { id: "p-1", name: "Vasavi", type: "construction" } },
        { project_id: "p-bad", role: "architect", projects: { id: "p-bad", name: "X", type: "residential" /* invalid */ } },
      ],
      "o-1",
    );
    expect(session.orgs.length).toBe(1);
    expect(session.orgs[0]!.orgId).toBe("o-1");
    expect(session.orgs[0]!.segment).toBe("construction");
    expect(session.projectMemberships.length).toBe(1);
    expect(session.activeOrgId).toBe("o-1");
  });
});

// ── fetchAuthSession (mocked client) ──
function makeClient(handlers: Record<string, (q: { col?: string; value?: string }) => Promise<{ data: unknown; error: unknown | null }>>) {
  return {
    from(table: string) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        in() { return builder; },
        async maybeSingle() {
          return handlers[table]?.({ }) ?? { data: null, error: null };
        },
        then<TResult1 = { data: unknown; error: unknown | null }, TResult2 = never>(
          onfulfilled?: ((v: { data: unknown; error: unknown | null }) => TResult1 | PromiseLike<TResult1>) | null | undefined,
          onrejected?: ((e: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
        ): PromiseLike<TResult1 | TResult2> {
          const p = handlers[table]?.({ }) ?? Promise.resolve({ data: [], error: null });
          return p.then(onfulfilled!, onrejected);
        },
      };
      return builder;
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
  };
}

describe("fetchAuthSession", () => {
  it("returns no-profile when profile row is missing", async () => {
    const c = makeClient({
      profiles: async () => ({ data: null, error: null }),
      org_members: async () => ({ data: [], error: null }),
      project_members: async () => ({ data: [], error: null }),
    });
    const r = await fetchAuthSession(c, { authUserId: "u-1", authUserEmail: "x@y" }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("no-profile");
  });

  it("returns invalid-role when DB role isn't in the catalog", async () => {
    const c = makeClient({
      profiles: async () => ({ data: { id: "u-1", name: "R", role: "ghost", avatar: null, is_staff: false }, error: null }),
    });
    const r = await fetchAuthSession(c, { authUserId: "u-1", authUserEmail: "x@y" }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid-role");
  });

  it("returns db-error when profile query fails", async () => {
    const c = makeClient({
      profiles: async () => ({ data: null, error: { message: "connection lost" } }),
    });
    const r = await fetchAuthSession(c, { authUserId: "u-1", authUserEmail: "x@y" }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("db-error");
      expect(r.error).toMatch(/connection lost/);
    }
  });

  it("returns a full session on happy path", async () => {
    const c = makeClient({
      profiles: async () => ({ data: { id: "u-1", name: "R", role: "architect", avatar: null, is_staff: false }, error: null }),
      org_members: async () => ({
        data: [
          { org_id: "o-1", role: "admin", joined_at: "2026-01-01", organizations: { id: "o-1", name: "Demo", slug: "demo", segment: "consultancy" } },
        ],
        error: null,
      }),
      project_members: async () => ({
        data: [
          { project_id: "p-1", role: "site_engineer", assigned_by: null, assigned_at: "2026-01-01", removed_at: null, projects: { id: "p-1", name: "Vasavi", type: "construction" } },
        ],
        error: null,
      }),
    });
    const r = await fetchAuthSession(c, { authUserId: "u-1", authUserEmail: "ramesh@firm.in" }, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.user.identityRole).toBe("architect");
      expect(r.session.orgs.length).toBe(1);
      expect(r.session.orgs[0]!.segment).toBe("consultancy");
      expect(r.session.projectMemberships.length).toBe(1);
      expect(r.session.activeOrgId).toBe("o-1");
    }
  });
});

// ── SEC-05 fail-closed: staff areas + RBAC2 context ──
describe("fetchAuthSession staff areas (SEC-05)", () => {
  function staffMemberClient(grantHandler?: () => Promise<{ data: unknown; error: unknown }>) {
    return makeClient({
      profiles: async () => ({ data: { id: "u-1", name: "S", role: "superadmin", avatar: null, is_staff: true, staff_tier: "member" }, error: null }),
      staff_area_grants: async () => (grantHandler ? await grantHandler() : { data: [], error: null }),
      org_members: async () => ({ data: [], error: null }),
      project_members: async () => ({ data: [], error: null }),
    });
  }

  it("member with grants gets exactly the granted areas", async () => {
    const c = staffMemberClient(async () => ({
      data: [{ area: "signups" }, { area: "users" }],
      error: null,
    }));
    const r = await fetchAuthSession(c, { authUserId: "u-1", authUserEmail: "staff@site-trak" }, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.user.staffAreas).toEqual(["signups", "users"]);
  });

  it("member with EMPTY grants gets NO admin areas (was: all)", async () => {
    const r = await fetchAuthSession(staffMemberClient(), { authUserId: "u-1", authUserEmail: "staff@site-trak" }, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.user.staffAreas).toEqual([]);
  });

  it("member whose grants fetch FAILS gets NO admin areas (fail-closed)", async () => {
    const c = staffMemberClient(async () => {
      throw new Error("connection lost");
    });
    const r = await fetchAuthSession(c, { authUserId: "u-1", authUserEmail: "staff@site-trak" }, null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.user.staffAreas).toEqual([]);
  });
});

describe("fetchRbacLayers (always-on, SEC-05 fail-closed)", () => {
  function rbacClient(aclHandler: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: [], error: null })) {
    return makeClient({
      rbac_profile_assignments: async () => ({ data: [], error: null }),
      rbac_role_profiles: async () => ({ data: [], error: null }),
      rbac_profile_bindings: async () => ({ data: [], error: null }),
      resource_acl_entries: aclHandler,
      client_portal_permissions: async () => ({ data: [], error: null }),
      vendor_project_scopes: async () => ({ data: [], error: null }),
    });
  }

  it("returns undefined when no active org", async () => {
    const ctx = await fetchRbacLayers(rbacClient(), "u-1", null);
    expect(ctx).toBeUndefined();
  });

  it("any fetch failure → EMPTY_RBAC_LAYERS_FAIL (fetchError, empty arrays)", async () => {
    const ctx = await fetchRbacLayers(
      rbacClient(async () => { throw new Error("acl query failed"); }),
      "u-1",
      "o-1",
    );
    expect(ctx).toBeDefined();
    expect(ctx!.fetchError).toBe(true);
    expect(ctx!.profiles).toEqual([]);
    expect(ctx!.bindings).toEqual([]);
    expect(ctx!.acl).toEqual([]);
    expect(ctx!.clientPermissions).toEqual([]);
    expect(ctx!.vendorScopes).toEqual([]);
  });

  it("happy path returns full normalized context without fetchError", async () => {
    const c = makeClient({
      rbac_profile_assignments: async () => ({ data: [{ profile_id: "prof-1" }], error: null }),
      rbac_role_profiles: async () => ({
        data: [{ id: "prof-1", code: "drafter", name: "Drafter", is_system: true, source_role: "junior_architect", scope: "project", org_id: null, created_at: "x" }],
        error: null,
      }),
      rbac_profile_bindings: async () => ({
        data: [{ id: "b1", profile_id: "prof-1", capability: "drawing:approve", effect: "deny", note: null }],
        error: null,
      }),
      resource_acl_entries: async () => ({ data: [], error: null }),
      client_portal_permissions: async () => ({ data: [], error: null }),
      vendor_project_scopes: async () => ({ data: [], error: null }),
    });
    const ctx = await fetchRbacLayers(c, "u-1", "o-1");
    expect(ctx).toBeDefined();
    expect(ctx!.fetchError).toBeUndefined();
    expect(ctx!.profiles.map((p) => p.code)).toEqual(["drafter"]);
    expect(ctx!.profiles[0]?.sourceRole).toBe("junior_architect");
    expect(ctx!.bindings[0]?.effect).toBe("deny");
    expect(ctx!.acl).toEqual([]);
    expect(ctx!.clientPermissions).toEqual([]);
    expect(ctx!.vendorScopes).toEqual([]);
  });
});
