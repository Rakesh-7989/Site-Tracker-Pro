import { describe, it, expect } from "vitest";
import {
  TYPE_TABS, TYPE_TEAM_TEMPLATES, TYPE_BOQ_PRESETS,
  projectTypeOf, isTabApplicableToProjectType, recommendedTeam,
  boqPresets, isTabVisible, tabHiddenByType, typeChip,
} from "../src/lib/projectTypes.js";

describe("projectTypes — TYPE_TABS shape", () => {
  it("defines tabs for all 4 types", () => {
    expect(Object.keys(TYPE_TABS).sort()).toEqual(
      ["construction", "consultant", "design", "interior"].sort()
    );
  });
  it("construction is the heaviest type", () => {
    expect(TYPE_TABS.construction.length).toBeGreaterThan(TYPE_TABS.interior.length);
    expect(TYPE_TABS.interior.length).toBeGreaterThan(TYPE_TABS.design.length);
    expect(TYPE_TABS.design.length).toBeGreaterThanOrEqual(TYPE_TABS.consultant.length);
  });
  it("every type has overview + milestones", () => {
    for (const t of Object.keys(TYPE_TABS)) {
      expect(TYPE_TABS[t]).toContain("overview");
      expect(TYPE_TABS[t]).toContain("milestones");
    }
  });
  it("consultant + design hide financial tabs", () => {
    for (const t of ["consultant", "design"]) {
      expect(TYPE_TABS[t]).not.toContain("rabills");
      expect(TYPE_TABS[t]).not.toContain("boq");
      expect(TYPE_TABS[t]).not.toContain("labour");
    }
  });
  it("interior shows materials + drawings but hides labour + rabills + boq", () => {
    expect(TYPE_TABS.interior).toContain("materials");
    expect(TYPE_TABS.interior).toContain("drawings");
    expect(TYPE_TABS.interior).not.toContain("labour");
    expect(TYPE_TABS.interior).not.toContain("rabills");
    expect(TYPE_TABS.interior).not.toContain("boq");
  });
});

describe("projectTypes — TYPE_TEAM_TEMPLATES", () => {
  it("defines a team for each type", () => {
    expect(Object.keys(TYPE_TEAM_TEMPLATES).sort()).toEqual(
      ["construction", "consultant", "design", "interior"].sort()
    );
  });
  it("every team has at least one required client + one required architect-tier role", () => {
    for (const t of Object.keys(TYPE_TEAM_TEMPLATES)) {
      const team = TYPE_TEAM_TEMPLATES[t];
      const clientRow = team.find(r => r.role === "client");
      expect(clientRow?.required, t).toBe(true);
    }
  });
  it("construction team includes project_head + site_engineer + contractor (required)", () => {
    const required = TYPE_TEAM_TEMPLATES.construction.filter(r => r.required).map(r => r.role);
    expect(required).toContain("project_head");
    expect(required).toContain("site_engineer");
    expect(required).toContain("contractor");
  });
  it("interior team includes Design Architect (Interior) + interior_designer", () => {
    const roles = TYPE_TEAM_TEMPLATES.interior.map(r => r.role);
    expect(roles).toContain("design_architect_interior");
    expect(roles).toContain("interior_designer");
  });
  it("design team is the smallest (3 members)", () => {
    expect(TYPE_TEAM_TEMPLATES.design.length).toBe(3);
  });
});

describe("projectTypes — projectTypeOf", () => {
  it("returns the project's explicit type when valid", () => {
    expect(projectTypeOf({ type: "interior" })).toBe("interior");
    expect(projectTypeOf({ type: "consultant" })).toBe("consultant");
  });
  it("defaults to construction when type is missing", () => {
    expect(projectTypeOf({})).toBe("construction");
    expect(projectTypeOf({ id: "p1" })).toBe("construction");
  });
  it("defaults to construction when type is invalid", () => {
    expect(projectTypeOf({ type: "garbage" })).toBe("construction");
  });
  it("returns default when project is null", () => {
    expect(projectTypeOf(null)).toBe("construction");
  });
});

describe("projectTypes — isTabApplicableToProjectType", () => {
  it("accepts a type string OR a project object", () => {
    expect(isTabApplicableToProjectType("construction", "boq")).toBe(true);
    expect(isTabApplicableToProjectType({ type: "construction" }, "boq")).toBe(true);
  });
  it("hides boq on design + consultant projects", () => {
    expect(isTabApplicableToProjectType("design", "boq")).toBe(false);
    expect(isTabApplicableToProjectType("consultant", "boq")).toBe(false);
  });
  it("hides labour on every non-construction project", () => {
    expect(isTabApplicableToProjectType("construction", "labour")).toBe(true);
    expect(isTabApplicableToProjectType("interior", "labour")).toBe(false);
    expect(isTabApplicableToProjectType("design", "labour")).toBe(false);
    expect(isTabApplicableToProjectType("consultant", "labour")).toBe(false);
  });
  it("fails open on unknown type", () => {
    expect(isTabApplicableToProjectType("garbage", "anything")).toBe(true);
  });
});

describe("projectTypes — recommendedTeam + boqPresets", () => {
  it("recommendedTeam returns the right list for each type", () => {
    expect(recommendedTeam("construction").length).toBeGreaterThan(5);
    expect(recommendedTeam("design").length).toBe(3);
  });
  it("recommendedTeam falls back to construction on unknown type", () => {
    expect(recommendedTeam("garbage")).toEqual(TYPE_TEAM_TEMPLATES.construction);
  });
  it("boqPresets returns categories for construction + interior, empty for design + consultant", () => {
    expect(boqPresets("construction").length).toBeGreaterThan(0);
    expect(boqPresets("interior").length).toBeGreaterThan(0);
    expect(boqPresets("design")).toEqual([]);
    expect(boqPresets("consultant")).toEqual([]);
  });
});

describe("projectTypes — isTabVisible composition", () => {
  const user = { role: "architect" };
  const project = { type: "construction" };

  it("returns false when user is missing", () => {
    expect(isTabVisible(null, project, "boq", { roleTabs: ["boq"] })).toBe(false);
  });
  it("returns false when role doesn't have the tab", () => {
    expect(isTabVisible(user, project, "boq", { roleTabs: ["overview"] })).toBe(false);
  });
  it("returns false when feature flag callback returns false", () => {
    expect(isTabVisible(user, project, "boq", {
      roleTabs: ["boq"],
      isFeatureOn: () => false,
    })).toBe(false);
  });
  it("returns false when type-gate hides the tab", () => {
    expect(isTabVisible(user, { type: "design" }, "boq", {
      roleTabs: ["boq"],
      isFeatureOn: () => true,
    })).toBe(false);
  });
  it("returns true when all three gates pass", () => {
    expect(isTabVisible(user, project, "boq", {
      roleTabs: ["boq"],
      isFeatureOn: () => true,
    })).toBe(true);
  });
});

describe("projectTypes — tabHiddenByType + typeChip", () => {
  it("tabHiddenByType is the inverse of isTabApplicableToProjectType", () => {
    expect(tabHiddenByType("design", "boq")).toBe(true);
    expect(tabHiddenByType("construction", "boq")).toBe(false);
  });
  it("typeChip returns label + icon for known types", () => {
    expect(typeChip("construction").label).toBe("Construction");
    expect(typeChip("interior").icon).toBeTruthy();
  });
  it("typeChip falls back gracefully for unknown", () => {
    expect(typeChip("garbage").label).toBe("Project");
  });
});
