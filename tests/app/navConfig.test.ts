// SiteTrack Pro — nav-config tests (Phase 3).
//
// Verifies the role-aware sidebar shows the right items per role, using
// real AuthSession fixtures + the pure capability resolver.

import { describe, it, expect } from "vitest";
import { buildNav, groupNav, NAV_CATALOG } from "@/app/nav-config";
import type { AuthSession, CompanySegment } from "@/auth";
import type { ModuleId } from "@/modules";

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
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", segment: null, isAdmin: true, joinedAt: "2026-01-01" }],
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
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", segment: null, isAdmin: true, joinedAt: "2026-01-01" }],
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

  it("procurement:view holders see /procurement only in architecture/interior/multiple segments (v4 D5)", () => {
    const mk = (role: "pm" | "design_head" | "consultant_head" | "designer", segment: "architecture" | "interior" | "multiple" | "construction" | "consultancy" | null) =>
      buildNav(session({
        user: { id: "u", email: "a@b", name: role, identityRole: role, isStaff: false },
        orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", segment, isAdmin: false, joinedAt: "2026-01-01" }],
        activeOrgId: "o-1",
        projectMemberships: [],
      })).map(n => n.to);

    // pm, design_head, consultant_head hold procurement:view → visible in arch/interior/multiple.
    for (const role of ["pm", "design_head", "consultant_head"] as const) {
      expect(mk(role, "architecture")).toContain("/procurement");
      expect(mk(role, "interior")).toContain("/procurement");
      expect(mk(role, "multiple")).toContain("/procurement");
      // NOT in construction/consultancy segments.
      expect(mk(role, "construction")).not.toContain("/procurement");
      expect(mk(role, "consultancy")).not.toContain("/procurement");
      // NOT without a segment (legacy org).
      expect(mk(role, null)).not.toContain("/procurement");
    }

    // designer does NOT hold procurement:view → never sees it.
    expect(mk("designer", "architecture")).not.toContain("/procurement");
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

describe("buildNav — segment gating (v4 C0)", () => {
  const segItem = (segments: CompanySegment[]) => ({
    to: "/segment-gated",
    label: "Segment Gated",
    icon: "lock" as const,
    requires: "project:create" as const,
    segments,
  });
  const segOrg = (segment: CompanySegment | null): AuthSession => ({
    user: { id: "u", email: "a@b", name: "O", identityRole: "orgadmin", isStaff: false },
    orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", segment, isAdmin: true, joinedAt: "2026-01-01" }],
    activeOrgId: "o-1",
    projectMemberships: [],
  });

  it("a consultancy-gated item shows only for a consultancy org", () => {
    const catalog = [segItem(["consultancy"])];
    expect(buildNav(segOrg("consultancy"), catalog).map(n => n.to)).toContain("/segment-gated");
    expect(buildNav(segOrg("construction"), catalog).map(n => n.to)).not.toContain("/segment-gated");
    expect(buildNav(segOrg("multiple"), catalog).map(n => n.to)).not.toContain("/segment-gated");
  });

  it("a multi-segment item shows for each listed segment only", () => {
    const catalog = [segItem(["architecture", "interior"])];
    expect(buildNav(segOrg("architecture"), catalog).map(n => n.to)).toContain("/segment-gated");
    expect(buildNav(segOrg("interior"), catalog).map(n => n.to)).toContain("/segment-gated");
    expect(buildNav(segOrg("consultancy"), catalog).map(n => n.to)).not.toContain("/segment-gated");
  });

  it("a null segment (legacy org) hides segment-gated items", () => {
    const catalog = [segItem(["consultancy"])];
    expect(buildNav(segOrg(null), catalog).map(n => n.to)).not.toContain("/segment-gated");
  });

  it("items without a segments field always pass the gate", () => {
    const catalog = [{ to: "/open", label: "Open", icon: "home" as const }];
    expect(buildNav(segOrg(null), catalog).map(n => n.to)).toContain("/open");
  });
});

describe("buildNav — module gating (v4 Phase 1)", () => {
  const modItem = (modules: ModuleId[]) => ({
    to: "/module-gated",
    label: "Module Gated",
    icon: "lock" as const,
    requires: "project:create" as const,
    modules,
  });
  const modOrg = (enabledModules: string[] | null | undefined): AuthSession => ({
    user: { id: "u", email: "a@b", name: "O", identityRole: "orgadmin", isStaff: false },
    orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", segment: "architecture", enabledModules: enabledModules as never, isAdmin: true, joinedAt: "2026-01-01" }],
    activeOrgId: "o-1",
    projectMemberships: [],
  });

  it("a module-gated item shows only when at least one required module is enabled", () => {
    const catalog = [modItem(["design", "consultancy"])];
    expect(buildNav(modOrg(["design", "finance"]), catalog).map(n => n.to)).toContain("/module-gated");
    expect(buildNav(modOrg(["site_ops"]), catalog).map(n => n.to)).not.toContain("/module-gated");
  });

  it("null / missing enabled_modules (legacy org) shows module-gated items (back-compat)", () => {
    const catalog = [modItem(["design"])];
    expect(buildNav(modOrg(null), catalog).map(n => n.to)).toContain("/module-gated");
    expect(buildNav(modOrg(undefined), catalog).map(n => n.to)).toContain("/module-gated");
  });

  it("items without a modules field always pass the module gate", () => {
    const catalog = [{ to: "/open", label: "Open", icon: "home" as const, requires: "project:create" as const }];
    expect(buildNav(modOrg(["site_ops"]), catalog).map(n => n.to)).toContain("/open");
  });

  it("a gated org hides procurement/site_ops/insights nav but keeps Dashboard + design-free items", () => {
    const nav = buildNav(modOrg(["projects", "design"]));
    const paths = nav.map(n => n.to);
    expect(paths).toContain("/dashboard");
    expect(paths).not.toContain("/procurement");
    expect(paths).not.toContain("/vendors");
    expect(paths).not.toContain("/pos");
    expect(paths).not.toContain("/dpr");
    expect(paths).not.toContain("/forecast");
    expect(paths).not.toContain("/rabills");
  });

  it("catalog /client is gated by the clients module", () => {
    // share:client:portal is held by the client identity role only.
    const clientOrg = (m: string[]): AuthSession => ({
      user: { id: "u", email: "c@x", name: "C", identityRole: "client", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "d", segment: "architecture", enabledModules: m as never, isAdmin: false, joinedAt: "2026-01-01" }],
      activeOrgId: "o-1",
      projectMemberships: [],
    });
    const mk = (m: string[]) => buildNav(clientOrg(m)).map(n => n.to);
    expect(mk(["projects", "clients"])).toContain("/client");
    expect(mk(["projects", "design"])).not.toContain("/client");
  });
});
