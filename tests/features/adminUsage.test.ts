import { describe, it, expect } from "vitest";
import {
  usagePlanMix,
  USAGE_PLAN_ORDER,
  USAGE_CSV_COLUMNS,
} from "@/features/admin/PlatformUsageView";

describe("usagePlanMix", () => {
  it("maps counts into canonical chart data, dropping zero plans", () => {
    const data = usagePlanMix([
      { plan: "pro", count: 5 },
      { plan: "basic", count: 2 },
      { plan: "enterprise", count: 1 },
    ]);
    expect(data).toEqual([
      { label: "basic", value: 2 },
      { label: "pro", value: 5 },
      { label: "enterprise", value: 1 },
    ]);
  });

  it("dedupes repeated plan keys (last wins) and returns empty on no rows", () => {
    expect(usagePlanMix([{ plan: "pro", count: 1 }, { plan: "pro", count: 3 }])).toEqual([{ label: "pro", value: 3 }]);
    expect(usagePlanMix([])).toEqual([]);
  });

  it("falls back unknown plans to zero (dropped)", () => {
    expect(usagePlanMix([{ plan: "customx", count: 4 }])).toEqual([]);
  });
});

describe("USAGE_PLAN_ORDER + USAGE_CSV_COLUMNS", () => {
  it("orders plans basic → custom", () => {
    expect(USAGE_PLAN_ORDER).toEqual(["basic", "pro", "business", "enterprise", "custom"]);
  });

  it("covers the plan-count fields for export", () => {
    expect(USAGE_CSV_COLUMNS.map(c => c.key)).toEqual(["plan", "count"]);
  });
});