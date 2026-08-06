// SiteTrack Pro — module registry tests (v4 Phase 1).

import { describe, it, expect } from "vitest";
import {
  MODULES,
  MODULE_IDS,
  moduleById,
  isModuleId,
  normalizeModules,
  isModuleEnabled,
  CORE_MODULE,
  INDUSTRY_TEMPLATES,
  templateModules,
  isRecommendedForSegment,
  alwaysOnModules,
} from "@/modules/registry";
import type { ModuleId } from "@/modules";

describe("module registry", () => {
  it("has a unique, non-empty catalog", () => {
    const ids = MODULES.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    expect(MODULE_IDS).toEqual(ids);
  });

  it("projects is the core always-on module", () => {
    expect(CORE_MODULE).toBe("projects");
    expect(alwaysOnModules()).toContain("projects");
  });

  it("moduleById + isModuleId resolve known ids", () => {
    expect(moduleById("design")?.label).toBeTruthy();
    expect(moduleById("nope")).toBeUndefined();
    expect(isModuleId("design")).toBe(true);
    expect(isModuleId("nope")).toBe(false);
  });
});

describe("normalizeModules", () => {
  it("returns null for null / empty / non-array input", () => {
    expect(normalizeModules(null)).toBeNull();
    expect(normalizeModules(undefined)).toBeNull();
    expect(normalizeModules([])).toBeNull();
    expect(normalizeModules("design")).toBeNull();
  });

  it("drops unknown ids and dedupes, preserving order", () => {
    expect(normalizeModules(["design", "bogus", "design", "finance"])).toEqual(["design", "finance"]);
  });

  it("returns null when every entry is unknown", () => {
    expect(normalizeModules(["bogus", "wat"])).toBeNull();
  });
});

describe("isModuleEnabled", () => {
  it("null config (not configured) → everything enabled", () => {
    expect(isModuleEnabled(null, "design")).toBe(true);
    expect(isModuleEnabled(null, "kiosks")).toBe(true);
  });

  it("explicit list gates modules", () => {
    const enabled: ModuleId[] = ["design", "finance"];
    expect(isModuleEnabled(enabled, "design")).toBe(true);
    expect(isModuleEnabled(enabled, "kiosks")).toBe(false);
  });
});

describe("industry templates", () => {
  it("every template contains only valid ids", () => {
    for (const [segment, ids] of Object.entries(INDUSTRY_TEMPLATES) as Array<[string, readonly string[]]>) {
      for (const id of ids) expect(isModuleId(id), `${segment}:${id}`).toBe(true);
    }
  });

  it("every template includes the core projects module", () => {
    for (const ids of Object.values(INDUSTRY_TEMPLATES)) {
      expect(ids).toContain(CORE_MODULE);
    }
  });

  it("multiple template = every module", () => {
    expect(INDUSTRY_TEMPLATES.multiple).toEqual(MODULE_IDS);
  });

  it("unknown / null segment → every module (back-compat)", () => {
    expect(templateModules(null)).toEqual(MODULE_IDS);
    expect(templateModules("bogus" as never)).toEqual(MODULE_IDS);
  });

  it("consultancy template omits site_ops / people / kiosks", () => {
    const t = templateModules("consultancy");
    expect(t).toContain("consultancy");
    expect(t).not.toContain("site_ops");
    expect(t).not.toContain("people");
    expect(t).not.toContain("kiosks");
  });

  it("construction template omits design + clients", () => {
    const t = templateModules("construction");
    expect(t).toContain("site_ops");
    expect(t).toContain("procurement");
    expect(t).not.toContain("design");
    expect(t).not.toContain("clients");
  });

  it("isRecommendedForSegment reflects the template", () => {
    expect(isRecommendedForSegment("architecture", "design")).toBe(true);
    expect(isRecommendedForSegment("architecture", "site_ops")).toBe(false);
  });
});
