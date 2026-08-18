// SiteTrack Pro — SEC-05 fail-closed PlanGate / QuotaGate / useFeatureWithQuota.
//
// The UI plan/quota gates must NOT grant while their inputs are unknown:
//   • PlanGate: loading → neutral placeholder (never children, never upsell).
//   • QuotaGate: loading → placeholder; fetch-error → "couldn't verify" card.
//   • useFeatureWithQuota: `available` false on no-org / no-client / error.
//
// usePlanCaps + useOrgSwitcher + quota fetch are mocked so the decision logic
// (not the data plumbing) is what's under test.

import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { usePlanCaps } from "@/auth/usePlanCaps";
import { useOrgSwitcher } from "@/auth/useOrgSwitcher";
import { fetchOrgQuota } from "@/app/quotaQueries";

vi.mock("@/auth/usePlanCaps", () => ({
  usePlanCaps: vi.fn(),
  useCanByPlan: vi.fn(),
}));
vi.mock("@/auth/useOrgSwitcher", () => ({
  useOrgSwitcher: vi.fn(),
}));
vi.mock("@/app/quotaQueries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/quotaQueries")>();
  return { ...actual, fetchOrgQuota: vi.fn() };
});
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(async () => ({})),
}));

const mockPlanCaps = vi.mocked(usePlanCaps);
const mockOrgSwitcher = vi.mocked(useOrgSwitcher);
const mockFetchOrgQuota = vi.mocked(fetchOrgQuota);

function planCapsState(over: Partial<ReturnType<typeof usePlanCaps>> = {}): ReturnType<typeof usePlanCaps> {
  return {
    caps: null,
    plan: "pro",
    loading: false,
    can: vi.fn(() => true),
    refresh: vi.fn(async () => {}),
    ...over,
  } as ReturnType<typeof usePlanCaps>;
}

function orgState(orgId: string | null): ReturnType<typeof useOrgSwitcher> {
  return {
    orgs: [],
    activeOrg: orgId
      ? { orgId, orgName: "X", orgSlug: "x", segment: null, isAdmin: true, joinedAt: "2026-01-01", status: "active" as const }
      : null,
    switchOrg: vi.fn(),
  } as unknown as ReturnType<typeof useOrgSwitcher>;
}

describe("PlanGate (SEC-05 fail-closed)", () => {
  async function importGates() {
    const { PlanGate } = await import("@/auth/PlanGate");
    return { PlanGate };
  }

  it("renders a neutral placeholder while plan caps load — NOT children, NOT the upsell card", async () => {
    const { PlanGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: true }));
    render(
      <MemoryRouter>
        <PlanGate feature="crm"><div>secret-feature-content</div></PlanGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/secret-feature-content/)).toBeNull();
    expect(screen.queryByText(/View plans & upgrade/)).toBeNull();
    expect(screen.getByText(/Checking Sales pipeline \(CRM & leads\) on your plan/)).toBeTruthy();
    cleanup();
  });

  it("renders children only when the plan caps are positively known AND the feature is allowed", async () => {
    const { PlanGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: false, can: vi.fn(() => true) }));
    render(
      <MemoryRouter>
        <PlanGate feature="crm"><div>secret-feature-content</div></PlanGate>
      </MemoryRouter>,
    );
    expect(screen.getByText(/secret-feature-content/)).toBeTruthy();
    expect(screen.queryByText(/View plans & upgrade/)).toBeNull();
    cleanup();
  });

  it("renders the upgrade card when the feature is denied", async () => {
    const { PlanGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: false, can: vi.fn(() => false) }));
    render(
      <MemoryRouter>
        <PlanGate feature="crm"><div>secret-feature-content</div></PlanGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/secret-feature-content/)).toBeNull();
    expect(screen.getByText(/View plans & upgrade/)).toBeTruthy();
    cleanup();
  });

  it("renders the explicit fallback instead of the upgrade card when provided", async () => {
    const { PlanGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: false, can: vi.fn(() => false) }));
    render(
      <MemoryRouter>
        <PlanGate feature="crm" fallback={<div>custom-denied</div>}><div>secret-feature-content</div></PlanGate>
      </MemoryRouter>,
    );
    expect(screen.getByText(/custom-denied/)).toBeTruthy();
    expect(screen.queryByText(/View plans & upgrade/)).toBeNull();
    cleanup();
  });
});

