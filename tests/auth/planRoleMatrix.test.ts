// SiteTrack Pro - plan-aware role defaults tests.

import { describe, expect, it } from "vitest";
import { IDENTITY_ROLES, ORG_TIER_ROLES, PROJECT_TIER_ROLES } from "@/auth/roles";
import {
  identityRolesForPlan,
  orgTierRolesForPlan,
  projectTierRolesForPlan,
  planFeaturesFor,
  planSupportsCustomRoles,
  roleAllowedForPlan,
} from "@/auth/planRoleMatrix";

const customerIdentityRoles = IDENTITY_ROLES.filter(role => role !== "superadmin");

describe("plan role defaults", () => {
  it("keeps Basic focused on the small-site team", () => {
    expect(identityRolesForPlan("basic")).toEqual([
      "orgadmin",
      "promoter",
      "pm",
      "architect",
      "site_engineer",
      "contractor",
      "sub_contractor",
      "client",
    ]);
    expect(orgTierRolesForPlan("basic")).not.toContain("vendor");
    expect(projectTierRolesForPlan("basic")).toContain("site_engineer");
    expect(projectTierRolesForPlan("basic")).not.toContain("site_inspector");
  });

  it("opens specialist roles as plans move up", () => {
    expect(roleAllowedForPlan("pro", "identity", "vendor")).toBe(true);
    expect(roleAllowedForPlan("pro", "project", "mep_consultant")).toBe(true);
    expect(roleAllowedForPlan("pro", "project", "site_inspector")).toBe(false);
    expect(roleAllowedForPlan("business", "project", "site_inspector")).toBe(true);
  });

  it("Enterprise and Custom receive the full customer role catalogs", () => {
    expect(identityRolesForPlan("enterprise")).toEqual(customerIdentityRoles);
    expect(identityRolesForPlan("custom")).toEqual(customerIdentityRoles);
    expect(orgTierRolesForPlan("custom")).toEqual([...ORG_TIER_ROLES]);
    expect(projectTierRolesForPlan("enterprise")).toEqual([...PROJECT_TIER_ROLES]);
  });

  it("custom roles start at Business, not only Enterprise", () => {
    expect(planSupportsCustomRoles("pro")).toBe(false);
    expect(planSupportsCustomRoles("business")).toBe(true);
    expect(planSupportsCustomRoles("enterprise")).toBe(true);
    expect(planSupportsCustomRoles("custom")).toBe(true);
  });

  it("plan feature promises follow the planCaps min-plan table", () => {
    expect(planFeaturesFor("basic")).toContain("whatsapp_share");
    expect(planFeaturesFor("basic")).not.toContain("finance");
    expect(planFeaturesFor("pro")).toContain("finance");
    expect(planFeaturesFor("pro")).not.toContain("custom_roles");
    expect(planFeaturesFor("business")).toContain("custom_roles");
  });
});
