import { describe, it, expect, beforeEach } from "vitest";
import { TenantSecurityError, type SecurityContext } from "../workers/api/src/middleware/tenant";
import {
  assertStorageDeleteAccess,
  assertStorageReadAccess,
  buildTenantStorageKey,
} from "../workers/api/src/middleware/storageAuth";
import {
  CANONICAL_PLAN_PRICES_PAISE,
  PaymentSettlementRepository,
  computeGstInclusivePaise,
} from "../workers/api/src/repositories/paymentSettlementRepository";
import { PLAN_TIERS, gstInclusive } from "../src/features/marketing/plans";

interface AuditMockState {
  projects: Array<{ id: string; org_id: string }>;
  partnerOrgs: Array<{ project_id: string; org_id: string; status: string }>;
  plans: Array<{ id: string; monthly_inr: number; yearly_inr: number }>;
  organizations: Array<{ id: string; plan: string; billing_period: string }>;
  planPayments: Array<{ id: string; org_id: string; plan: string; period: string; amount_paise: number; link_id: string; status: string; paid_at: string | null }>;
  subscriptions: Array<{ id: string; org_id: string; plan: string; status: string; provider: string; billing_period: string }>;
  billingHistory: Array<{ id: string; org_id: string; external_id: string; amount: number; gst: number; status: string }>;
  auditLogs: Array<{ id: string; org_id: string; action: string; resource: string; resource_id: string }>;
  invoices: Array<{ id: string; total_amount: number; created_by: string; status: string }>;
  payments: Array<{ id: string; invoice_id: string; amount: number; method: string; reference_number: string; recorded_by: string }>;
}

