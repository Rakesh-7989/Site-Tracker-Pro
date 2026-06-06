// SiteTrack Pro — plan capability model tests.

import { describe, it, expect } from "vitest";
import { hasPlanCap, planLimit, FEATURE_MIN_PLAN, PLAN_FEATURE_LABEL, PLAN_RANK } from "@/auth/planCaps";

const basic = { finance: false, whatsapp_share: true, storage_gb: 5, projects_ceiling: 5, custom_roles: false };
const business = { finance: true, custom_roles: true, rera_filing: true, storage_gb: 250, projects_ceiling: 200, audit_unlimited: true };
const enterprise = { finance: true, custom_roles: true, storage_gb: null, projects_ceiling: null };

describe("hasPlanCap", () => {
  it("true only when the flag is explicitly true (deny-by-default)", () => {
    expect(hasPlanCap(basic, "whatsapp_share")).toBe(true);
    expect(hasPlanCap(basic, "finance")).toBe(false);     // explicit false
    expect(hasPlanCap(basic, "rera_filing")).toBe(false); // missing key → false
    expect(hasPlanCap(business, "finance")).toBe(true);
    expect(hasPlanCap(business, "custom_roles")).toBe(true);
  });
  it("null/undefined caps → false", () => {
    expect(hasPlanCap(null, "finance")).toBe(false);
    expect(hasPlanCap(undefined, "finance")).toBe(false);
  });
});

describe("planLimit", () => {
  it("returns the number, null for unlimited/missing", () => {
    expect(planLimit(basic, "storage_gb")).toBe(5);
    expect(planLimit(basic, "projects_ceiling")).toBe(5);
    expect(planLimit(enterprise, "storage_gb")).toBeNull();   // explicit null = unlimited
    expect(planLimit(business, "audit_days")).toBeNull();     // missing → null
    expect(planLimit(null, "storage_gb")).toBeNull();
  });
});

describe("FEATURE_MIN_PLAN + labels", () => {
  it("finance is a Pro feature, custom_roles + rera are Business", () => {
    expect(FEATURE_MIN_PLAN.finance).toBe("pro");
    expect(FEATURE_MIN_PLAN.custom_roles).toBe("business");
    expect(FEATURE_MIN_PLAN.rera_filing).toBe("business");
    expect(FEATURE_MIN_PLAN.whatsapp_share).toBe("basic");
  });
  it("every feature has a min-plan AND a label", () => {
    for (const f of Object.keys(FEATURE_MIN_PLAN) as Array<keyof typeof FEATURE_MIN_PLAN>) {
      expect(PLAN_FEATURE_LABEL[f]).toBeTruthy();
    }
  });
  it("plan rank orders correctly", () => {
    expect(PLAN_RANK.basic).toBeLessThan(PLAN_RANK.pro);
    expect(PLAN_RANK.pro).toBeLessThan(PLAN_RANK.business);
    expect(PLAN_RANK.business).toBeLessThan(PLAN_RANK.enterprise);
  });
});
