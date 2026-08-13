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
  it("v4 segment features resolve at the planned tiers", () => {
    expect(FEATURE_MIN_PLAN.time_tracking).toBe("pro");
    expect(FEATURE_MIN_PLAN.fee_billing).toBe("pro");
    expect(FEATURE_MIN_PLAN.deliverables).toBe("pro");
    expect(FEATURE_MIN_PLAN.review_rounds).toBe("pro");
    expect(FEATURE_MIN_PLAN.ffe).toBe("pro");
    expect(FEATURE_MIN_PLAN.statutory).toBe("business");
    expect(FEATURE_MIN_PLAN.utilization).toBe("business");
    expect(FEATURE_MIN_PLAN.procurement).toBe("business");
    // deny-by-default still applies to the new flags
    expect(hasPlanCap({ fee_billing: true }, "time_tracking")).toBe(false);
    expect(hasPlanCap({ time_tracking: true }, "time_tracking")).toBe(true);
  });
  it("v4 C2 billing features resolve at Pro with deny-by-default", () => {
    expect(FEATURE_MIN_PLAN.rate_cards).toBe("pro");
    expect(FEATURE_MIN_PLAN.time_approval).toBe("pro");
    expect(FEATURE_MIN_PLAN.retainer_billing).toBe("pro");
    expect(FEATURE_MIN_PLAN.hourly_billing).toBe("pro");
    // present but off unless explicitly true
    expect(hasPlanCap({ rate_cards: true }, "hourly_billing")).toBe(false);
    expect(hasPlanCap({ hourly_billing: true }, "hourly_billing")).toBe(true);
  });
  it("v4 Phase C audit_reports resolves at Business with deny-by-default", () => {
    expect(FEATURE_MIN_PLAN.audit_reports).toBe("business");
    expect(PLAN_FEATURE_LABEL.audit_reports).toBeTruthy();
    expect(hasPlanCap({ crm: true }, "audit_reports")).toBe(false);
    expect(hasPlanCap({ audit_reports: true }, "audit_reports")).toBe(true);
  });
  it("research_library resolves at Pro with deny-by-default", () => {
    expect(FEATURE_MIN_PLAN.research_library).toBe("pro");
    expect(PLAN_FEATURE_LABEL.research_library).toBeTruthy();
    expect(hasPlanCap({ crm: true }, "research_library")).toBe(false);
    expect(hasPlanCap({ research_library: true }, "research_library")).toBe(true);
  });
  it("v5 B1 client_approvals resolves at Pro with deny-by-default", () => {
    expect(FEATURE_MIN_PLAN.client_approvals).toBe("pro");
    expect(PLAN_FEATURE_LABEL.client_approvals).toBeTruthy();
    expect(hasPlanCap({ research_library: true }, "client_approvals")).toBe(false);
    expect(hasPlanCap({ client_approvals: true }, "client_approvals")).toBe(true);
  });
  it("plan rank orders correctly", () => {
    expect(PLAN_RANK.basic).toBeLessThan(PLAN_RANK.pro);
    expect(PLAN_RANK.pro).toBeLessThan(PLAN_RANK.business);
    expect(PLAN_RANK.business).toBeLessThan(PLAN_RANK.enterprise);
  });
});
