// SiteTrack Pro — SEC-P0-2 plan-guard contracts.
//
// Source-parsing contracts that lock the organization plan/billing_period
// guard shipped with migration 254:
//   • plan/billing_period changes require superadmin (or backend
//     service_role with no auth JWT); org admins cannot self-upgrade to
//     enterprise via a direct PostgREST call (migration 247 hole).
//   • the guard is column-scoped (plan, billing_period) so onboarding
//     echo-saves of unchanged values always pass.
// A future edit can't silently drop either.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mig = readFileSync(join(process.cwd(), "scripts", "supabase", "254_org_plan_change_guard.sql"), "utf8");

describe("migration 254 — organization plan/billing_period guard (SEC-P0-2)", () => {
  it("creates a BEFORE UPDATE OF plan, billing_period trigger", () => {
    expect(mig).toContain("guard_organization_plan_change()");
    expect(mig).toMatch(/before update of plan, billing_period/i);
    expect(mig).toContain("trg_organizations_plan_guard");
  });

  it("allows no-op echoes but requires superadmin for real changes", () => {
    expect(mig).toMatch(/is distinct from/);
    expect(mig).toContain("is_superadmin()");
    expect(mig).toContain("organization_plan:");
  });

  it("lets backend reconciliation through (service_role has no auth JWT)", () => {
    expect(mig).toMatch(/auth\.uid\(\) is null/);
  });

  it("pins search_path on the guard function (definer-hardening posture)", () => {
    expect(mig).toMatch(/set search_path = public, extensions, pg_temp/);
  });

  it("self-verifies the function + trigger at apply time", () => {
    expect(mig).toContain("migration 254 FAILED");
    expect(mig).toContain("migration 254 ok");
  });
});

describe("anchor-digest — CRON_SECRET gate is fail-closed (SEC-P0-3)", () => {
  const ef = readFileSync(join(process.cwd(), "supabase", "functions", "anchor-digest", "index.ts"), "utf8");
  it("rejects when CRON_SECRET is not configured (no fail-open)", () => {
    expect(ef).toContain("cron-secret-not-configured");
    expect(ef).not.toMatch(/if \(cronSecret && /);
  });

  it("rejects a wrong bearer with 401", () => {
    expect(ef).toMatch(/Bearer \$\{cronSecret\}/);
    expect(ef).toContain('"unauthorized"');
  });
});
