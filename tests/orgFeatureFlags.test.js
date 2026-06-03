import { describe, it, expect } from "vitest";
import {
  FEATURE_CATALOG, FEATURE_GROUPS,
  isFeatureEnabled, setOrgFeature, setPlatformFeature, resetOrgFeatures,
  featureStats, catalogByGroup, featuresForRole,
  INIT_ORG_FEATURE_FLAGS,
} from "../src/lib/orgFeatureFlags.js";

describe("orgFeatureFlags — catalog integrity", () => {
  it("every entry has id matching its key", () => {
    for (const [k, f] of Object.entries(FEATURE_CATALOG)) {
      expect(f.id).toBe(k);
    }
  });
  it("every entry has label, group, plan, default, desc", () => {
    for (const [k, f] of Object.entries(FEATURE_CATALOG)) {
      expect(f.label, `${k}.label`).toBeTruthy();
      expect(FEATURE_GROUPS).toContain(f.group);
      expect(["basic", "pro", "business"]).toContain(f.plan);
      expect(typeof f.default).toBe("boolean");
      expect(f.desc, `${k}.desc`).toBeTruthy();
    }
  });
  it("FEATURE_GROUPS lists exactly nav / tabs / workflow / orgadmin", () => {
    expect([...FEATURE_GROUPS].sort()).toEqual(["nav", "orgadmin", "tabs", "workflow"]);
  });
  it("catalog covers at least the 4 main groups with multiple entries", () => {
    const counts = Object.fromEntries(FEATURE_GROUPS.map(g => [g, 0]));
    for (const f of Object.values(FEATURE_CATALOG)) counts[f.group]++;
    expect(counts.nav).toBeGreaterThan(5);
    expect(counts.tabs).toBeGreaterThan(5);
    expect(counts.workflow).toBeGreaterThan(3);
    expect(counts.orgadmin).toBeGreaterThan(0);
  });
});

describe("orgFeatureFlags — isFeatureEnabled cascade", () => {
  it("unknown features default on", () => {
    expect(isFeatureEnabled({}, {}, "org1", "no_such_feature", "basic")).toBe(true);
  });
  it("uses catalog default when no overrides", () => {
    expect(isFeatureEnabled({}, {}, "org1", "calendar", "basic")).toBe(true);
    expect(isFeatureEnabled({}, {}, "org1", "arOverlay", "business")).toBe(false); // beta default off
  });
  it("plan gate: business-only feature is hidden from basic plan", () => {
    expect(isFeatureEnabled({}, {}, "org1", "kioskLabour", "basic")).toBe(false);
    expect(isFeatureEnabled({}, {}, "org1", "kioskLabour", "business")).toBe(true);
  });
  it("plan gate: pro feature is hidden from basic plan", () => {
    expect(isFeatureEnabled({}, {}, "org1", "estimate", "basic")).toBe(false);
    expect(isFeatureEnabled({}, {}, "org1", "estimate", "pro")).toBe(true);
  });
  it("custom plan can see every tier", () => {
    expect(isFeatureEnabled({}, {}, "org1", "kioskLabour", "custom")).toBe(true);
    expect(isFeatureEnabled({}, {}, "org1", "forecast", "custom")).toBe(true);
  });
  it("org override takes priority over default", () => {
    const orgFlags = { org1: { calendar: false } };
    expect(isFeatureEnabled({}, orgFlags, "org1", "calendar", "basic")).toBe(false);
  });
  it("org override can enable a beta-off feature", () => {
    const orgFlags = { org1: { arOverlay: true } };
    expect(isFeatureEnabled({}, orgFlags, "org1", "arOverlay", "business")).toBe(true);
  });
  it("platform kill-switch overrides org enable", () => {
    const platformFlags = { calendar: false };
    const orgFlags = { org1: { calendar: true } };
    expect(isFeatureEnabled(platformFlags, orgFlags, "org1", "calendar", "basic")).toBe(false);
  });
  it("plan gate still applies under platform-off", () => {
    // Even if platform allows, plan must be sufficient.
    expect(isFeatureEnabled({}, {}, "org1", "forecast", "basic")).toBe(false);
  });
  it("invalid plan defaults to basic gating", () => {
    expect(isFeatureEnabled({}, {}, "org1", "kioskLabour", "weird")).toBe(false);
    expect(isFeatureEnabled({}, {}, "org1", "calendar", "weird")).toBe(true); // basic feature
  });
});

