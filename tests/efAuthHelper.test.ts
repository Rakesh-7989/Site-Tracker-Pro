// SiteTrack Pro — EF auth helper tests (Phase 0.5 hardening).
//
// The auth helper lives in supabase/functions/_shared/auth.ts and
// targets Deno. To unit-test it under vitest (Node), we shim:
//   - `Deno.env.get` via a global Deno object
//   - the supabase-js esm.sh import via a module mock
//
// Coverage:
//   - missing Bearer → 401
//   - invalid token (Supabase rejects) → 401
//   - profile missing → 403
//   - role gate passes when superadmin bypasses
//   - role gate passes when identity role matches
//   - role gate passes when org_members role matches
//   - role gate fails when neither matches
//   - project gate passes when org admin of the project's org
//   - project gate fails when not a project_member
//   - cron secret matches → ok
//   - cron secret mismatches → 401

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock the Supabase SDK BEFORE importing auth.ts ────────────────────────
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;

// Helper to build a fluent select-eq-maybeSingle chain that resolves to a value.
function fluent(returnValue: { data: any; error?: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => returnValue),
    then: undefined,
  };
  // Some callers await the chain directly (returns array via select).
  chain.then = (resolve: any) => resolve(returnValue);
  return chain;
}

vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    auth: { getUser: (...args: any[]) => (mockGetUser as any)(...args) },
    from: (table: string) => (mockFrom as any)(table),
  }),
}));

// Shim the Deno global so the helper can read env vars under vitest.
(globalThis as any).Deno = {
  env: {
    get(name: string): string | undefined {
      const map: Record<string, string> = {
        SUPABASE_URL: "https://fake.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
        CRON_SECRET: "test-cron-secret-xyz",
      };
      return map[name];
    },
  },
};

// Now dynamically import. The .ts is implicit (allowJs + bundler resolution).
const { authenticate, authenticateCron } = await import(
  "../supabase/functions/_shared/auth"
);

// ── Helpers ───────────────────────────────────────────────────────────────
function reqWithAuth(token: string | null): Request {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://ef/fake", { method: "POST", headers });
}

