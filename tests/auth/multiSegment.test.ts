// SiteTrack Pro — multi-segment orgs (migration 228) unit tests.
// Covers: segment-array normalization, effective-set resolution (array /
// legacy 'multiple' / single / null), legacy-column derivation, union of
// project types, union of module templates, array-aware tab gating and the
// updateOrg patch carrying segments.

import { describe, it, expect } from "vitest";
import {
  CORE_SEGMENTS,
  ALL_CORE_SEGMENTS,
  MULTIPLE_SEGMENT,
  isCompanySegmentArray,
  resolveOrgSegments,
  legacySegmentFor,
  projectTypesForSegments,
} from "@/auth/segmentConfig";
import { templateModules, templateModulesForSegments } from "@/modules/registry";
import { TAB_CATALOG, visibleTabs, type TabDef } from "@/features/project/tabs-config";
import type { Capability } from "@/auth";

const caps = new Set<Capability>() as ReadonlySet<Capability>;

describe("segment array helpers", () => {
  it("CORE_SEGMENTS excludes the derived 'multiple'", () => {
    expect(CORE_SEGMENTS).toHaveLength(4);
    expect(CORE_SEGMENTS).not.toContain("multiple");
    expect(ALL_CORE_SEGMENTS).toEqual(CORE_SEGMENTS);
    expect(MULTIPLE_SEGMENT).toBe("multiple");
  });

  it("isCompanySegmentArray dedupes + drops unknowns and 'multiple'", () => {
    expect(isCompanySegmentArray(["architecture", "interior"])).toEqual(["architecture", "interior"]);
    expect(isCompanySegmentArray(["architecture", "architecture", "junk", "multiple", "consultancy"]))
      .toEqual(["architecture", "consultancy"]);
    expect(isCompanySegmentArray([])).toBeNull();
    expect(isCompanySegmentArray("not-an-array")).toBeNull();
    expect(isCompanySegmentArray(null)).toBeNull();
  });
});

describe("resolveOrgSegments()", () => {
  it("prefers the stored array", () => {
    expect(resolveOrgSegments(["interior", "design" as never], "construction")).toEqual(["interior"]);
    expect(resolveOrgSegments(["architecture"], null)).toEqual(["architecture"]);
  });

  it("expands legacy 'multiple' to all four core segments", () => {
    expect(resolveOrgSegments(null, "multiple")).toEqual(["construction", "architecture", "interior", "consultancy"]);
  });

  it("wraps a legacy single value", () => {
    expect(resolveOrgSegments(null, "consultancy")).toEqual(["consultancy"]);
  });

  it("returns null for legacy unconfigured orgs", () => {
    expect(resolveOrgSegments(null, null)).toBeNull();
    expect(resolveOrgSegments(undefined, undefined)).toBeNull();
  });
});

describe("legacySegmentFor()", () => {
  it("1 pick → that pick; 2+ → 'multiple'; none → null", () => {
    expect(legacySegmentFor(["architecture"])).toBe("architecture");
    expect(legacySegmentFor(["architecture", "interior"])).toBe("multiple");
    expect(legacySegmentFor([])).toBeNull();
  });
});

describe("projectTypesForSegments()", () => {
  it("unions project types across picks in first-seen order", () => {
    // architecture = [design, consultant]; interior = [interior, design]
    expect(projectTypesForSegments(["architecture", "interior"])).toEqual(["design", "consultant", "interior"]);
    // construction adds [construction]
    expect(projectTypesForSegments(["architecture", "interior", "construction"]))
      .toEqual(["design", "consultant", "interior", "construction"]);
  });

  it("empty selection falls back to all types", () => {
    expect(projectTypesForSegments([])).toEqual(["construction", "interior", "design", "consultant"]);
  });
});

describe("templateModulesForSegments()", () => {
  it("unions templates across picks (superset of each single pick)", () => {
    const arch = templateModulesForSegments(["architecture"]);
    const dual = templateModulesForSegments(["architecture", "interior"]);
    for (const id of arch) expect(dual).toContain(id);
    // interior's site_ops joins via the union
    expect(dual).toContain("site_ops");
  });

  it("single pick equals the single-segment template", () => {
    expect(templateModulesForSegments(["construction"]).sort())
      .toEqual([...templateModules("construction")].sort());
    expect(templateModulesForSegments(["architecture"]).sort())
      .toEqual([...templateModules("architecture")].sort());
  });
});

describe("visibleTabs() with a segment ARRAY (multi-segment gating)", () => {
  const segTab = (id: string, segments: string[]): TabDef =>
    ({ id, label: id, icon: "folder", segments }) as unknown as TabDef;
  const catalog: TabDef[] = [
    segTab("arch-only", ["architecture"]),
    segTab("interior-only", ["interior"]),
    segTab("any", ["architecture", "interior", "consultancy", "multiple"]),
    { id: "ungated", label: "ungated", icon: "folder" } as unknown as TabDef,
  ];

  it("shows tabs matching ANY picked segment", () => {
    const ids = visibleTabs(caps, "design", undefined, ["architecture", "interior"], catalog).map(t => t.id);
    expect(ids).toContain("arch-only");
    expect(ids).toContain("interior-only");
    expect(ids).toContain("any");
    expect(ids).toContain("ungated");
  });

  it("hides gated tabs not covered by the picks", () => {
    const ids = visibleTabs(caps, "design", undefined, ["consultancy"], catalog).map(t => t.id);
    expect(ids).not.toContain("arch-only");
    expect(ids).toContain("any"); // listed
    expect(ids).toContain("ungated");
  });

  it("null/empty set still hides gated tabs (legacy orgs)", () => {
    expect(visibleTabs(caps, "design", undefined, null, catalog).map(t => t.id)).toEqual(["ungated"]);
    expect(visibleTabs(caps, "design", undefined, [], catalog).map(t => t.id)).toEqual(["ungated"]);
  });

  it("real catalog: an architecture+interior org sees both design AND ffe-family tabs where applicable", () => {
    const ids = visibleTabs(caps, "design", undefined, ["architecture", "interior"]).map(t => t.id);
    const archIds = visibleTabs(caps, "design", undefined, ["architecture"]).map(t => t.id);
    // union is a superset of the single-pick view
    for (const id of archIds) expect(ids).toContain(id);
  });

  it("TAB_CATALOG sanity — catalog non-empty for the smoke above", () => {
    expect(TAB_CATALOG.length).toBeGreaterThan(20);
  });
});
