// SiteTrack Pro — fetchAuthSession tests.

import { describe, it, expect } from "vitest";
import {
  normalizeProfile,
  normalizeOrgMembership,
  normalizeProjectMembership,
  pickActiveOrgId,
  buildAuthSession,
  fetchAuthSession,
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
  it("returns null when role is not a valid org tier", () => {
    expect(normalizeOrgMembership({ org_id: "o-1", role: "orgadmin" /* not an org tier */, joined_at: "2026-01-01", organizations: { id: "o-1", name: "X", slug: "x" } })).toBeNull();
  });

  it("normalizes the nested organizations join", () => {
    const r = normalizeOrgMembership({
      org_id: "o-1",
      role: "admin",
      joined_at: "2026-01-01T00:00:00Z",
      organizations: { id: "o-1", name: "Demo Builder", slug: "demo-builder" },
    });
    expect(r).not.toBeNull();
    expect(r!.orgId).toBe("o-1");
    expect(r!.orgName).toBe("Demo Builder");
    expect(r!.role).toBe("admin");
  });

  it("returns null when the join is empty", () => {
    expect(normalizeOrgMembership({ role: "admin", joined_at: "2026-01-01" })).toBeNull();
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
    { orgId: "o-1", orgName: "A", orgSlug: "a", role: "admin" as const, joinedAt: "2026-01-01" },
    { orgId: "o-2", orgName: "B", orgSlug: "b", role: "pm" as const, joinedAt: "2026-01-01" },
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
        { org_id: "o-1", role: "admin", joined_at: "2026-01-01", organizations: { id: "o-1", name: "A", slug: "a" } },
        { org_id: "o-bad", role: "orgadmin" /* invalid org tier */, joined_at: "x", organizations: { id: "o-bad", name: "B", slug: "b" } },
      ],
      [
        { project_id: "p-1", role: "site_engineer", assigned_by: null, assigned_at: "x", removed_at: null, projects: { id: "p-1", name: "Vasavi", type: "construction" } },
        { project_id: "p-bad", role: "architect", projects: { id: "p-bad", name: "X", type: "residential" /* invalid */ } },
      ],
      "o-1",
    );
    expect(session.orgs.length).toBe(1);
    expect(session.orgs[0]!.orgId).toBe("o-1");
    expect(session.projectMemberships.length).toBe(1);
    expect(session.activeOrgId).toBe("o-1");
  });
});

// ── fetchAuthSession (mocked client) ──
function makeClient(handlers: Record<string, (q: { col?: string; value?: string }) => Promise<{ data: unknown; error: unknown | null }>>) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(_col: string, _val: string) { return builder; },
        is(_col: string, _val: null) { return builder; },
        async maybeSingle() {
          return handlers[table]?.({ }) ?? { data: null, error: null };
        },
        then(resolve: (v: { data: unknown; error: unknown | null }) => unknown) {
          const p = handlers[table]?.({ }) ?? Promise.resolve({ data: [], error: null });
          return p.then(resolve);
        },
      };
      return builder;
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
          { org_id: "o-1", role: "admin", joined_at: "2026-01-01", organizations: { id: "o-1", name: "Demo", slug: "demo" } },
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
      expect(r.session.projectMemberships.length).toBe(1);
      expect(r.session.activeOrgId).toBe("o-1");
    }
  });
});
