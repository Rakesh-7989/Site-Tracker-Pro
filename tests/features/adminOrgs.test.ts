// SiteTrack Pro — Phase SA-O (Organizations screen rebuild) pure-helper tests.
// Covers the paged-org enrichment from the `orgs` view (MRR + status), the
// page-scoped KPI summary + plan mix, the plan filter, the CSV column spec,
// and the CSV export built on top of it.

import { describe, expect, it } from "vitest";
import {
  enrichOrgs,
  orgSummary,
  orgPlanMix,
  filterOrgsByPlan,
  fmtMrr,
  ORG_CSV_COLUMNS,
  PLAN_MIX_ORDER,
  type EnrichedOrg,
} from "@/features/admin/PlatformOrgsView";
import { buildCsv } from "@/lib/utils/genericCsv";
import type { PlatformOrg } from "@/app/queries/platformAdminQueries";
import type { OrgBillingRow } from "@/app/queries/platformBillingQueries";

const org = (over: Partial<PlatformOrg>): PlatformOrg => ({
  id: "o1", name: "G Architects", slug: "g-architects", plan: "pro",
  memberCount: 4, projectCount: 2, createdAt: "2026-01-01T00:00:00Z", ...over,
});

const bill = (over: Partial<OrgBillingRow> = {}): OrgBillingRow => ({
  id: "o1", name: "G Architects", plan: "pro", status: "active", mrr: 12000, ...over,
});

describe("enrichOrgs", () => {
  it("joins MRR + subscription status onto paged rows by id", () => {
    const rows = enrichOrgs(
      [org({ id: "o1" }), org({ id: "o2", plan: "basic" })],
      [bill({ id: "o1" }), bill({ id: "o2", status: "paused", mrr: 0 })],
    );
    expect(rows[0]).toMatchObject({ id: "o1", mrr: 12000, status: "active" });
    expect(rows[1]).toMatchObject({ id: "o2", mrr: 0, status: "paused" });
  });

  it("defaults missing billing rows to no status + zero MRR", () => {
    const rows = enrichOrgs([org({ id: "o9" })], [bill({ id: "other" })]);
    expect(rows[0]).toMatchObject({ id: "o9", status: null, mrr: 0 });
    expect(rows[0]).toHaveProperty("memberCount", 4);
  });

  it("empty org list → empty", () => {
    expect(enrichOrgs([], [bill()])).toEqual([]);
  });
});

describe("orgSummary", () => {
  const rows: EnrichedOrg[] = [
    { ...org({ id: "a", memberCount: 3, projectCount: 1 }), status: "active", mrr: 5000 },
    { ...org({ id: "b", plan: "basic", memberCount: 7, projectCount: 5 }), status: null, mrr: 0 },
  ];
  it("sums orgs / members / projects / MRR", () => {
    expect(orgSummary(rows)).toEqual({ orgs: 2, members: 10, projects: 6, mrr: 5000 });
  });
  it("empty list → zeroed summary", () => {
    expect(orgSummary([])).toEqual({ orgs: 0, members: 0, projects: 0, mrr: 0 });
  });
});

describe("orgPlanMix", () => {
  const rows: EnrichedOrg[] = [
    { ...org({ id: "a", plan: "pro" }), status: "active", mrr: 1 },
    { ...org({ id: "b", plan: "basic" }), status: "active", mrr: 1 },
    { ...org({ id: "c", plan: "pro" }), status: "active", mrr: 1 },
    { ...org({ id: "d", plan: "gold" }), status: "active", mrr: 1 },
  ];
  it("aggregates by plan in canonical order and drops zero-count plans", () => {
    expect(orgPlanMix(rows)).toEqual([
      { label: "Basic", value: 1 },
      { label: "Pro", value: 2 },
    ]);
  });
  it("empty list → empty series", () => {
    expect(orgPlanMix([])).toEqual([]);
  });
  it("PLAN_MIX_ORDER follows the assignable plan order", () => {
    expect(PLAN_MIX_ORDER).toEqual(["basic", "pro", "business", "enterprise", "custom"]);
  });
});

describe("filterOrgsByPlan", () => {
  const rows: EnrichedOrg[] = [
    { ...org({ id: "a", plan: "pro" }), status: "active", mrr: 1 },
    { ...org({ id: "b", plan: "basic" }), status: "active", mrr: 1 },
  ];
  it("'all' (or empty) passes everything through", () => {
    expect(filterOrgsByPlan(rows, "all")).toEqual(rows);
    expect(filterOrgsByPlan(rows, "")).toEqual(rows);
  });
  it("filters to the matching plan", () => {
    expect(filterOrgsByPlan(rows, "pro").map(r => r.id)).toEqual(["a"]);
  });
  it("unknown plan → empty", () => {
    expect(filterOrgsByPlan(rows, "enterprise")).toEqual([]);
  });
});

describe("fmtMrr", () => {
  it("formats with en-IN grouping + rupee symbol", () => {
    expect(fmtMrr(1234567)).toBe("₹12,34,567");
  });
  it("zero / negative / non-finite → em dash", () => {
    expect(fmtMrr(0)).toBe("—");
    expect(fmtMrr(-5)).toBe("—");
    expect(fmtMrr(Number.NaN)).toBe("—");
  });
});

describe("ORG_CSV_COLUMNS export", () => {
  it("specs the expected columns in display order", () => {
    expect(ORG_CSV_COLUMNS.map(c => c.label)).toEqual([
      "Organization", "Slug", "Plan", "Members", "Projects", "MRR (INR)", "Subscription", "Created",
    ]);
  });
  it("builds an RFC-4180 CSV with BOM from enriched rows", () => {
    const rows: EnrichedOrg[] = [
      { ...org({ id: "a", name: "G, Architects", memberCount: 4, projectCount: 2 }), status: "active", mrr: 12000 },
    ];
    const csv = buildCsv(rows as unknown as Array<Record<string, unknown>>, ORG_CSV_COLUMNS);
    expect(csv.startsWith("\uFEFFOrganization,Slug,Plan,Members,Projects,MRR (INR),Subscription,Created")).toBe(true);
    expect(csv).toContain("\"G, Architects\"");
    expect(csv).toContain("12000");
    expect(csv).toContain("active");
  });
});