function createAuditMockD1(state: AuditMockState): D1Database {
  return {
    prepare(query: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...params: unknown[]) {
          args = params;
          return stmt;
        },
        async first<T>() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.includes("FROM projects p WHERE p.id = ?")) {
            const [ctxOrg, projectId, ownerOrg, partnerOrg] = args as [string, string, string, string];
            const proj = state.projects.find((p) => p.id === projectId);
            if (!proj) return null as T;
            const isOwner = proj.org_id === ownerOrg;
            const isPartner = state.partnerOrgs.some(
              (po) => po.project_id === projectId && po.org_id === partnerOrg && po.status === "active"
            );
            if (!isOwner && !isPartner) return null as T;
            return { org_id: proj.org_id, is_owner: proj.org_id === ctxOrg ? 1 : 0 } as T;
          }
          if (q.includes("FROM projects WHERE id = ? AND org_id = ?")) {
            const [projectId, orgId] = args as [string, string];
            const proj = state.projects.find((p) => p.id === projectId && p.org_id === orgId);
            return (proj ? { id: proj.id } : null) as T;
          }
          if (q.includes("FROM plans WHERE id = ?")) {
            const [planId] = args as [string];
            return (state.plans.find((p) => p.id === planId) ?? null) as T;
          }
          if (q.includes("FROM plan_payments WHERE id = ?")) {
            const [ppId] = args as [string];
            return (state.planPayments.find((p) => p.id === ppId) ?? null) as T;
          }
          if (q.includes("FROM plan_payments WHERE link_id = ?")) {
            const [linkId] = args as [string];
            const found = state.planPayments.find((p) => p.link_id === linkId);
            return (found ? { id: found.id } : null) as T;
          }
          if (q.includes("FROM subscriptions WHERE org_id = ?")) {
            const [orgId] = args as [string];
            const found = state.subscriptions.find((s) => s.org_id === orgId);
            return (found ? { id: found.id } : null) as T;
          }
          if (q.includes("FROM billing_history WHERE org_id = ? AND external_id = ?")) {
            const [orgId, extId] = args as [string, string];
            const found = state.billingHistory.find((b) => b.org_id === orgId && b.external_id === extId);
            return (found ? { id: found.id } : null) as T;
          }
          if (q.includes("FROM invoices WHERE id = ?")) {
            const [invoiceId] = args as [string];
            return (state.invoices.find((i) => i.id === invoiceId) ?? null) as T;
          }
          if (q.includes("FROM payments WHERE invoice_id = ? AND reference_number = ?")) {
            const [invoiceId, ref] = args as [string, string];
            const found = state.payments.find((p) => p.invoice_id === invoiceId && p.reference_number === ref);
            return (found ? { id: found.id } : null) as T;
          }
          return null as T;
        },
        async run() {
          const q = query.replace(/\s+/g, " ").trim();
          if (q.startsWith("UPDATE plan_payments SET status = 'paid'")) {
            const [paidAt, ppId] = args as [string, string];
            const row = state.planPayments.find((p) => p.id === ppId && p.status === "pending");
            if (!row) return { success: true, meta: { changes: 0 } };
            row.status = "paid";
            row.paid_at = paidAt;
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE organizations SET plan = ?")) {
            const [plan, period, orgId] = args as [string, string, string];
            const org = state.organizations.find((o) => o.id === orgId);
            if (org) {
              org.plan = plan;
              org.billing_period = period;
            }
            return { success: true, meta: { changes: org ? 1 : 0 } };
          }
          if (q.startsWith("INSERT INTO subscriptions")) {
            const [id, orgId, plan, billingPeriod] = args as [string, string, string, string];
            state.subscriptions.push({ id, org_id: orgId, plan, status: "active", provider: "razorpay", billing_period: billingPeriod });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE subscriptions SET plan = ?")) {
            const [plan, billingPeriod, , , subId] = args as [string, string, string, string, string];
            const sub = state.subscriptions.find((s) => s.id === subId);
            if (sub) {
              sub.plan = plan;
              sub.billing_period = billingPeriod;
              sub.status = "active";
            }
            return { success: true, meta: { changes: sub ? 1 : 0 } };
          }
          if (q.startsWith("INSERT INTO billing_history")) {
            const [id, orgId, extId, amount, gst] = args as [string, string, string, number, number];
            state.billingHistory.push({ id, org_id: orgId, external_id: extId, amount, gst, status: "succeeded" });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("INSERT INTO audit_log_v2")) {
            const [id, orgId, resourceId] = args as [string, string, string];
            state.auditLogs.push({ id, org_id: orgId, action: "PAYMENT", resource: "subscription", resource_id: resourceId });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("INSERT INTO payments")) {
            const [id, invoiceId, amount, , ref, recordedBy] = args as [string, string, number, string, string, string];
            state.payments.push({ id, invoice_id: invoiceId, amount, method: "razorpay", reference_number: ref, recorded_by: recordedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (q.startsWith("UPDATE invoices SET status = ?")) {
            const [status, invoiceId] = args as [string, string];
            const inv = state.invoices.find((i) => i.id === invoiceId);
            if (inv) inv.status = status;
            return { success: true, meta: { changes: inv ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async all() {
          return { results: [], success: true, meta: {} };
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe("Audit P0 Fixes (AUD-01, AUD-02, AUD-03)", () => {
  let state: AuditMockState;
  let db: D1Database;
  const ctxOrgA: SecurityContext = { userId: "u_a", email: "a@org.in", orgId: "org_a", role: "admin", isAdmin: true, partnerOrgIds: [] };
  const ctxOrgB: SecurityContext = { userId: "u_b", email: "b@org.in", orgId: "org_b", role: "admin", isAdmin: true, partnerOrgIds: ["proj_shared"] };

  beforeEach(() => {
    state = {
      projects: [
        { id: "proj_a", org_id: "org_a" },
        { id: "proj_shared", org_id: "org_a" },
      ],
      partnerOrgs: [{ project_id: "proj_shared", org_id: "org_b", status: "active" }],
      plans: [
        { id: "basic", monthly_inr: 599900, yearly_inr: 5999000 },
        { id: "pro", monthly_inr: 1199900, yearly_inr: 11999000 },
        { id: "business", monthly_inr: 1999900, yearly_inr: 19999000 },
      ],
      organizations: [{ id: "org_a", plan: "basic", billing_period: "monthly" }],
      planPayments: [
        {
          id: "pp_1",
          org_id: "org_a",
          plan: "pro",
          period: "annual",
          amount_paise: 14158800,
          link_id: "plink_123",
          status: "pending",
          paid_at: null,
        },
      ],
      subscriptions: [],
      billingHistory: [],
      auditLogs: [],
      invoices: [{ id: "inv_1", total_amount: 50000, created_by: "u_a", status: "unpaid" }],
      payments: [],
    };
    db = createAuditMockD1(state);
  });

  it("AUD-01: scopes R2 storage keys to org and blocks cross-tenant read/delete", async () => {
    const key = buildTenantStorageKey({ orgId: "org_a", projectId: "proj_a", folder: "../drawings", filename: "plan.pdf" });
    expect(key.startsWith("orgs/org_a/projects/proj_a/")).toBe(true);
    expect(key.includes("..")).toBe(false);

    await expect(assertStorageReadAccess(db, ctxOrgA, key)).resolves.toBeUndefined();
    await expect(assertStorageReadAccess(db, ctxOrgB, key)).rejects.toThrow(TenantSecurityError);
    await expect(assertStorageDeleteAccess(db, ctxOrgB, key)).rejects.toThrow(TenantSecurityError);

    const sharedKey = buildTenantStorageKey({ orgId: "org_a", projectId: "proj_shared", folder: "dpr", filename: "site.jpg" });
    await expect(assertStorageReadAccess(db, ctxOrgB, sharedKey)).resolves.toBeUndefined();
    await expect(assertStorageDeleteAccess(db, ctxOrgB, sharedKey)).rejects.toThrow(TenantSecurityError);
  });

  it("AUD-02: marketing PLAN_TIERS and Worker pricing match Migration 94 + 18% GST", async () => {
    const repo = new PaymentSettlementRepository(db);
    for (const tier of PLAN_TIERS) {
      const canonical = CANONICAL_PLAN_PRICES_PAISE[tier.id as "basic" | "pro" | "business"];
      expect(tier.monthly * 100).toBe(canonical.monthly);
      expect(tier.annual * 100).toBe(canonical.annual);

      const workerMonthly = await repo.resolvePlanAmountPaise(tier.id as "basic" | "pro" | "business", "monthly");
      const workerAnnual = await repo.resolvePlanAmountPaise(tier.id as "basic" | "pro" | "business", "annual");
      expect(workerMonthly).toBe(gstInclusive(tier.monthly) * 100);
      expect(workerAnnual).toBe(gstInclusive(tier.annual) * 100);
      expect(workerMonthly).toBe(computeGstInclusivePaise(canonical.monthly));
    }
  });

  it("AUD-03: Razorpay webhook settles plan_payments, activates org/subscription, and is idempotent", async () => {
    const repo = new PaymentSettlementRepository(db);
    const payload = {
      event: "payment_link.paid",
      payload: {
        payment_link: {
          entity: {
            id: "plink_123",
            notes: { sitetrack_plan_payment_id: "pp_1" },
          },
        },
        payment: { entity: { id: "pay_rzp_1", amount: 14158800 } },
      },
    };

    const first = await repo.settleWebhook(payload, "evt_1");
    expect(first).toEqual({ ok: true, status: "paid", plan: true });
    expect(state.planPayments[0].status).toBe("paid");
    expect(state.organizations[0].plan).toBe("pro");
    expect(state.organizations[0].billing_period).toBe("annual");
    expect(state.subscriptions).toHaveLength(1);
    expect(state.billingHistory).toHaveLength(1);
    expect(state.auditLogs).toHaveLength(1);

    const retry = await repo.settleWebhook(payload, "evt_1");
    expect(retry).toEqual({ ok: true, already_paid: true });
    expect(state.billingHistory).toHaveLength(1);
  });

  it("AUD-03: Razorpay webhook settles invoice payment and deduplicates retries", async () => {
    const repo = new PaymentSettlementRepository(db);
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_inv_1",
            amount: 5000000,
            notes: { sitetrack_invoice_id: "inv_1" },
          },
        },
      },
    };

    const first = await repo.settleWebhook(payload, "evt_inv_1");
    expect(first).toEqual({ ok: true, invoice_id: "inv_1", status: "paid" });
    expect(state.invoices[0].status).toBe("paid");
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].amount).toBe(50000);

    await repo.settleWebhook(payload, "evt_inv_1");
    expect(state.payments).toHaveLength(1);
  });
});
