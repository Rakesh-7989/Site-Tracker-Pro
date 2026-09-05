// SiteTrack Pro — Role-based column access checker tests.
// Validates that the roleColumnAccess helpers correctly identify which
// identity/project roles can view which column categories.

import { describe, it, expect } from "vitest";
import {
  canViewBudget,
  canViewFinancialRollup,
  canViewProjectScope,
  canViewCrm,
  canViewUtilization,
  canManageFFE,
  canManageStatutory,
  canManageAudit,
  canManageCrm,
  canManageDeliverable,
  canViewProjectId,
  projectTierCanManageDeliverable,
  projectTierCanViewUtilization,
  projectTierCanViewBudget,
  getIdentityCapabilities,
  getProjectTierCapabilities,
  hasCapabilityAny,
  canViewCapability,
  getCapabilityIntersection,
  hasMoreCapabilitiesThan,
  getUniqueCapabilities,
  isColumnVisibleToRole,
  isOrgAdminOrSuper,
  legacyPermCheck,
  IDENTITY_ROLES_LIST as identityRoles,
} from "@/auth/roleColumnAccess";

const ALL_IDENTITY_ROLES = identityRoles;

// ── Budget visibility ────────────────────────────────────────────────────

describe("canViewBudget", () => {
  it("should return true for orgadmin", () => {
    expect(canViewBudget("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canViewBudget("pm")).toBe(true);
  });

  it("should return true for project_admin", () => {
    expect(canViewBudget("project_admin")).toBe(true);
  });

  it("should return false for architect (not in BUDGET_VIEW_ROLES)", () => {
    expect(canViewBudget("architect")).toBe(false);
  });

  it("should return false for client", () => {
    expect(canViewBudget("client")).toBe(false);
  });

  it("should return false for site_inspector", () => {
    expect(canViewBudget("site_inspector")).toBe(false);
  });
});

// ── Financial rollup visibility ─────────────────────────────────────────

describe("canViewFinancialRollup", () => {
  it("should return true for orgadmin", () => {
    expect(canViewFinancialRollup("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canViewFinancialRollup("pm")).toBe(true);
  });

  it("should return false for architect (not in FINANCIAL_ROLLUP_ROLES)", () => {
    expect(canViewFinancialRollup("architect")).toBe(false);
  });

  it("should return false for client", () => {
    expect(canViewFinancialRollup("client")).toBe(false);
  });
});

// ── Project scope visibility ────────────────────────────────────────────

describe("canViewProjectScope", () => {
  it("should return true for orgadmin", () => {
    expect(canViewProjectScope("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canViewProjectScope("pm")).toBe(true);
  });

  it("should return true for project_admin", () => {
    expect(canViewProjectScope("project_admin")).toBe(true);
  });

  it("should return false for client", () => {
    expect(canViewProjectScope("client")).toBe(false);
  });
});

// ── CRM visibility ──────────────────────────────────────────────────────

describe("canViewCrm", () => {
  it("should return true for orgadmin", () => {
    expect(canViewCrm("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canViewCrm("pm")).toBe(true);
  });

  it("should return true for prospector", () => {
    expect(canViewCrm("prospector")).toBe(true);
  });

  it("should return false for vendor", () => {
    expect(canViewCrm("vendor")).toBe(false);
  });
});

// ── Utilization visibility ──────────────────────────────────────────────

describe("canViewUtilization", () => {
  it("should return true for orgadmin", () => {
    expect(canViewUtilization("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canViewUtilization("pm")).toBe(true);
  });

  it("should return false for consultant (no utilization:view at identity tier)", () => {
    expect(canViewUtilization("consultant")).toBe(false);
  });

  it("should return false for site_inspector", () => {
    expect(canViewUtilization("site_inspector")).toBe(false);
  });
});

// ── FFE manage ──────────────────────────────────────────────────────────

describe("canManageFFE", () => {
  it("should return true for design_head", () => {
    expect(canManageFFE("design_head")).toBe(true);
  });

  it("should return true for consultant_head", () => {
    expect(canManageFFE("consultant_head")).toBe(true);
  });

  it("should return false for client", () => {
    expect(canManageFFE("client")).toBe(false);
  });
});

// ── Statutory manage ───────────────────────────────────────────────────

describe("canManageStatutory", () => {
  it("should return true for design_head", () => {
    expect(canManageStatutory("design_head")).toBe(true);
  });

  it("should return true for consultant_head", () => {
    expect(canManageStatutory("consultant_head")).toBe(true);
  });

  it("should return false for vendor", () => {
    expect(canManageStatutory("vendor")).toBe(false);
  });
});

// ── Audit manage ────────────────────────────────────────────────────────

describe("canManageAudit", () => {
  it("should return true for orgadmin", () => {
    expect(canManageAudit("orgadmin")).toBe(true);
  });

  it("should return true for project_admin", () => {
    expect(canManageAudit("project_admin")).toBe(true);
  });

  it("should return false for client", () => {
    expect(canManageAudit("client")).toBe(false);
  });
});

// ── CRM manage ──────────────────────────────────────────────────────────

describe("canManageCrm", () => {
  it("should return true for orgadmin", () => {
    expect(canManageCrm("orgadmin")).toBe(true);
  });

  it("should return false for pm (only crm:view, not crm:manage)", () => {
    expect(canManageCrm("pm")).toBe(false);
  });

  it("should return false for client", () => {
    expect(canManageCrm("client")).toBe(false);
  });
});

// ── Deliverable manage ──────────────────────────────────────────────────

describe("canManageDeliverable", () => {
  it("should return true for orgadmin", () => {
    expect(canManageDeliverable("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canManageDeliverable("pm")).toBe(true);
  });

  it("should return false for client", () => {
    expect(canManageDeliverable("client")).toBe(false);
  });
});

// ── Project scope visibility ────────────────────────────────────────────

describe("canViewProjectId", () => {
  it("should return true for orgadmin", () => {
    expect(canViewProjectId("orgadmin")).toBe(true);
  });

  it("should return true for pm", () => {
    expect(canViewProjectId("pm")).toBe(true);
  });

  it("should return false for client", () => {
    expect(canViewProjectId("client")).toBe(false);
  });
});

// ── Project-tier capability checks ──────────────────────────────────────

describe("projectTierCanManageDeliverable", () => {
  it("should return true for pm on architect role", () => {
    expect(projectTierCanManageDeliverable("pm")).toBe(true);
  });

  it("should return true for architect on its own role", () => {
    expect(projectTierCanManageDeliverable("architect")).toBe(true);
  });

  it("should return false for client", () => {
    expect(projectTierCanManageDeliverable("client")).toBe(false);
  });
});

describe("projectTierCanViewUtilization", () => {
  it("should return true for pm", () => {
    expect(projectTierCanViewUtilization("pm")).toBe(true);
  });

  it("should return false for architect (no utilization:view at project tier)", () => {
    expect(projectTierCanViewUtilization("architect")).toBe(false);
  });

  it("should return false for client", () => {
    expect(projectTierCanViewUtilization("client")).toBe(false);
  });
});

describe("projectTierCanViewBudget", () => {
  it("should return true for pm", () => {
    expect(projectTierCanViewBudget("pm")).toBe(true);
  });

  it("should return false for client", () => {
    expect(projectTierCanViewBudget("client")).toBe(false);
  });
});

// ── Identity capabilities ───────────────────────────────────────────────

describe("getIdentityCapabilities", () => {
  it("should return caps for orgadmin", () => {
    const caps = getIdentityCapabilities("orgadmin");
    expect(caps).toContain("activity:view");
    expect(caps).toContain("audit:read");
    expect(caps).toContain("org:members:manage");
  });

  it("should return caps for architect", () => {
    const caps = getIdentityCapabilities("architect");
    expect(caps).toContain("drawings:upload");
    expect(caps).toContain("drawings:edit");
  });
});

describe("getProjectTierCapabilities", () => {
  it("should return caps for pm", () => {
    const caps = getProjectTierCapabilities("pm");
    expect(caps).toContain("project:settings:edit");
    expect(caps).toContain("progress:edit");
  });

  it("should return caps for architect", () => {
    const caps = getProjectTierCapabilities("architect");
    expect(caps).toContain("drawings:upload");
    expect(caps).toContain("drawings:edit");
  });
});

describe("hasCapabilityAny", () => {
  it("should return true if any role has the capability", () => {
    expect(hasCapabilityAny(["orgadmin", "pm"], "crm:view")).toBe(true);
  });

  it("should return false if no role has the capability", () => {
    expect(hasCapabilityAny(["client", "site_inspector"], "crm:manage")).toBe(false);
  });
});

describe("canViewCapability", () => {
  it("should return true when role has the capability", () => {
    expect(canViewCapability("orgadmin", "crm:view")).toBe(true);
  });

  it("should return false when role does not have the capability", () => {
    expect(canViewCapability("client", "crm:manage")).toBe(false);
  });
});

describe("getCapabilityIntersection", () => {
  it("should include only shared caps of orgadmin and pm", () => {
    const intersection = getCapabilityIntersection("orgadmin", "pm");
    expect(intersection).toContain("activity:view");
    expect(intersection).toContain("deliverable:manage");
    expect(intersection).not.toContain("audit:read");
  });

  it("should exclude role-specific caps from the intersection", () => {
    const intersection = getCapabilityIntersection("client", "site_inspector");
    expect(intersection).toContain("activity:view");
    expect(intersection).not.toContain("audit:read");
    expect(intersection).not.toContain("handover:sign");
  });
});

describe("hasMoreCapabilitiesThan", () => {
  it("should return true when superadmin has more caps than pm", () => {
    expect(hasMoreCapabilitiesThan("superadmin", "pm")).toBe(true);
  });

  it("should return false for orgadmin vs pm (SoD sets, not a superset)", () => {
    expect(hasMoreCapabilitiesThan("orgadmin", "pm")).toBe(false);
  });

  it("should return true when a role is a strict superset of another", () => {
    expect(hasMoreCapabilitiesThan("senior_architect", "architect")).toBe(true);
    expect(hasMoreCapabilitiesThan("architect", "senior_architect")).toBe(false);
  });
});

describe("getUniqueCapabilities", () => {
  it("should return capabilities unique to orgadmin (not in pm)", () => {
    const unique = getUniqueCapabilities("orgadmin", "pm");
    expect(unique.size).toBeGreaterThan(0);
    expect(unique).not.toContain("activity:view"); // both have it
  });

  it("should return all capabilities when excludeRole is omitted", () => {
    const unique = getUniqueCapabilities("orgadmin");
    expect(unique.size).toBeGreaterThan(0);
  });
});

// ── Column visibility ───────────────────────────────────────────────────

describe("isColumnVisibleToRole", () => {
  it("should return true for budget column for orgadmin", () => {
    expect(isColumnVisibleToRole("orgadmin", "budget")).toBe(true);
  });

  it("should return false for budget column for client", () => {
    expect(isColumnVisibleToRole("client", "budget")).toBe(false);
  });

  it("should return true for ffe column for design_head", () => {
    expect(isColumnVisibleToRole("design_head", "ffe")).toBe(true);
  });

  it("should return false for ffe column for client", () => {
    expect(isColumnVisibleToRole("client", "ffe")).toBe(false);
  });
});

// ── Org admin / super check ─────────────────────────────────────────────

describe("isOrgAdminOrSuper", () => {
  it("should return true only for orgadmin and superadmin", () => {
    expect(isOrgAdminOrSuper("orgadmin")).toBe(true);
    expect(isOrgAdminOrSuper("superadmin")).toBe(true);
    expect(isOrgAdminOrSuper("promoter")).toBe(false);
    expect(isOrgAdminOrSuper("project_admin")).toBe(false);
  });
});

// ── IDENTITY_ROLES_LIST completeness ────────────────────────────────────

describe("IDENTITY_ROLES_LIST", () => {
  it("should contain all 22 identity roles", () => {
    expect(identityRoles.length).toBe(22);
  });

  it("should include superadmin", () => {
    expect(identityRoles).toContain("superadmin");
  });

  it("should include orgadmin", () => {
    expect(identityRoles).toContain("orgadmin");
  });

  it("should include site_inspector", () => {
    expect(identityRoles).toContain("site_inspector");
  });
});

// ── Legacy perm check ───────────────────────────────────────────────────

describe("legacyPermCheck", () => {
  it("should return true for budget:view with orgadmin", () => {
    expect(legacyPermCheck("orgadmin", "budget:view")).toBe(true);
  });

  it("should return false for crm:manage with client", () => {
    expect(legacyPermCheck("client", "crm:manage")).toBe(false);
  });

  it("should return false for unknown permission", () => {
    expect(legacyPermCheck("unknown", "unknown_perm")).toBe(false);
  });
});

// ── Role category grouping ──────────────────────────────────────────────

describe("role category grouping", () => {
  it("should not group non-orgadmin roles as org-admin", () => {
    expect(isOrgAdminOrSuper("orgadmin")).toBe(true);
    expect(isOrgAdminOrSuper("superadmin")).toBe(true);
    expect(isOrgAdminOrSuper("promoter")).toBe(false);
    expect(isOrgAdminOrSuper("project_admin")).toBe(false);
  });

  it("should NOT group project-execution roles as org-admin", () => {
    expect(isOrgAdminOrSuper("architect")).toBe(false);
    expect(isOrgAdminOrSuper("designer")).toBe(false);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("should handle undefined role gracefully", () => {
    // These should not throw, just return false/default
    expect(canViewBudget(undefined as unknown as string)).toBe(false);
    expect(canViewFinancialRollup(undefined as unknown as string)).toBe(false);
  });

  it("should handle null role gracefully", () => {
    expect(canViewBudget(null as unknown as string)).toBe(false);
  });

  it("should handle empty string role gracefully", () => {
    expect(canViewBudget("")).toBe(false);
  });
});

// ── Comprehensive role coverage ──────────────────────────────────────────

describe("comprehensive role coverage", () => {
  it("should test all 22 identity roles against budget visibility", () => {
    for (const role of ALL_IDENTITY_ROLES) {
      // Each role should either be able to view budget or have a valid reason not to
      const result = canViewBudget(role);
      // No assertion here — just ensuring no crashes and boolean output
      expect(typeof result).toBe("boolean");
    }
  });

  it("should test all 22 identity roles against financial rollup visibility", () => {
    for (const role of ALL_IDENTITY_ROLES) {
      const result = canViewFinancialRollup(role);
      expect(typeof result).toBe("boolean");
    }
  });

  it("should test all 22 identity roles against CRM visibility", () => {
    for (const role of ALL_IDENTITY_ROLES) {
      const result = canViewCrm(role);
      expect(typeof result).toBe("boolean");
    }
  });

  it("should test all 22 identity roles against utilization visibility", () => {
    for (const role of ALL_IDENTITY_ROLES) {
      const result = canViewUtilization(role);
      expect(typeof result).toBe("boolean");
    }
  });
});