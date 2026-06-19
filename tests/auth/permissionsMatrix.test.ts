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

  it("prospector cannot resolve issues / edit progress (sales-only)", () => {
    const caps = identityCapabilities("prospector");
    expect(caps).not.toContain("issue:resolve" as never);
    expect(caps).not.toContain("progress:edit" as never);
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

  it("project_admin can approve RA bills, invoices and POs without change-order authority", () => {
    const caps = identityCapabilities("project_admin");
    expect(caps).toContain("rabill:approve" as never);
    expect(caps).toContain("invoice:approve" as never);
    expect(caps).toContain("po:approve" as never);
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
