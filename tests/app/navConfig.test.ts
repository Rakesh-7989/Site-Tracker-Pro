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

  it("orgadmin with admin org tier sees New Project + Members + Billing + Custom Roles", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "O", identityRole: "orgadmin", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", isAdmin: true, joinedAt: "2026-01-01" }],
    }));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/projects/new");
    expect(paths).toContain("/org/members");
    expect(paths).toContain("/org/billing");
    expect(paths).toContain("/org/roles");
  });

  it("superadmin sees the Platform section", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "S", identityRole: "superadmin", isStaff: true },
    }));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/admin/users");
    expect(paths).toContain("/admin/orgs");
  });

  it("owner + head see /admin/staff; plain superadmin + member do not", () => {
    const mk = (staffTier: "owner" | "head" | "member" | null) => buildNav(session({
      user: { id: "u", email: "a@b", name: "S", identityRole: "superadmin", isStaff: true, staffTier },
    })).map(n => n.to);
    expect(mk("owner")).toContain("/admin/staff");
    expect(mk("head")).toContain("/admin/staff");
    expect(mk("member")).not.toContain("/admin/staff");
    expect(mk(null)).not.toContain("/admin/staff");
  });

  it("staff MEMBER scoped to specific areas only sees those admin items (mig 106)", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "M", identityRole: "superadmin", isStaff: true, staffTier: "member", staffAreas: ["signups", "upgrades"] },
    }));
    const paths = nav.map(n => n.to);
    // granted areas → visible
    expect(paths).toContain("/admin/signups");
    expect(paths).toContain("/admin/upgrades");
    // ungranted areas → hidden
    expect(paths).not.toContain("/admin/users");
    expect(paths).not.toContain("/admin/orgs");
    expect(paths).not.toContain("/admin/roles");
    // owner/head-only item stays hidden for members regardless
    expect(paths).not.toContain("/admin/staff");
  });

  it("staff MEMBER with empty grants sees ALL admin areas (empty = full access)", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "M", identityRole: "superadmin", isStaff: true, staffTier: "member", staffAreas: [] },
    }));
    const paths = nav.map(n => n.to);
    for (const p of ["/admin/signups", "/admin/users", "/admin/orgs", "/admin/roles", "/admin/upgrades"]) {
      expect(paths).toContain(p);
    }
  });

  it("owner/head ignore area scoping — always see every admin area", () => {
    for (const t of ["owner", "head"] as const) {
      const nav = buildNav(session({
        user: { id: "u", email: "a@b", name: t, identityRole: "superadmin", isStaff: true, staffTier: t, staffAreas: ["signups"] },
      }));
      const paths = nav.map(n => n.to);
      for (const p of ["/admin/signups", "/admin/users", "/admin/orgs", "/admin/roles", "/admin/upgrades", "/admin/staff"]) {
        expect(paths).toContain(p);
      }
    }
  });

  it("site_engineer sees Daily Reports but not org admin", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "SE", identityRole: "site_engineer", isStaff: false },
    }));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/dpr");
    expect(paths).not.toContain("/org/members");
  });

  // Vendor directory access: org admins (orgadmin / org-tier admin) + prospector + superadmin only.
  it("orgadmin sees /vendors", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "O", identityRole: "orgadmin", isStaff: false },
    }));
    expect(nav.map(n => n.to)).toContain("/vendors");
  });

  it("prospector sees /vendors", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "P", identityRole: "prospector", isStaff: false },
    }));
    expect(nav.map(n => n.to)).toContain("/vendors");
  });

  it("org-tier admin sees /vendors (e.g. a PM granted org admin via membership)", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "PM", identityRole: "pm", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", isAdmin: true, joinedAt: "2026-01-01" }],
    }));
    expect(nav.map(n => n.to)).toContain("/vendors");
  });

  it("plain pm WITHOUT org-tier admin does NOT see /vendors", () => {
    const nav = buildNav(session({
      user: { id: "u", email: "a@b", name: "PM", identityRole: "pm", isStaff: false },
    }));
    expect(nav.map(n => n.to)).not.toContain("/vendors");
  });

  it("contractor / client / site_engineer do NOT see /vendors", () => {
    for (const r of ["contractor", "client", "site_engineer"] as const) {
      const nav = buildNav(session({
        user: { id: "u", email: "a@b", name: r, identityRole: r, isStaff: false },
      }));
      expect(nav.map(n => n.to)).not.toContain("/vendors");
    }
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
