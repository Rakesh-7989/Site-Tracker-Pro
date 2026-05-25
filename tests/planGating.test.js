import { describe, it, expect } from "vitest";
import { canUseFeature, withinProjectQuota, requiredPlanFor, upsellLine, planFeatureRow, getFeatureMatrix } from "../src/lib/planGating.js";

describe("planGating.canUseFeature", () => {
  it("basic plan cannot white-label", () => {
    expect(canUseFeature("basic", "white_label")).toBe(false);
  });

  it("pro plan unlocks labour_kiosk + material_aggregator but not AR", () => {
    expect(canUseFeature("pro", "labour_kiosk")).toBe(true);
    expect(canUseFeature("pro", "material_aggregator")).toBe(true);
    expect(canUseFeature("pro", "ar_overlay")).toBe(false);
  });

  it("business plan unlocks AR + site kiosk + AI forecast", () => {
    expect(canUseFeature("business", "ar_overlay")).toBe(true);
    expect(canUseFeature("business", "site_kiosk")).toBe(true);
    expect(canUseFeature("business", "ai_forecast")).toBe(true);
  });

  it("only custom plan has custom_integrations", () => {
    expect(canUseFeature("business", "custom_integrations")).toBe(false);
    expect(canUseFeature("custom", "custom_integrations")).toBe(true);
  });

  it("unknown plan defaults to basic", () => {
    expect(canUseFeature("unknown", "white_label")).toBe(false);
    expect(canUseFeature("unknown", "compliance_checks")).toBe(true); // basic includes compliance
  });
});

describe("planGating.withinProjectQuota", () => {
  it("basic = 1 project max", () => {
    expect(withinProjectQuota("basic", 0)).toBe(true);
    expect(withinProjectQuota("basic", 1)).toBe(false);
  });

  it("pro = 5 projects max", () => {
    expect(withinProjectQuota("pro", 4)).toBe(true);
    expect(withinProjectQuota("pro", 5)).toBe(false);
  });

  it("business + custom are unlimited", () => {
    expect(withinProjectQuota("business", 1000)).toBe(true);
    expect(withinProjectQuota("custom", 9999)).toBe(true);
  });
});

describe("planGating.requiredPlanFor", () => {
  it("returns lowest plan that unlocks the feature", () => {
    expect(requiredPlanFor("white_label")).toBe("pro");
    expect(requiredPlanFor("ar_overlay")).toBe("business");
    expect(requiredPlanFor("custom_integrations")).toBe("custom");
    expect(requiredPlanFor("compliance_checks")).toBe("basic");
  });
});

describe("planGating.upsellLine", () => {
  it("returns upsell when current plan doesn't unlock feature", () => {
    const line = upsellLine("basic", "ar_overlay");
    expect(line).toContain("Business");
    expect(line).toContain("Basic");
  });

  it("returns empty string when already on required plan", () => {
    expect(upsellLine("business", "ar_overlay")).toBe("");
  });
});

describe("planGating.planFeatureRow + getFeatureMatrix", () => {
  it("planFeatureRow shows the feature value across plans", () => {
    const row = planFeatureRow("white_label");
    expect(row.basic).toBe(false);
    expect(row.pro).toBe(true);
    expect(row.business).toBe(true);
  });

  it("getFeatureMatrix is deeply cloned (safe to mutate)", () => {
    const m = getFeatureMatrix();
    m.basic.white_label = true;
    expect(canUseFeature("basic", "white_label")).toBe(false);
  });
});
