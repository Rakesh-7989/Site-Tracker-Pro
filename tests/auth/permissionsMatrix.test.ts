// SiteTrack Pro — permissions matrix coverage tests.
//
// Asserts that every role in every tier has an entry + at least one
// capability, AND that role-specific intent is preserved (e.g. client
// is read-only, site_inspector cannot edit drawings, etc.).

import { describe, it, expect } from "vitest";
import {
  IDENTITY_ROLES,
  ORG_TIER_ROLES,
  PROJECT_TIER_ROLES,
} from "@/auth/roles";
import {
  identityCapabilities,
  orgTierCapabilities,
  projectTierCapabilities,
} from "@/auth/permissions-matrix";

describe("Identity-tier coverage", () => {
  it("every role has at least one capability", () => {
    for (const r of IDENTITY_ROLES) {
      const caps = identityCapabilities(r);
      expect(caps.length, `role=${r}`).toBeGreaterThan(0);
    }
  });

  it("superadmin holds EVERY capability", () => {
    const caps = identityCapabilities("superadmin");
    // Superadmin gets the full set — should match CAPABILITIES length.
    expect(caps.length).toBeGreaterThan(50);   // sanity: matrix grew past 50
  });

  it("prospector cannot resolve issues / edit progress (sales-only); has export", () => {
    const caps = identityCapabilities("prospector");
    expect(caps).not.toContain("issue:resolve" as never);
    expect(caps).not.toContain("progress:edit" as never);
    expect(caps).toContain("export:pdf" as never);
    expect(caps).toContain("export:csv" as never);
  });

  it("client is read-mostly (no progress edit, no issue resolve)", () => {
    const caps = identityCapabilities("client");
    expect(caps).not.toContain("progress:edit" as never);
    expect(caps).not.toContain("issue:resolve" as never);
    expect(caps).not.toContain("milestone:add" as never);
    expect(caps).toContain("handover:view" as never);
  });

  it("site_engineer has DPR submit + voice + photo (absorbed site_supervisor)", () => {
    const caps = identityCapabilities("site_engineer");
    expect(caps).toContain("dpr:submit" as never);
    expect(caps).toContain("voice:record" as never);
    expect(caps).toContain("photo:upload" as never);
  });

  it("promoter receives digest + sees finance (paying customer)", () => {
    const caps = identityCapabilities("promoter");
    expect(caps).toContain("digest:receive" as never);
    expect(caps).toContain("budget:view" as never);
    expect(caps).toContain("handover:view" as never);
    expect(caps).not.toContain("progress:edit" as never);   // not an editor
  });

  it("site_inspector is read + RERA file ONLY (no drawing edit, no progress)", () => {
    const caps = identityCapabilities("site_inspector");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("rera:file" as never);
    expect(caps).toContain("audit:read" as never);
    expect(caps).not.toContain("drawings:edit" as never);
    expect(caps).not.toContain("progress:edit" as never);
  });

  it("contractor can submit updates + RA bills but cannot manage team", () => {
    const caps = identityCapabilities("contractor");
    expect(caps).toContain("update:add" as never);
    expect(caps).toContain("rabill:create" as never);
    expect(caps).not.toContain("rabill:approve" as never);
    expect(caps).not.toContain("team:manage" as never);
    expect(caps).not.toContain("expense:approve" as never);
  });

  it("project_admin can approve POs but not self-approved invoices/RA bills (SoD)", () => {
    const caps = identityCapabilities("project_admin");
    expect(caps).toContain("po:approve" as never);
    expect(caps).toContain("invoice:create" as never);
    expect(caps).not.toContain("invoice:approve" as never); // SoD: create != approve
    expect(caps).toContain("rabill:create" as never);
    expect(caps).not.toContain("rabill:approve" as never);  // SoD: create != approve
    expect(caps).not.toContain("changeorder:approve" as never);
  });
});

