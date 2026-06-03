// SiteTrack Pro — signUp() edge-case tests.
//
// Verifies the two new defensive branches we added to defend the UX
// against Supabase's "fake success" + "generic 500" patterns.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client BEFORE importing the lib so the mock is
// picked up. supabase.js uses dynamic import + a getSupabaseClient
// promise — we mock the underlying createClient.

let mockSignUpResult;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signUp: vi.fn(async () => mockSignUpResult),
    },
  }),
}));

// Set the env flags supabase.js checks before client construction.
import.meta.env.VITE_BACKEND = "supabase";
import.meta.env.VITE_SUPABASE_URL = "https://fake.supabase.co";
import.meta.env.VITE_SUPABASE_ANON_KEY = "fake-anon-key";

const { signUp } = await import("../src/lib/supabase.js");

const baseArgs = {
  email: "test@example.com",
  password: "long-enough-pwd",
  firmName: "Test Firm",
  userName: "Tester",
  plan: "free",
};

describe("signUp() — happy path", () => {
  beforeEach(() => { mockSignUpResult = undefined; });

  it("returns ok=true + needsConfirmation when Supabase returns a fresh user", async () => {
    mockSignUpResult = {
      data: {
        user: {
          id: "user-1",
          email: "test@example.com",
          identities: [{ provider: "email" }],   // fresh user has identities
        },
        session: null,
      },
      error: null,
    };
    const res = await signUp(baseArgs);
    expect(res.ok).toBe(true);
    expect(res.needsConfirmation).toBe(true);
    expect(res.user.id).toBe("user-1");
  });

  it("returns ok=true + needsConfirmation=false when session is returned", async () => {
    mockSignUpResult = {
      data: {
        user: { id: "user-2", identities: [{ provider: "email" }] },
        session: { access_token: "fake" },
      },
      error: null,
    };
    const res = await signUp(baseArgs);
    expect(res.ok).toBe(true);
    expect(res.needsConfirmation).toBe(false);
  });
});

describe("signUp() — enumeration-protection (email already exists)", () => {
  beforeEach(() => { mockSignUpResult = undefined; });

  it("detects empty identities array and routes to sign-in", async () => {
    // This is how Supabase signals "this email is already registered"
    // when enumeration-protection is on. Returns 200 OK + fake user.
    mockSignUpResult = {
      data: {
        user: {
          id: "fake-id",
          email: "test@example.com",
          identities: [],                       // ← the tell
        },
        session: null,
      },
      error: null,
    };
    const res = await signUp(baseArgs);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("email-already-registered");
    expect(res.detail).toMatch(/already exists/i);
    expect(res.detail).toMatch(/sign in/i);
  });

  it("does NOT trigger on missing identities field (treat as fresh user)", async () => {
    // Defensive — only treat the EXPLICIT empty array as duplicate.
    // A missing field could be a Supabase client version skew.
    mockSignUpResult = {
      data: {
        user: { id: "user-3" /* no identities field */ },
        session: null,
      },
      error: null,
    };
    const res = await signUp(baseArgs);
    expect(res.ok).toBe(true);
  });
});

describe("signUp() — rate-limit / generic 500 mask", () => {
  beforeEach(() => { mockSignUpResult = undefined; });

  it("translates 'Database error saving new user' to actionable rate-limit error", async () => {
    mockSignUpResult = {
      data: null,
      error: { message: "Database error saving new user" },
    };
    const res = await signUp(baseArgs);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("signup-rate-limited");
    expect(res.detail).toMatch(/rate limit/i);
    expect(res.detail).toMatch(/Resend/i);
  });

  it("passes through other errors unchanged", async () => {
    mockSignUpResult = {
      data: null,
      error: { message: "password is too weak" },
    };
    const res = await signUp(baseArgs);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("password is too weak");
  });
});

describe("signUp() — plan guard", () => {
  it("rejects plan='custom' before hitting Supabase", async () => {
    const res = await signUp({ ...baseArgs, plan: "custom" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sales contact/i);
  });
});
