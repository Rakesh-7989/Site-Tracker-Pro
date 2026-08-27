// SiteTrack Pro -- legacy signUp() guard tests.
//
// Customer org creation now goes through /signup -> signup_requests ->
// owner/payment approval. The old password self-signup helper must not create
// auth users or trigger self-serve org provisioning.

import { describe, it, expect, vi, beforeEach } from "vitest";

let mockSignUp;

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signUp: (...args) => mockSignUp(...args),
    },
  }),
}));

import.meta.env.VITE_BACKEND = "supabase";
import.meta.env.VITE_SUPABASE_URL = "https://fake.supabase.co";
import.meta.env.VITE_SUPABASE_ANON_KEY = "fake-anon-key";
delete import.meta.env.VITE_ALLOW_SELF_SERVE_SIGNUP;

const { signUp } = await import("../src/lib/supabase/supabase");

const baseArgs = {
  email: "test@example.com",
  password: "long-enough-pwd",
  firmName: "Test Firm",
  userName: "Tester",
  plan: "pro",
};

describe("signUp() -- disabled legacy self-service path", () => {
  beforeEach(() => {
    mockSignUp = vi.fn(async () => ({ data: null, error: null }));
  });

  it("blocks password self-signup before Supabase Auth is called", async () => {
    const res = await signUp(baseArgs);

    expect(res).toEqual({
      ok: false,
      error: "signups not allowed",
      detail: "New workspaces require request access and owner/payment approval.",
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("does not allow custom-plan self-signup either", async () => {
    const res = await signUp({ ...baseArgs, plan: "custom" });

    expect(res.ok).toBe(false);
    expect(res.error).toBe("signups not allowed");
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});