describe("Org-tier coverage", () => {
  it("every org role has at least one capability", () => {
    for (const r of ORG_TIER_ROLES) {
      expect(orgTierCapabilities(r).length, `role=${r}`).toBeGreaterThan(0);
    }
  });
  it("admin gets the full org-mgmt suite", () => {
    const caps = orgTierCapabilities("admin");
    expect(caps).toContain("org:members:manage" as never);
    expect(caps).toContain("org:billing:manage" as never);
    expect(caps).toContain("project:create" as never);
    expect(caps).toContain("changeorder:approve" as never);
    expect(caps).toContain("po:approve" as never);
    expect(caps).toContain("invoice:approve" as never);
    expect(caps).toContain("rabill:approve" as never);
    expect(caps).toContain("notification:configure" as never);
  });
  it("client tier is intentionally minimal", () => {
    const caps = orgTierCapabilities("client");
    expect(caps).not.toContain("project:create" as never);
    expect(caps).not.toContain("org:members:manage" as never);
  });
});

describe("Project-tier coverage", () => {
  it("every project role has at least one capability", () => {
    for (const r of PROJECT_TIER_ROLES) {
      expect(projectTierCapabilities(r).length, `role=${r}`).toBeGreaterThan(0);
    }
  });
  it("site_engineer (project tier) carries the Sprint 2 DPR flow", () => {
    const caps = projectTierCapabilities("site_engineer");
    expect(caps).toContain("dpr:submit" as never);
    expect(caps).toContain("voice:record" as never);
    expect(caps).toContain("photo:upload" as never);
  });
  it("client (project tier) is read + handover-only", () => {
    const caps = projectTierCapabilities("client");
    expect(caps).toContain("dpr:view" as never);
    expect(caps).toContain("handover:view" as never);
    expect(caps).not.toContain("progress:edit" as never);
  });
  it("site_inspector (project tier) cannot edit drawings", () => {
    const caps = projectTierCapabilities("site_inspector");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).not.toContain("drawings:edit" as never);
    expect(caps).not.toContain("drawings:release" as never);
  });
  it("senior_architect (project tier) supersedes architect (more approve caps)", () => {
    const a = projectTierCapabilities("architect");
    const s = projectTierCapabilities("senior_architect");
    expect(s.length).toBeGreaterThan(a.length);
    expect(s).toContain("rfi:close" as never);
    expect(s).toContain("changeorder:approve" as never);
    expect(a).not.toContain("changeorder:approve" as never);
  });
});

// Vendor capability split (founder decision 2026-06-06):
//   vendor:manage = curate the directory (/vendors page). Admins + prospector only.
//   vendor:select = pick a vendor inside a PO / material / invoice form. Broader.
describe("Vendor capability split", () => {
  it("vendor:manage is restricted to admins + prospector", () => {
    expect(identityCapabilities("orgadmin")).toContain("vendor:manage" as never);
    expect(identityCapabilities("prospector")).toContain("vendor:manage" as never);
    expect(orgTierCapabilities("admin")).toContain("vendor:manage" as never);
    // NOT granted to procurement workflow roles:
    expect(identityCapabilities("pm")).not.toContain("vendor:manage" as never);
    expect(identityCapabilities("contractor")).not.toContain("vendor:manage" as never);
    expect(identityCapabilities("site_engineer")).not.toContain("vendor:manage" as never);
    expect(identityCapabilities("client")).not.toContain("vendor:manage" as never);
  });

  it("vendor:select is broad — every role that creates POs / materials / invoices gets it", () => {
    // Procurement workflow roles must be able to pick a vendor in a form.
    expect(identityCapabilities("pm")).toContain("vendor:select" as never);
    expect(identityCapabilities("contractor")).toContain("vendor:select" as never);
    expect(identityCapabilities("site_engineer")).toContain("vendor:select" as never);
    expect(identityCapabilities("project_admin")).toContain("vendor:select" as never);
    expect(identityCapabilities("design_architect_interior")).toContain("vendor:select" as never);
    // Admins + prospector also get it (they already manage).
    expect(identityCapabilities("orgadmin")).toContain("vendor:select" as never);
    expect(identityCapabilities("prospector")).toContain("vendor:select" as never);
    expect(orgTierCapabilities("admin")).toContain("vendor:select" as never);
    // Project tier mirrors.
    expect(projectTierCapabilities("pm")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("contractor")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("site_engineer")).toContain("vendor:select" as never);
    expect(projectTierCapabilities("project_admin")).toContain("vendor:select" as never);
  });

  it("clients + read-only roles never get vendor:select", () => {
    expect(identityCapabilities("client")).not.toContain("vendor:select" as never);
    expect(identityCapabilities("site_inspector")).not.toContain("vendor:select" as never);
    expect(projectTierCapabilities("client")).not.toContain("vendor:select" as never);
  });
});

