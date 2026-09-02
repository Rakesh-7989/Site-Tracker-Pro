// SiteTrack Pro — gstn-einvoice edge-function contract.
//
// Source-parsing contract (efPaymentPhase pattern). The EF reads the plan
// gate's org from the owning PROJECT (invoices carry no org_id — verified
// via information_schema), so a future edit can't reintroduce the broken
// non-existent `invoice.org_id` reference.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "supabase", "functions", "gstn-einvoice", "index.ts"), "utf8");

describe("gstn-einvoice — org derived from project (plan gate)", () => {
  it("never references a non-existent invoices.org_id column", () => {
    expect(src).not.toContain("invoices.org_id");
    expect(src).not.toContain("invoice.org_id");
  });

  it("derives the org from the projects table via the invoice's project_id", () => {
    expect(src).toMatch(/\.from\("projects"\)\s*\n\s*\.select\("org_id"\)\s*\n\s*\.eq\("id", invoice\.project_id\)/);
  });

  it("still gates the plan on the resolved org", () => {
    expect(src).toMatch(/requirePlanFeature\(orgId \|\| "", "gstn_filing"\)/);
  });
});
