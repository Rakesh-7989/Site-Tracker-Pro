import { describe, it, expect } from "vitest";
import {
  billingSummary,
  billingByPlan,
  PLAN_ORDER,
  BILLING_CSV_COLUMNS,
} from "@/features/admin/PlatformBillingView";
import type { OrgBillingRow } from "@/app/platformBillingQueries";

const row = (over: Partial<OrgBillingRow>): OrgBillingRow => ({ id: "o1", name: "Acme", plan: "pro", status: "active", mrr: 1000, ...over });

describe("billingSummary", () => {
  it("rolls up active/trial/suspended + MRR/ARR", () => {
    const s = billingSummary([
      row({ id: "a", status: "active", mrr: 1000 }),
      row({ id: "b", status: "active", mrr: 2000 }),
      row({ id: "c", status: "trial", mrr: 0 }),
      row({ id: "d", status: "suspended", mrr: 500 }),
    ]);
    expect(s).toEqual({ active: 2, trial: 1, suspended: 1, totalMRR: 3000, arr: 36000 });
  });

  it("excludes non-active orgs from MRR and returns zero buckets on empty", () => {
    const s = billingSummary([]);
    expect(s).toEqual({ active: 0, trial: 0, suspended: 0, totalMRR: 0, arr: 0 });
    expect(billingSummary([row({ status: "trial", mrr: 9999 })]).totalMRR).toBe(0);
  });
});

describe("billingByPlan", () => {
  it("aggregates MRR per plan in canonical order, dropping zero plans", () => {
    const data = billingByPlan([
      row({ id: "a", plan: "pro", status: "active", mrr: 1000 }),
      row({ id: "b", plan: "basic", status: "active", mrr: 500 }),
      row({ id: "c", plan: "pro", status: "active", mrr: 1500 }),
      row({ id: "d", plan: "business", status: "trial", mrr: 9999 }),
    ]);
    expect(data).toEqual([
      { label: "basic", value: 500 },
      { label: "pro", value: 2500 },
    ]);
  });

  it("returns empty when no active MRR", () => {
    expect(billingByPlan([])).toEqual([]);
    expect(billingByPlan([row({ status: "suspended", mrr: 100 })])).toEqual([]);
  });
});

describe("PLAN_ORDER + BILLING_CSV_COLUMNS", () => {
  it("orders plans basic → custom", () => {
    expect(PLAN_ORDER).toEqual(["basic", "pro", "business", "enterprise", "custom"]);
  });

  it("covers the billing raw fields for export", () => {
    const keys = BILLING_CSV_COLUMNS.map(c => c.key);
    expect(keys).toEqual(["name", "plan", "status", "mrr"]);
  });
});