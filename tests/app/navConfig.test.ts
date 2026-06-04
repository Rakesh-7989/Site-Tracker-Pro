// SiteTrack Pro — nav-config tests (Phase 3).
//
// Verifies the role-aware sidebar shows the right items per role, using
// real AuthSession fixtures + the pure capability resolver.

import { describe, it, expect } from "vitest";
import { buildNav, groupNav, NAV_CATALOG } from "@/app/nav-config";
import type { AuthSession } from "@/auth";

function session(overrides: Partial<AuthSession>): AuthSession {
  return {
    user: { id: "u", email: "a@b", name: "Test", identityRole: "client", isStaff: false },
    orgs: [],
    activeOrgId: null,
    projectMemberships: [],
    ...overrides,
  };
}

describe("buildNav", () => {
  it("returns [] for a null session", () => {
    expect(buildNav(null)).toEqual([]);
  });

  it("always shows Dashboard + Projects (no capability required)", () => {
    const nav = buildNav(session({}));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/dashboard");
    expect(paths).toContain("/projects");
  });

  it("client does NOT see New Project, Members, or Platform items", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "C", identityRole: "client", isStaff: false },
    }));
    const paths = nav.map(n => n.to);
    expect(paths).not.toContain("/projects/new");
    expect(paths).not.toContain("/org/members");
    expect(paths).not.toContain("/admin/users");
  });

  it("client DOES see Daily Reports (dpr:view)", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "C", identityRole: "client", isStaff: false },
    }));
    expect(nav.map(n => n.to)).toContain("/dpr");
  });

  it("orgadmin with admin org tier sees New Project + Members + Billing", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "O", identityRole: "orgadmin", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", role: "admin", joinedAt: "2026-01-01" }],
    }));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/projects/new");
    expect(paths).toContain("/org/members");
    expect(paths).toContain("/org/billing");
  });

  it("superadmin sees the Platform section", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "S", identityRole: "superadmin", isStaff: true },
    }));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/admin/users");
    expect(paths).toContain("/admin/orgs");
  });

  it("site_engineer sees Daily Reports but not org admin", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "SE", identityRole: "site_engineer", isStaff: false },
    }));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/dpr");
    expect(paths).not.toContain("/org/members");
  });
});

describe("groupNav", () => {
  it("groups items preserving catalog order", () => {
    const grouped = groupNav(NAV_CATALOG);
    const groupNames = grouped.map(g => g.group);
    expect(groupNames[0]).toBe("Workspace");
    // Every catalog item lands in exactly one group
    const total = grouped.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(NAV_CATALOG.length);
  });
});