describe("orgFeatureFlags — setOrgFeature / setPlatformFeature (immutable)", () => {
  it("setOrgFeature returns new object", () => {
    const before = INIT_ORG_FEATURE_FLAGS;
    const after = setOrgFeature(before, "org1", "calendar", false);
    expect(before.org1).toBeUndefined();
    expect(after.org1.calendar).toBe(false);
  });
  it("setOrgFeature ignores unknown feature ids", () => {
    expect(setOrgFeature({}, "org1", "bogus", true)).toEqual({});
  });
  it("setOrgFeature merges with existing overrides", () => {
    let flags = setOrgFeature({}, "org1", "calendar", false);
    flags = setOrgFeature(flags, "org1", "boq", false);
    expect(flags.org1.calendar).toBe(false);
    expect(flags.org1.boq).toBe(false);
  });
  it("setPlatformFeature toggles platform-wide", () => {
    const next = setPlatformFeature({}, "kioskLabour", false);
    expect(next.kioskLabour).toBe(false);
  });
  it("setPlatformFeature ignores unknown ids", () => {
    expect(setPlatformFeature({}, "bogus", true)).toEqual({});
  });
});

describe("orgFeatureFlags — resetOrgFeatures", () => {
  it("clears an org's overrides", () => {
    const before = { org1: { calendar: false }, org2: { boq: false } };
    const after = resetOrgFeatures(before, "org1");
    expect(after.org1).toBeUndefined();
    expect(after.org2).toBeDefined();
  });
  it("handles missing org gracefully", () => {
    expect(resetOrgFeatures({}, "ghost")).toEqual({});
  });
});

describe("orgFeatureFlags — featureStats", () => {
  it("counts enabled vs plan-locked for basic plan", () => {
    const s = featureStats({}, {}, "org1", "basic");
    expect(s.enabled).toBeGreaterThan(0);
    expect(s.total).toBeGreaterThan(s.enabled);
    expect(s.planLocked).toBeGreaterThan(0); // pro + business features are locked
    expect(s.enabled + s.planLocked).toBeLessThanOrEqual(s.total);
  });
  it("counts more enabled features for business plan", () => {
    const basic = featureStats({}, {}, "org1", "basic");
    const business = featureStats({}, {}, "org1", "business");
    expect(business.enabled).toBeGreaterThan(basic.enabled);
    expect(business.planLocked).toBe(0); // business unlocks pro + business tiers
  });
  it("platform kill-switch reduces enabled count", () => {
    const before = featureStats({}, {}, "org1", "business");
    const after = featureStats({ calendar: false }, {}, "org1", "business");
    expect(after.enabled).toBe(before.enabled - 1);
  });
});

describe("orgFeatureFlags — catalogByGroup", () => {
  it("groups every feature", () => {
    const g = catalogByGroup();
    const grouped = FEATURE_GROUPS.reduce((s, k) => s + g[k].length, 0);
    expect(grouped).toBe(Object.keys(FEATURE_CATALOG).length);
  });
});

describe("orgFeatureFlags — featuresForRole", () => {
  it("superadmin + orgadmin see everything", () => {
    expect(featuresForRole("superadmin").length).toBe(Object.keys(FEATURE_CATALOG).length);
    expect(featuresForRole("orgadmin").length).toBe(Object.keys(FEATURE_CATALOG).length);
  });
  it("contractor sees a focused subset", () => {
    const list = featuresForRole("contractor");
    expect(list).toContain("rfi");
    expect(list).toContain("rabills");
    expect(list).not.toContain("ai");
    expect(list).not.toContain("kioskLabour");
  });
  it("client sees only read-only-ish features", () => {
    const list = featuresForRole("client");
    expect(list).toContain("calendar");
    expect(list).not.toContain("rabills"); // financial
    expect(list).not.toContain("labour");  // PII
  });
  it("architect / pm exclude kiosks + AR overlay", () => {
    expect(featuresForRole("architect")).not.toContain("kioskLabour");
    expect(featuresForRole("pm")).not.toContain("arOverlay");
  });
});