describe("QuotaGate (SEC-05 fail-closed)", () => {
  async function importGates() {
    const { QuotaGate } = await import("@/auth/QuotaGate");
    return { QuotaGate };
  }

  it("renders a neutral placeholder while caps load", async () => {
    const { QuotaGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: true }));
    mockOrgSwitcher.mockReturnValue(orgState("o-1"));
    render(
      <MemoryRouter>
        <QuotaGate resource="users"><div>secret-quota-content</div></QuotaGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/secret-quota-content/)).toBeNull();
    expect(screen.getByText(/Checking usage limits/)).toBeTruthy();
    cleanup();
  });

  it("shows the 'couldn't verify' card (deny) when the quota fetch fails", async () => {
    const { QuotaGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: false }));
    mockOrgSwitcher.mockReturnValue(orgState("o-1"));
    mockFetchOrgQuota.mockResolvedValue({ ok: false, error: "boom" });
    render(
      <MemoryRouter>
        <QuotaGate resource="users"><div>secret-quota-content</div></QuotaGate>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Couldn’t verify usage limits/)).toBeTruthy();
    expect(screen.queryByText(/secret-quota-content/)).toBeNull();
    cleanup();
  });

  it("renders children when usage is under the limit", async () => {
    const { QuotaGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: false }));
    mockOrgSwitcher.mockReturnValue(orgState("o-1"));
    mockFetchOrgQuota.mockResolvedValue({ ok: true, data: [{ resource: "users", currentCount: 2, maxAllowed: 5, atQuota: false }] });
    render(
      <MemoryRouter>
        <QuotaGate resource="users"><div>secret-quota-content</div></QuotaGate>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/secret-quota-content/)).toBeTruthy();
    cleanup();
  });

  it("renders the upgrade card when at quota", async () => {
    const { QuotaGate } = await importGates();
    mockPlanCaps.mockReturnValue(planCapsState({ loading: false, plan: "pro" }));
    mockOrgSwitcher.mockReturnValue(orgState("o-1"));
    mockFetchOrgQuota.mockResolvedValue({ ok: true, data: [{ resource: "users", currentCount: 5, maxAllowed: 5, atQuota: true }] });
    render(
      <MemoryRouter>
        <QuotaGate resource="users"><div>secret-quota-content</div></QuotaGate>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Seats limit reached/)).toBeTruthy();
    expect(screen.queryByText(/secret-quota-content/)).toBeNull();
    cleanup();
  });
});

describe("useFeatureWithQuota (SEC-05 fail-closed defaults)", () => {
  async function importHook() {
    const { useFeatureWithQuota } = await import("@/auth/useFeatureWithQuota");
    return { useFeatureWithQuota };
  }

  it("starts fail-closed and stays fail-closed with no active org", async () => {
    const { useFeatureWithQuota } = await importHook();
    mockOrgSwitcher.mockReturnValue(orgState(null));
    const { result } = renderHook(() => useFeatureWithQuota("crm", "users"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.planCap).toBe(false);
    expect(result.current.atQuota).toBe(false);
    cleanup();
  });

  it("stays fail-closed when the supabase client is unavailable", async () => {
    const { useFeatureWithQuota } = await importHook();
    const supabaseMock = await import("@/lib/supabase");
    vi.mocked(supabaseMock.getSupabaseClient).mockResolvedValue(null as never);
    mockOrgSwitcher.mockReturnValue(orgState("o-1"));
    const { result } = renderHook(() => useFeatureWithQuota("crm", "users"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.planCap).toBe(false);
    cleanup();
  });
});