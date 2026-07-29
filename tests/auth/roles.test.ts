// SiteTrack Pro — roles.ts catalog integrity.

import { describe, it, expect } from "vitest";
import {
  IDENTITY_ROLES,
  PROJECT_TIER_ROLES,
  PROJECT_TYPES,
  VALID_PROJECT_ROLES_BY_TYPE,
  ROLE_CATEGORY,
  ROLE_LABEL,
  isIdentityRole,
  isProjectTierRole,
  isProjectType,
  defaultProjectTierFor,
} from "@/auth/roles";

describe("Identity role catalog (profiles.role)", () => {
  it("has 22 distinct roles matching migration 68 (consolidated)", () => {
    expect(IDENTITY_ROLES.length).toBe(22);
    expect(new Set(IDENTITY_ROLES).size).toBe(22);
  });

  it("includes the v2 surviving roles", () => {
    for (const r of [
      "promoter", "senior_architect", "junior_architect",
      "structural_consultant", "design_head", "consultant_head",
      "site_engineer", "vendor",
    ]) {
      expect(IDENTITY_ROLES).toContain(r as never);
    }
  });

  it("drops the 4 consolidated roles", () => {
    for (const r of ["site_supervisor", "project_head", "civil_engineer", "interior_designer"]) {
      expect(IDENTITY_ROLES).not.toContain(r as never);
    }
  });

  it("every role has a category + label", () => {
    for (const r of IDENTITY_ROLES) {
      expect(ROLE_CATEGORY[r]).toBeDefined();
      expect(ROLE_LABEL[r]).toBeDefined();
      expect(ROLE_LABEL[r].length).toBeGreaterThan(0);
    }
  });
});

describe("Project-tier role catalog (project_members.role)", () => {
  it("has 18 values matching migration 68 CHECK (consolidated)", () => {
    expect(PROJECT_TIER_ROLES.length).toBe(18);
    expect(new Set(PROJECT_TIER_ROLES).size).toBe(18);
  });
  it("excludes org-only roles (superadmin/orgadmin/prospector/vendor)", () => {
    for (const r of ["superadmin", "orgadmin", "prospector", "vendor"]) {
      expect(PROJECT_TIER_ROLES).not.toContain(r as never);
    }
  });
});

describe("Project types", () => {
  it("has 4 types", () => {
    expect([...PROJECT_TYPES].sort()).toEqual(["construction", "consultant", "design", "interior"]);
  });
  it("every type has a valid-roles list", () => {
    for (const t of PROJECT_TYPES) {
      const roles = VALID_PROJECT_ROLES_BY_TYPE[t];
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).toContain("client");   // every type has client
    }
  });
  it("construction includes site_engineer (the merged field role)", () => {
    expect(VALID_PROJECT_ROLES_BY_TYPE.construction).toContain("site_engineer");
  });
  it("design does NOT include site_engineer (no construction on design projects)", () => {
    expect(VALID_PROJECT_ROLES_BY_TYPE.design).not.toContain("site_engineer");
  });
});

describe("Type guards", () => {
  it("isIdentityRole accepts only valid values", () => {
    expect(isIdentityRole("architect")).toBe(true);
    expect(isIdentityRole("xxx")).toBe(false);
    expect(isIdentityRole(null)).toBe(false);
    expect(isIdentityRole(42)).toBe(false);
  });
  it("isProjectTierRole / isProjectType behave", () => {
    expect(isProjectTierRole("site_engineer")).toBe(true);
    expect(isProjectTierRole("superadmin")).toBe(false);
    expect(isProjectTierRole("site_supervisor")).toBe(false);
    expect(isProjectType("interior")).toBe(true);
    expect(isProjectType("residential")).toBe(false);
  });
});

describe("defaultProjectTierFor", () => {
  it("returns null for non-project roles", () => {
    expect(defaultProjectTierFor("superadmin")).toBeNull();
    expect(defaultProjectTierFor("prospector")).toBe("pm");
    expect(defaultProjectTierFor("vendor")).toBeNull();
  });
  it("defaultProjectTierFor passes through for project roles", () => {
    expect(defaultProjectTierFor("site_engineer")).toBe("site_engineer");
    expect(defaultProjectTierFor("contractor")).toBe("contractor");
  });
});
