// SiteTrack Pro — planCapsQueries tests (v2 trial-end read-side check, §5.5a).

import { describe, it, expect } from "vitest";
import { getPlanCaps, resolveEffectivePlan, isTrialActive, type SubscriptionBrief } from "@/app/planCapsQueries";

type MockResult = { data: unknown; error: unknown | null };
type Handler = () => MockResult;

function mockClient(handlers: Record<string, Handler>) {
  const calls: Array<{ table: string; method: string }> = [];
  const chain = (table: string, result: () => MockResult): Record<string, unknown> => ({
    select() { calls.push({ table, method: "select" }); return chain(table, result); },
    eq() { calls.push({ table, method: "eq" }); return chain(table, result); },
    async maybeSingle() { calls.push({ table, method: "maybeSingle" }); return result(); },
    async single() { calls.push({ table, method: "single" }); return result(); },
  });
  return {
    calls,
    from(table: string) {
      const result = handlers[table] ?? (() => ({ data: [], error: null }));
      return chain(table, result);
    },
  };
}

const now = new Date("2026-08-16T12:00:00Z");
const future = "2026-08-30T12:00:00Z";
const past = "2026-08-01T12:00:00Z";

describe("resolveEffectivePlan", () => {
  it("active trial → pro regardless of organizations.plan", () => {
    expect(resolveEffectivePlan("basic", { status: "trial", trial_ends_at: future }, now)).toBe("pro");
    expect(resolveEffectivePlan("pro", { status: "trial", trial_ends_at: future }, now)).toBe("pro");
  });

  it("expired trial → falls back to organizations.plan", () => {
    expect(resolveEffectivePlan("pro", { status: "trial", trial_ends_at: past }, now)).toBe("pro");
    expect(resolveEffectivePlan("basic", { status: "trial", trial_ends_at: past }, now)).toBe("basic");
  });

  it("non-trial statuses → organizations.plan", () => {
    for (const status of ["active", "pending", "past_due", "cancelled", "paused"]) {
      expect(resolveEffectivePlan("business", { status, trial_ends_at: future }, now)).toBe("business");
    }
  });

  it("null row / missing trial_ends_at / invalid date → organizations.plan", () => {
    expect(resolveEffectivePlan("basic", null, now)).toBe("basic");
    expect(resolveEffectivePlan("basic", { status: "trial", trial_ends_at: null }, now)).toBe("basic");
    expect(resolveEffectivePlan("basic", { status: "trial", trial_ends_at: "garbage" }, now)).toBe("basic");
  });
});

describe("isTrialActive", () => {
  it("true only for a non-expired trial row", () => {
    const active: SubscriptionBrief = { status: "trial", trial_ends_at: future };
    const expired: SubscriptionBrief = { status: "trial", trial_ends_at: past };
    expect(isTrialActive(active, now)).toBe(true);
    expect(isTrialActive(expired, now)).toBe(false);
    expect(isTrialActive({ status: "active", trial_ends_at: future }, now)).toBe(false);
    expect(isTrialActive(null, now)).toBe(false);
  });
});

describe("getPlanCaps", () => {
  it("active trial → effective pro + trialActive true + trialEndsAt", async () => {
    const c = mockClient({
      organizations: () => ({ data: { plan: "pro" }, error: null }),
      subscriptions: () => ({ data: { status: "trial", trial_ends_at: future }, error: null }),
      plans: () => ({ data: { feature_caps: { finance: true } }, error: null }),
    });
    const res = await getPlanCaps(c as never, "o-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.plan).toBe("pro");
      expect(res.data.caps).toEqual({ finance: true });
      expect(res.data.trialActive).toBe(true);
      expect(res.data.trialEndsAt).toBe(future);
    }
  });

  it("expired trial → effective organizations.plan, trialActive false", async () => {
    const c = mockClient({
      organizations: () => ({ data: { plan: "basic" }, error: null }),
      subscriptions: () => ({ data: { status: "trial", trial_ends_at: past }, error: null }),
      plans: () => ({ data: { feature_caps: { finance: false } }, error: null }),
    });
    const res = await getPlanCaps(c as never, "o-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.plan).toBe("basic");
      expect(res.data.trialActive).toBe(false);
      expect(res.data.trialEndsAt).toBeNull();
    }
  });

  it("non-admin member (subscriptions read RLS-denied → null data) falls back to organizations.plan", async () => {
    const c = mockClient({
      organizations: () => ({ data: { plan: "pro" }, error: null }),
      subscriptions: () => ({ data: null, error: null }),
      plans: () => ({ data: { feature_caps: { finance: true } }, error: null }),
    });
    const res = await getPlanCaps(c as never, "o-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.plan).toBe("pro");
      expect(res.data.trialActive).toBe(false);
      expect(res.data.trialEndsAt).toBeNull();
    }
  });

  it("subscriptions read error → still resolves from organizations.plan", async () => {
    const c = mockClient({
      organizations: () => ({ data: { plan: "pro" }, error: null }),
      subscriptions: () => ({ data: null, error: { message: "RLS denied" } }),
      plans: () => ({ data: { feature_caps: { finance: true } }, error: null }),
    });
    const res = await getPlanCaps(c as never, "o-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.plan).toBe("pro");
      expect(res.data.trialActive).toBe(false);
    }
  });

  it("organizations read error → ok:false", async () => {
    const c = mockClient({ organizations: () => ({ data: null, error: { message: "boom" } }) });
    const res = await getPlanCaps(c as never, "o-1");
    expect(res.ok).toBe(false);
  });

  it("plans read error → ok:false", async () => {
    const c = mockClient({
      organizations: () => ({ data: { plan: "pro" }, error: null }),
      subscriptions: () => ({ data: null, error: null }),
      plans: () => ({ data: null, error: { message: "boom" } }),
    });
    const res = await getPlanCaps(c as never, "o-1");
    expect(res.ok).toBe(false);
  });
});