describe("Session gap fixes — material:price:view on changeorder roles", () => {
  const coRoles = [
    "senior_architect", "architect", "design_head", "consultant_head",
    "mep_consultant", "structural_consultant", "contractor",
  ] as const;
  for (const role of coRoles) {
    it(`${role} (identity) has material:price:view for changeorder context`, () => {
      expect(identityCapabilities(role)).toContain("material:price:view" as never);
    });
  }
  const projRoles = [
    "senior_architect", "design_head", "consultant_head",
    "mep_consultant", "structural_consultant", "contractor",
  ] as const;
  for (const role of projRoles) {
    it(`${role} (project) has material:price:view`, () => {
      expect(projectTierCapabilities(role)).toContain("material:price:view" as never);
    });
  }
  // architect has material:price:view in identity tier only (project tier lacks changeorder:create)
  it("architect (project) does NOT get material:price:view (no changeorder:create at project tier)", () => {
    expect(projectTierCapabilities("architect")).not.toContain("material:price:view" as never);
  });
});

describe("Session gap fixes — pm compliance + safety", () => {
  it("pm (identity) has compliance:view + safety:close", () => {
    const caps = identityCapabilities("pm");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("safety:close" as never);
  });
  it("pm (project) has compliance:view + safety:close", () => {
    const caps = projectTierCapabilities("pm");
    expect(caps).toContain("compliance:view" as never);
    expect(caps).toContain("safety:close" as never);
  });
});

describe("Session gap fixes — site_engineer safety:close + material:price:view", () => {
  it("site_engineer (identity) has safety:close + material:price:view", () => {
    const caps = identityCapabilities("site_engineer");
    expect(caps).toContain("safety:close" as never);
    expect(caps).toContain("material:price:view" as never);
  });
  it("site_engineer (project) has safety:close + material:price:view", () => {
    const caps = projectTierCapabilities("site_engineer");
    expect(caps).toContain("safety:close" as never);
    expect(caps).toContain("material:price:view" as never);
  });
});

describe("Session gap fixes — junior_architect rfi:respond + issue:add", () => {
  it("junior_architect (identity) has rfi:respond + issue:add", () => {
    const caps = identityCapabilities("junior_architect");
    expect(caps).toContain("rfi:respond" as never);
    expect(caps).toContain("issue:add" as never);
  });
  it("junior_architect (project) has rfi:respond + issue:add", () => {
    const caps = projectTierCapabilities("junior_architect");
    expect(caps).toContain("rfi:respond" as never);
    expect(caps).toContain("issue:add" as never);
  });
});

describe("Session gap fixes — designer rfi:create", () => {
  it("designer (identity) has rfi:create", () => {
    expect(identityCapabilities("designer")).toContain("rfi:create" as never);
  });
  it("designer (project) has rfi:create", () => {
    expect(projectTierCapabilities("designer")).toContain("rfi:create" as never);
  });
});

describe("Session gap fixes — prospector messaging", () => {
  it("prospector (identity) has message:send + whatsapp:send", () => {
    const caps = identityCapabilities("prospector");
    expect(caps).toContain("message:send" as never);
    expect(caps).toContain("whatsapp:send" as never);
  });
});