function setupHappyUser(opts: {
  role: string;
  isStaff?: boolean;
  staffTier?: "owner" | "head" | "member" | null;
  orgs?: Array<{ org_id: string; role: string }>;
} = { role: "architect" }) {
  mockGetUser = vi.fn(async () => ({
    data: { user: { id: "u-1", email: "test@example.com" } },
    error: null,
  }));
  mockFrom = vi.fn((table: string) => {
    if (table === "profiles") return fluent({
      data: { role: opts.role, is_staff: opts.isStaff ?? false, staff_tier: opts.staffTier ?? null },
    });
    if (table === "org_members") return fluent({ data: opts.orgs ?? [] });
    if (table === "projects") return fluent({ data: { id: "p-1", org_id: "o-1" } });
    if (table === "project_members") return fluent({ data: null });
    return fluent({ data: null });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────
describe("authenticate() — token handling", () => {
  beforeEach(() => { mockGetUser = vi.fn(); mockFrom = vi.fn(); });

  it("returns 401 when Bearer header missing", async () => {
    const res = await authenticate(reqWithAuth(null), {});
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(401);
  });

  it("returns 401 when Supabase rejects the token", async () => {
    mockGetUser = vi.fn(async () => ({ data: { user: null }, error: { message: "expired" } }));
    mockFrom = vi.fn(() => fluent({ data: null }));
    const res = await authenticate(reqWithAuth("bad-token"), {});
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(401);
  });

  it("returns 403 when profile row is missing", async () => {
    mockGetUser = vi.fn(async () => ({ data: { user: { id: "u-1", email: "t@e.in" } }, error: null }));
    mockFrom = vi.fn(() => fluent({ data: null }));
    const res = await authenticate(reqWithAuth("ok"), {});
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(403);
  });
});

describe("authenticate() — role gate", () => {
  beforeEach(() => { mockGetUser = vi.fn(); mockFrom = vi.fn(); });

  it("passes when identity role matches the required list", async () => {
    setupHappyUser({ role: "orgadmin" });
    const res = await authenticate(reqWithAuth("ok"), { requireRole: ["orgadmin", "admin"] });
    expect(res.ok).toBe(true);
  });

  it("passes when org_members role matches even if identity does not", async () => {
    setupHappyUser({ role: "architect", orgs: [{ org_id: "o-1", role: "admin" }] });
    const res = await authenticate(reqWithAuth("ok"), { requireRole: ["admin"] });
    expect(res.ok).toBe(true);
  });

  it("fails with 403 when no matching role", async () => {
    setupHappyUser({ role: "contractor", orgs: [{ org_id: "o-1", role: "contractor" }] });
    const res = await authenticate(reqWithAuth("ok"), { requireRole: ["orgadmin"] });
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(403);
  });

  it("superadmin bypasses any role gate", async () => {
    setupHappyUser({ role: "superadmin" });
    const res = await authenticate(reqWithAuth("ok"), { requireRole: ["does-not-exist"] });
    expect(res.ok).toBe(true);
  });

  it("platform staff owner can pass a superadmin gate even when legacy role data is stale", async () => {
    setupHappyUser({ role: "client", isStaff: true, staffTier: "owner" });
    const res = await authenticate(reqWithAuth("ok"), { requireRole: ["superadmin"] });
    expect(res.ok).toBe(true);
  });

  it("is_staff alone does not pass a superadmin gate without a staff tier", async () => {
    setupHappyUser({ role: "client", isStaff: true, staffTier: null });
    const res = await authenticate(reqWithAuth("ok"), { requireRole: ["superadmin"] });
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(403);
  });
});

describe("authenticate() — project gate", () => {
  beforeEach(() => { mockGetUser = vi.fn(); mockFrom = vi.fn(); });

  it("passes for orgadmin of the project's org without requiring a project_members row", async () => {
    setupHappyUser({ role: "architect", orgs: [{ org_id: "o-1", role: "admin" }] });
    const res = await authenticate(reqWithAuth("ok"), { requireProjectId: "p-1" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.projectMembership?.role).toBe("admin");
  });

  it("fails with 403 when not in project_members and not org admin", async () => {
    mockGetUser = vi.fn(async () => ({ data: { user: { id: "u-1", email: "t@e.in" } }, error: null }));
    mockFrom = vi.fn((table: string) => {
      if (table === "profiles") return fluent({ data: { role: "architect", is_staff: false } });
      if (table === "org_members") return fluent({ data: [{ org_id: "o-1", role: "architect" }] });
      if (table === "projects") return fluent({ data: { id: "p-1", org_id: "o-1" } });
      if (table === "project_members") return fluent({ data: null });
      return fluent({ data: null });
    });
    const res = await authenticate(reqWithAuth("ok"), { requireProjectId: "p-1" });
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(403);
  });

  it("superadmin bypasses project_members check", async () => {
    setupHappyUser({ role: "superadmin" });
    const res = await authenticate(reqWithAuth("ok"), { requireProjectId: "p-any" });
    expect(res.ok).toBe(true);
  });
});

describe("authenticateCron()", () => {
  it("passes when Bearer matches env value", () => {
    const req = reqWithAuth("test-cron-secret-xyz");
    const res = authenticateCron(req, "CRON_SECRET");
    expect(res.ok).toBe(true);
  });

  it("fails 401 when Bearer mismatches", () => {
    const req = reqWithAuth("wrong");
    const res = authenticateCron(req, "CRON_SECRET");
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(401);
  });

  it("fails 401 when Bearer missing", () => {
    const req = reqWithAuth(null);
    const res = authenticateCron(req, "CRON_SECRET");
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(401);
  });

  it("fails 500 when env var not configured", () => {
    const req = reqWithAuth("anything");
    const res = authenticateCron(req, "NOT_CONFIGURED_VAR");
    expect(res.ok).toBe(false);
    expect((res as any).response.status).toBe(500);
  });
});
