import { describe, it, expect } from "vitest";
import {
  PERMS,
  can,
  visibleProjectsForUser,
  canAccessProject,
  fallbackViewForUser,
  canOpenView,
  canUseQuickCapture,
  drawingKey,
  isReleasedCurrentDrawing,
  isSuperAdmin,
  isOrgAdmin,
} from "../src/lib/permissions.js";

const arch = { id: "u1", name: "Arjun", email: "a@buildco.in", role: "architect", org_id: "org1" };
const pm = { id: "u2", name: "Priya", email: "p@buildco.in", role: "pm", org_id: "org1" };
const con = { id: "u3", name: "Karthik", email: "k@karthikbuilders.in", role: "contractor", org_id: "org1" };
const cli = { id: "u4", name: "Vikram", email: "vikram@client.in", role: "client", org_id: "org1" };
const sup = { id: "u100", name: "Rakesh", email: "admin@sitetrack.in", role: "superadmin" };
const orgA = { id: "u200", name: "Owner", email: "owner@buildco.in", role: "orgadmin", org_id: "org1" };

const project = (overrides = {}) => ({
  id: "p1",
  name: "Skyline",
  client_email: "vikram@client.in",
  ...overrides,
});

describe("PERMS shape", () => {
  it("defines all v2 roles (v1 six + 12 new from Phase B + vendor from Session 24)", () => {
    const expected = [
      // v1 (6)
      "architect", "client", "contractor", "orgadmin", "pm", "superadmin",
      // v2 org additions (2 — orgadmin already in v1)
      "project_admin", "prospector",
      // v2 construction additions (5)
      "project_head", "mep_consultant", "site_engineer", "civil_engineer", "site_inspector",
      // v2 design / consultant additions (4)
      "interior_designer", "design_architect_interior", "designer", "consultant",
      // v2 contractor sub-tier (1)
      "sub_contractor",
      // Session 24 — vendor portal role (was missing in initial Phase B)
      "vendor",
    ].sort();
    expect(Object.keys(PERMS).sort()).toEqual(expected);
  });

  it("Session 24: vendor role has minimal scope (PO + materials read-only)", () => {
    expect(PERMS.vendor).toBeDefined();
    expect(PERMS.vendor.createProject).toBe(false);
    expect(PERMS.vendor.addUpdate).toBe(false);
    expect(PERMS.vendor.nav).toContain("po");
    expect(PERMS.vendor.nav).toContain("material-prices");
    expect(PERMS.vendor.tabs).toEqual(["overview"]); // vendor portal renders own UI
  });

  it("Phase B: every new role has the required PERMS shape (tabs + nav arrays)", () => {
    const newRoles = [
      "project_admin", "prospector", "project_head", "mep_consultant",
      "site_engineer", "civil_engineer", "site_inspector",
      "interior_designer", "design_architect_interior", "designer",
      "consultant", "sub_contractor",
    ];
    for (const r of newRoles) {
      expect(PERMS[r], r).toBeDefined();
      expect(Array.isArray(PERMS[r].tabs), `${r}.tabs`).toBe(true);
      expect(Array.isArray(PERMS[r].nav), `${r}.nav`).toBe(true);
      expect(typeof PERMS[r].createProject, `${r}.createProject`).toBe("boolean");
    }
  });

  it("Phase B: prospector has org-pipeline scope only (no project tabs except overview)", () => {
    expect(PERMS.prospector.tabs).toEqual(["overview"]);
    expect(PERMS.prospector.createProject).toBe(false);
    expect(PERMS.prospector.nav).not.toContain("activity"); // can't see full activity feed
  });

  it("Phase B: site_engineer has execution-heavy tabs + kiosk nav", () => {
    expect(PERMS.site_engineer.tabs).toContain("fieldops");
    expect(PERMS.site_engineer.tabs).toContain("inspections");
    expect(PERMS.site_engineer.tabs).toContain("labour");
    expect(PERMS.site_engineer.nav).toContain("kiosk-labour");
  });

  it("Phase B: site_inspector cannot create or edit (read + inspect only)", () => {
    expect(PERMS.site_inspector.createProject).toBe(false);
    expect(PERMS.site_inspector.editProgress).toBe(false);
    expect(PERMS.site_inspector.addUpdate).toBe(false);
    expect(PERMS.site_inspector.tabs).toContain("inspections");
    expect(PERMS.site_inspector.tabs).toContain("safety");
  });

  it("Phase B: designer has design-only tabs (no execution surfaces)", () => {
    expect(PERMS.designer.tabs).toContain("drawings");
    expect(PERMS.designer.tabs).not.toContain("rabills");
    expect(PERMS.designer.tabs).not.toContain("labour");
    expect(PERMS.designer.tabs).not.toContain("boq");
  });

  it("Phase B: consultant has minimum tabs (advice-only)", () => {
    expect(PERMS.consultant.tabs.length).toBeLessThanOrEqual(8);
    expect(PERMS.consultant.tabs).toContain("rfi");
    expect(PERMS.consultant.tabs).not.toContain("labour");
  });

  it("Phase B: sub_contractor is a sibling of contractor (similar but restricted)", () => {
    expect(PERMS.sub_contractor.tabs).toContain("rabills");
    expect(PERMS.sub_contractor.tabs).toContain("fieldops");
    // No project creation, no team management
    expect(PERMS.sub_contractor.createProject).toBe(false);
    expect(PERMS.sub_contractor.manageTeam).toBe(false);
  });

  it("Phase B: project_admin sees everything an org PM should + analytics", () => {
    expect(PERMS.project_admin.nav).toContain("analytics");
    expect(PERMS.project_admin.nav).toContain("forecast");
    expect(PERMS.project_admin.createProject).toBe(true);
  });

  it("Phase B: design_architect_interior has lead-designer rights (manageTeam + manageDrawings)", () => {
    expect(PERMS.design_architect_interior.manageTeam).toBe(true);
    expect(PERMS.design_architect_interior.manageDrawings).toBe(true);
  });

  it("superadmin has admin-only capabilities", () => {
    ["manageUsers", "manageOrgs", "manageBilling", "manageSettings", "impersonate"].forEach(p =>
      expect(PERMS.superadmin[p]).toBe(true)
    );
  });

  it("orgadmin has org-scoped admin capabilities but NOT cross-tenant ones", () => {
    ["manageOrgMembers", "manageOrgBilling", "manageOrgIntegrations",
     "manageOrgTemplates", "manageApprovalChains", "manageNotificationRules"].forEach(p =>
      expect(PERMS.orgadmin[p]).toBe(true)
    );
    // orgadmin must NOT have cross-tenant capabilities — that's superadmin only
    ["manageOrgs", "impersonate"].forEach(p =>
      expect(PERMS.orgadmin[p]).toBeFalsy()
    );
  });

  it("non-admin roles do not have admin capabilities", () => {
    ["architect", "pm", "contractor", "client"].forEach(role => {
      ["manageUsers", "manageOrgs", "manageBilling", "manageSettings", "impersonate",
       "manageOrgMembers", "manageApprovalChains"].forEach(p =>
        expect(PERMS[role][p]).toBeFalsy()
      );
    });
  });

  it("orgadmin nav includes the 8 org-* views", () => {
    ["org-dashboard", "org-members", "org-billing", "org-integrations",
     "org-activity", "org-templates", "org-approvals", "org-notifications"].forEach(view =>
      expect(PERMS.orgadmin.nav.includes(view)).toBe(true)
    );
  });

  it("superadmin nav has the 5 admin-only items", () => {
    ["admin-dashboard", "admin-users", "admin-orgs", "admin-billing", "admin-settings"].forEach(item =>
      expect(PERMS.superadmin.nav.includes(item)).toBe(true)
    );
  });

  it("client role has zero write capabilities", () => {
    const c = PERMS.client;
    const writeFlags = [
      "createProject", "editProgress", "addUpdate", "manageTeam",
      "markAttendance", "addExpense", "deleteExpense", "share",
      "changeMilestone", "addIssue", "resolveIssue", "addMaterial",
      "deleteMaterial", "manageDrawings",
    ];
    writeFlags.forEach(f => expect(c[f]).toBe(false));
  });

  it("contractor cannot see invoices, budget, attendance, labour, team", () => {
    const tabs = PERMS.contractor.tabs;
    ["invoices", "budget", "attendance", "labour", "team"].forEach(t =>
      expect(tabs.includes(t)).toBe(false)
    );
  });

  it("client cannot see internal financial tabs", () => {
    const tabs = PERMS.client.tabs;
    ["budget", "po", "labour", "rabills", "rfi", "issues"].forEach(t =>
      expect(tabs.includes(t)).toBe(false)
    );
  });

  it("client can see boq tab (read-only)", () => {
    expect(PERMS.client.tabs.includes("boq")).toBe(true);
  });

  it("contractor + architect + pm all see the stock ledger", () => {
    expect(PERMS.architect.tabs.includes("ledger")).toBe(true);
    expect(PERMS.pm.tabs.includes("ledger")).toBe(true);
    expect(PERMS.contractor.tabs.includes("ledger")).toBe(true);
  });

  it("client never sees the stock ledger (financial sensitivity)", () => {
    expect(PERMS.client.tabs.includes("ledger")).toBe(false);
  });

  it("BOQ tab visibility — Tech Lead regression matrix", () => {
    expect(PERMS.architect.tabs.includes("boq")).toBe(true);
    expect(PERMS.pm.tabs.includes("boq")).toBe(true);
    expect(PERMS.client.tabs.includes("boq")).toBe(true);
    expect(PERMS.contractor.tabs.includes("boq")).toBe(false);
  });

  it("Estimate tab visibility — mirrors BOQ (client read-only, contractor hidden)", () => {
    expect(PERMS.architect.tabs.includes("estimate")).toBe(true);
    expect(PERMS.pm.tabs.includes("estimate")).toBe(true);
    expect(PERMS.client.tabs.includes("estimate")).toBe(true);
    expect(PERMS.contractor.tabs.includes("estimate")).toBe(false);
  });

  it("invoices are never visible to contractor (financial exposure fix)", () => {
    expect(PERMS.contractor.tabs.includes("invoices")).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  it("returns true only for role=superadmin", () => {
    expect(isSuperAdmin(sup)).toBe(true);
    expect(isSuperAdmin(arch)).toBe(false);
    expect(isSuperAdmin(pm)).toBe(false);
    expect(isSuperAdmin(con)).toBe(false);
    expect(isSuperAdmin(cli)).toBe(false);
    expect(isSuperAdmin(orgA)).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});

describe("isOrgAdmin", () => {
  it("returns true only for role=orgadmin", () => {
    expect(isOrgAdmin(orgA)).toBe(true);
    expect(isOrgAdmin(sup)).toBe(false);
    expect(isOrgAdmin(arch)).toBe(false);
    expect(isOrgAdmin(pm)).toBe(false);
    expect(isOrgAdmin(null)).toBe(false);
  });
});

describe("orgadmin tenancy scoping", () => {
  it("visibleProjectsForUser filters out other-org projects for orgadmin", () => {
    const ps = [
      { id: "p1", org_id: "org1" },
      { id: "p2", org_id: "org2" },
      { id: "p3" }, // no org_id — defaults to belong to the org
    ];
    const visible = visibleProjectsForUser(ps, orgA);
    expect(visible.map(p => p.id).sort()).toEqual(["p1", "p3"]);
  });
  it("canAccessProject blocks orgadmin from another org's project", () => {
    expect(canAccessProject(orgA, { id: "p1", org_id: "org1" })).toBe(true);
    expect(canAccessProject(orgA, { id: "p2", org_id: "org2" })).toBe(false);
    expect(canAccessProject(orgA, { id: "p3" })).toBe(true); // missing org_id is treated as own
  });
  it("fallbackViewForUser sends orgadmin to org-dashboard", () => {
    expect(fallbackViewForUser(orgA)).toBe("org-dashboard");
  });
  it("canOpenView lets orgadmin into org-* views", () => {
    ["org-dashboard", "org-members", "org-billing", "org-integrations",
     "org-templates", "org-approvals", "org-notifications", "org-activity"].forEach(view =>
      expect(canOpenView(orgA, view)).toBe(true)
    );
  });
  it("canOpenView blocks non-orgadmin from org-* views", () => {
    [arch, pm, con, cli].forEach(u => {
      ["org-dashboard", "org-members", "org-billing"].forEach(view =>
        expect(canOpenView(u, view)).toBe(false)
      );
    });
  });
  it("canUseQuickCapture includes orgadmin", () => {
    expect(canUseQuickCapture(orgA)).toBe(true);
  });
});

describe("superadmin overrides", () => {
  it("visibleProjectsForUser returns every project for superadmin (even if client_email mismatch)", () => {
    const ps = [
      { id: "p1", client_email: "x@y.in" },
      { id: "p2", client_email: "a@b.in" },
      { id: "p3" },
    ];
    expect(visibleProjectsForUser(ps, sup)).toHaveLength(3);
  });

  it("canAccessProject is true for superadmin regardless of project ownership", () => {
    expect(canAccessProject(sup, { id: "p1", client_email: "stranger@x.in" })).toBe(true);
  });

  it("fallbackViewForUser sends superadmin to admin-dashboard", () => {
    expect(fallbackViewForUser(sup)).toBe("admin-dashboard");
  });

  it("canOpenView allows superadmin into all admin nav items", () => {
    ["admin-dashboard", "admin-users", "admin-orgs", "admin-billing", "admin-settings"].forEach(view =>
      expect(canOpenView(sup, view)).toBe(true)
    );
  });

  it("canOpenView blocks non-superadmin from admin views", () => {
    [arch, pm, con, cli].forEach(u => {
      ["admin-dashboard", "admin-users", "admin-orgs"].forEach(view =>
        expect(canOpenView(u, view)).toBe(false)
      );
    });
  });

  it("canUseQuickCapture includes superadmin", () => {
    expect(canUseQuickCapture(sup)).toBe(true);
  });
});

describe("can(user, capability)", () => {
  it("returns true only when role grants the capability", () => {
    expect(can(arch, "createProject")).toBe(true);
    expect(can(pm, "createProject")).toBe(false);
    expect(can(cli, "addUpdate")).toBe(false);
    expect(can(con, "addIssue")).toBe(true);
  });

  it("returns false for null/undefined user", () => {
    expect(can(null, "createProject")).toBe(false);
    expect(can(undefined, "createProject")).toBe(false);
  });

  it("returns false for unknown capability", () => {
    expect(can(arch, "destroyEverything")).toBe(false);
  });
});

describe("client project visibility", () => {
  it("client sees only projects matching their email", () => {
    const ps = [
      project({ id: "p1", client_email: "vikram@client.in" }),
      project({ id: "p2", client_email: "other@x.in" }),
    ];
    const visible = visibleProjectsForUser(ps, cli);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe("p1");
  });

  it("non-client roles see all projects", () => {
    const ps = [project({ id: "p1" }), project({ id: "p2", client_email: "x@y.in" })];
    expect(visibleProjectsForUser(ps, arch)).toHaveLength(2);
    expect(visibleProjectsForUser(ps, pm)).toHaveLength(2);
    expect(visibleProjectsForUser(ps, con)).toHaveLength(2);
  });

  it("canAccessProject blocks client from unrelated projects", () => {
    expect(canAccessProject(cli, project({ client_email: "vikram@client.in" }))).toBe(true);
    expect(canAccessProject(cli, project({ client_email: "other@x.in" }))).toBe(false);
    expect(canAccessProject(arch, project({ client_email: "other@x.in" }))).toBe(true);
  });

  it("canAccessProject returns false on missing inputs", () => {
    expect(canAccessProject(null, project())).toBe(false);
    expect(canAccessProject(cli, null)).toBe(false);
  });
});

describe("view routing", () => {
  it("fallbackViewForUser sends client to client portal", () => {
    expect(fallbackViewForUser(cli)).toBe("client");
    expect(fallbackViewForUser(arch)).toBe("dashboard");
    expect(fallbackViewForUser(null)).toBe("dashboard");
  });

  it("canOpenView blocks create for non-architects", () => {
    expect(canOpenView(arch, "create")).toBe(true);
    expect(canOpenView(pm, "create")).toBe(false);
    expect(canOpenView(con, "create")).toBe(false);
    expect(canOpenView(cli, "create")).toBe(false);
  });

  it("canOpenView blocks unauthenticated entirely", () => {
    expect(canOpenView(null, "dashboard")).toBe(false);
  });

  it("logout and detail are always open for authed users", () => {
    expect(canOpenView(cli, "logout")).toBe(true);
    expect(canOpenView(cli, "detail")).toBe(true);
  });

  it("client cannot open analytics or activity", () => {
    expect(canOpenView(cli, "analytics")).toBe(false);
    expect(canOpenView(cli, "activity")).toBe(false);
  });
});

describe("quick capture & drawings", () => {
  it("clients cannot use quick capture (no field data entry)", () => {
    expect(canUseQuickCapture(arch)).toBe(true);
    expect(canUseQuickCapture(pm)).toBe(true);
    expect(canUseQuickCapture(con)).toBe(true);
    expect(canUseQuickCapture(cli)).toBe(false);
  });

  it("drawingKey normalizes title and type", () => {
    expect(drawingKey({ title: "  Floor Plan ", type: "Architectural" }))
      .toBe("floor plan::architectural");
  });

  it("drawingKey returns null for blank inputs (no collision)", () => {
    // Previously returned "::" for every blank drawing — collision risk.
    expect(drawingKey({})).toBe(null);
    expect(drawingKey({ title: "  ", type: "  " })).toBe(null);
    expect(drawingKey({ title: "Foo" })).toBe(null);
    expect(drawingKey({ type: "Architectural" })).toBe(null);
    expect(drawingKey(null)).toBe(null);
  });

  it("isReleasedCurrentDrawing requires status=current and released_to contains role", () => {
    const d1 = { status: "current", released_to: ["pm", "client"] };
    expect(isReleasedCurrentDrawing(d1, "pm")).toBe(true);
    expect(isReleasedCurrentDrawing(d1, "contractor")).toBe(false);

    const d2 = { status: "superseded", released_to: ["pm"] };
    expect(isReleasedCurrentDrawing(d2, "pm")).toBe(false);

    expect(isReleasedCurrentDrawing(null, "pm")).toBe(false);
  });
});
