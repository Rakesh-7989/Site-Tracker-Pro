// SiteTrack Pro — paid plan self-serve activation contracts.
//
// Source-parsing contracts (efPaymentPhase pattern) locking the money path
// that turns basic/pro/business into truly active paid plans:
//   • cashfree-plan-link mints a platform-level one-time link for an
//     orgadmin (JWT + org-admin gate, upgrade/renew-only, price from the DB
//     plans table, per-org throttle) and stashes plan_payments pending.
//   • cashfree-webhook settles plan-upgrade links and ACTIVATES
//     (organizations.plan + subscriptions + billing_history, idempotent).
//   • migration 257 ships plan_payments + gateway methods on payments.
//   • razorpay-webhook posts real settlement rows (payments) and closes
//     fully-paid invoices instead of only flipping razorpay_status.
// A future edit can't silently drop any leg.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const planLink = readFileSync(join(process.cwd(), "supabase", "functions", "cashfree-plan-link", "index.ts"), "utf8");
const webhook = readFileSync(join(process.cwd(), "supabase", "functions", "cashfree-webhook", "index.ts"), "utf8");
const razorpayWebhook = readFileSync(join(process.cwd(), "supabase", "functions", "razorpay-webhook", "index.ts"), "utf8");
const mig = readFileSync(join(process.cwd(), "scripts", "supabase", "257_plan_payments.sql"), "utf8");

describe("cashfree-plan-link — orgadmin pay & upgrade (mig 257)", () => {
  it("verifies the JWT and authorises orgadmin-or-superadmin", () => {
    expect(planLink).toMatch(/auth\.getUser\(userJwt\)/);
    expect(planLink).toContain("only orgadmin or superadmin can buy a plan");
    expect(planLink).toMatch(/membership.*role.*admin/);
  });

  it("covers basic/pro/business and sends enterprise+custom to sales", () => {
    expect(planLink).toContain('"basic", "pro", "business"');
    expect(planLink).toContain("unsupported-plan");
  });

  it("blocks downgrades (support-handled), allows upgrades + renewals", () => {
    expect(planLink).toContain("downgrade-manual");
    expect(planLink).toMatch(/PLAN_RANK/);
  });

  it("prices from the DB plans table + GST (charge truth, not a constant)", () => {
    expect(planLink).toMatch(/from\("plans"\)/);
    expect(planLink).toMatch(/monthly_inr.*yearly_inr|yearly_inr.*monthly_inr/);
    expect(planLink).toContain("1 + GST");
  });

  it("throttles link mints per org (5/hr, 429)", () => {
    expect(planLink).toContain("rate-limited");
    expect(planLink).toContain("429");
    expect(planLink).toMatch(/from\("plan_payments"\)/);
  });

  it("tags the Cashfree link_meta as a plan_upgrade with org/plan/period", () => {
    expect(planLink).toContain('type: "plan_upgrade"');
    expect(planLink).toContain("org_id: orgId");
    expect(planLink).toContain("/org/billing?paid=1");
  });

  it("stashes a pending plan_payments row (webhook settles it)", () => {
    expect(planLink).toMatch(/from\("plan_payments"\)\.insert/);
    expect(planLink).toContain('status: "pending"');
    expect(planLink).toContain("stash-failed");
  });
});

describe("cashfree-webhook — plan activation on payment", () => {
  it("routes plan_upgrade links to the activation handler", () => {
    expect(webhook).toContain('=== "plan_upgrade"');
    expect(webhook).toContain("handlePlanUpgrade");
  });

  it("is idempotent (already-paid ack, non-PAID echo never flips)", () => {
    expect(webhook).toContain("ok (already paid)");
  });

  it("activates organizations.plan + billing_period on the paid row", () => {
    expect(webhook).toMatch(/from\("organizations"\)\s*\n\s*\.update\(\{ plan, billing_period: period \}\)/);
  });

  it("mirrors the active subscription row + writes billing_history", () => {
    expect(webhook).toMatch(/from\("subscriptions"\)\.upsert/);
    expect(webhook).toMatch(/from\("billing_history"\)\.insert/);
    expect(webhook).toContain('status: "succeeded"');
  });

  it("flips organizations.plan when a mandate subscription goes ACTIVE", () => {
    expect(webhook).toMatch(/String\(next\.status.*\) === "active"/);
    expect(webhook).toContain("org plan activated by subscription");
  });
});

describe("migration 257 — plan_payments + gateway methods", () => {
  it("creates plan_payments with plan/period/status checks + unique link", () => {
    expect(mig).toContain("create table if not exists public.plan_payments");
    expect(mig).toContain("check (plan in ('basic', 'pro', 'business'))");
    expect(mig).toContain("check (period in ('monthly', 'annual'))");
    expect(mig).toContain("link_id       text not null unique");
  });

  it("keeps writes service_role-only (tenant read, no direct writes)", () => {
    expect(mig).toContain("plan_payments_read");
    expect(mig).toContain("revoke insert, update, delete on public.plan_payments from authenticated");
  });

  it("admits gateway settlement methods on payments", () => {
    expect(mig).toContain("payments_method_check");
    expect(mig).toContain("'razorpay', 'cashfree'");
  });
});

describe("razorpay-webhook — real invoice settlement", () => {
  it("posts a payments receipt row (dedupe by gateway reference)", () => {
    expect(razorpayWebhook).toMatch(/from\("payments"\)\.insert/);
    expect(razorpayWebhook).toContain('method: "razorpay"');
    expect(razorpayWebhook).toMatch(/\.eq\("reference", reference\)/);
  });

  it("closes fully-paid invoices (status paid) but leaves partials open", () => {
    expect(razorpayWebhook).toContain('updates["status"] = "paid"');
    expect(razorpayWebhook).toMatch(/if \(newStatus === "paid"\) \{\s*\n\s*updates\["status"\]/);
  });
});
