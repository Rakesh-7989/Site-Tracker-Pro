import { describe, it, expect } from "vitest";
import {
  buildUsage, suggestForOrg, groupSuggestions, narrate,
} from "../src/lib/ai/aiFeatureRecommender";

const CATALOG = [
  { key: "tab_bo", label: "BOQ", group: "tabs" },
  { key: "tab_ra", label: "RA Bills", group: "tabs" },
  { key: "tab_drawings", label: "Drawings", group: "tabs" },
  { key: "orgadmin_billing", label: "Billing", group: "orgadmin", requiresPlan: "business" },
];

function mkRow(daysAgo, resource) {
  return {
    ts: new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString(),
    resource,
    action: "UPDATE",
  };
}

describe("aiFeatureRecommender — buildUsage", () => {
  it("filters rows older than window", () => {
    const rows = [mkRow(5, "ra_bill"), mkRow(40, "ra_bill")];
    expect(buildUsage(rows).ra_bill).toBe(1);
  });

  it("counts by resource", () => {
    const rows = [mkRow(1, "ra_bill"), mkRow(1, "ra_bill"), mkRow(1, "boq_item")];
    const u = buildUsage(rows);
    expect(u.ra_bill).toBe(2);
    expect(u.boq_item).toBe(1);
  });

  it("ignores malformed rows", () => {
    expect(buildUsage([null, { ts: "garbage", resource: "x" }])).toEqual({});
  });

  it("honours custom windowDays", () => {
    const rows = [mkRow(5, "x"), mkRow(20, "x")];
    expect(buildUsage(rows, { windowDays: 10 }).x).toBe(1);
  });

  it("returns {} for empty input", () => {
    expect(buildUsage([])).toEqual({});
    expect(buildUsage(undefined)).toEqual({});
  });
});

describe("aiFeatureRecommender — suggestForOrg", () => {
  it("suggests disabling a flag with zero touches", () => {
    const usage = {};
    const flags = { tab_bo: true };
    const out = suggestForOrg(CATALOG, usage, flags, "pro");
    const disable = out.filter(s => s.featureKey === "tab_bo");
    expect(disable.length).toBe(1);
    expect(disable[0].type).toBe("disable");
  });

  it("does NOT suggest disable when flag is already OFF", () => {
    const flags = { tab_bo: false };
    const out = suggestForOrg(CATALOG, {}, flags, "pro");
    const bo = out.filter(s => s.featureKey === "tab_bo");
    expect(bo.length).toBe(0);
  });

  it("celebrates high-touch features", () => {
    const usage = { tab_ra: 50 };
    const flags = { tab_ra: true };
    const out = suggestForOrg(CATALOG, usage, flags, "pro");
    const ra = out.find(s => s.featureKey === "tab_ra");
    expect(ra?.type).toBe("celebrate");
  });

  it("nudges to upgrade when plan-gated feature is touched on lower plan", () => {
    const usage = { orgadmin_billing: 3 };
    const flags = { orgadmin_billing: true };
    const out = suggestForOrg(CATALOG, usage, flags, "pro");
    const billing = out.find(s => s.featureKey === "orgadmin_billing");
    expect(billing?.type).toBe("upgrade");
  });

  it("does not nudge to upgrade when org already on or above plan", () => {
    const out = suggestForOrg(CATALOG, { orgadmin_billing: 3 }, { orgadmin_billing: true }, "business");
    expect(out.find(s => s.type === "upgrade")).toBeUndefined();
  });

  it("orders: upgrade before disable before celebrate", () => {
    const usage = { tab_ra: 60, orgadmin_billing: 5 };
    const flags = { tab_bo: true, tab_ra: true, tab_drawings: true, orgadmin_billing: true };
    const out = suggestForOrg(CATALOG, usage, flags, "pro");
    const types = out.map(s => s.type);
    expect(types[0]).toBe("upgrade");
    const firstCelebrate = types.indexOf("celebrate");
    const lastDisable = types.lastIndexOf("disable");
    expect(firstCelebrate > lastDisable || firstCelebrate === -1 || lastDisable === -1).toBe(true);
  });
});

describe("aiFeatureRecommender — groupSuggestions", () => {
  it("buckets by type", () => {
    const grouped = groupSuggestions([
      { type: "upgrade", featureKey: "a", label: "A" },
      { type: "disable", featureKey: "b", label: "B" },
      { type: "celebrate", featureKey: "c", label: "C" },
      { type: "disable", featureKey: "d", label: "D" },
    ]);
    expect(grouped.upgrade.length).toBe(1);
    expect(grouped.disable.length).toBe(2);
    expect(grouped.celebrate.length).toBe(1);
  });
});

describe("aiFeatureRecommender — narrate", () => {
  it("narrates disable in English", () => {
    const s = { type: "disable", label: "BOQ", rationale: "No activity in the last 30 days." };
    expect(narrate(s, "en")).toContain("hiding");
    expect(narrate(s, "en")).toContain("BOQ");
  });

  it("narrates in Telugu transliteration", () => {
    const s = { type: "celebrate", label: "RA Bills", rationale: "30 interactions." };
    expect(narrate(s, "te")).toContain("vadukuntunnaru");
  });

  it("narrates in Hindi transliteration", () => {
    const s = { type: "disable", label: "BOQ", rationale: "Idle." };
    expect(narrate(s, "hi")).toContain("chhupayen");
  });

  it("falls back to English for unknown lang", () => {
    const s = { type: "disable", label: "BOQ", rationale: "Idle." };
    expect(narrate(s, "ta")).toContain("hiding");
  });

  it("returns empty for null", () => {
    expect(narrate(null)).toBe("");
  });
});
