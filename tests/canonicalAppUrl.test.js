// SiteTrack Pro — getCanonicalAppUrl() tests.
//
// Verifies the redirect URL helper picks the right URL across dev / prod /
// missing-env / stale-placeholder scenarios. This is the source of truth
// for all Supabase Auth redirectTo values.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the supabase client so the lib loads without a real client.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: {} }),
}));

import.meta.env.VITE_BACKEND = "supabase";
import.meta.env.VITE_SUPABASE_URL = "https://fake.supabase.co";
import.meta.env.VITE_SUPABASE_ANON_KEY = "fake-anon-key";

const { getCanonicalAppUrl } = await import("../src/lib/supabase");

describe("getCanonicalAppUrl()", () => {
  const originalEnv = { ...import.meta.env };
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Reset env each test
    delete import.meta.env.VITE_APP_URL;
    // Set up window stub
    globalThis.window = { location: { origin: "http://localhost:5173" } };
  });

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv);
    globalThis.window = originalWindow;
  });

  it("uses VITE_APP_URL when set to a real URL", () => {
    import.meta.env.VITE_APP_URL = "https://sitetrackpro.in";
    expect(getCanonicalAppUrl()).toBe("https://sitetrackpro.in");
  });

  it("strips trailing slash from VITE_APP_URL", () => {
    import.meta.env.VITE_APP_URL = "https://sitetrackpro.in/";
    expect(getCanonicalAppUrl()).toBe("https://sitetrackpro.in");
  });

  it("rejects the stale placeholder app.sitetrack.in", () => {
    // Legacy placeholder we never served — pasting it into Supabase would NXDOMAIN.
    import.meta.env.VITE_APP_URL = "https://app.sitetrack.in";
    // Falls back to window.location.origin
    expect(getCanonicalAppUrl()).toBe("http://localhost:5173");
  });

  it("rejects Vercel preview origins for auth email redirects", () => {
    globalThis.window = { location: { origin: "https://sitetrack-rakesh-git-feature-rakesh15.vercel.app" } };
    expect(getCanonicalAppUrl()).toBe("https://sitetrackpro.in");
  });

  it("falls back to window.location.origin when VITE_APP_URL missing", () => {
    globalThis.window = { location: { origin: "https://sitetrackpro.in" } };
    expect(getCanonicalAppUrl()).toBe("https://sitetrackpro.in");
  });

  it("works in dev (localhost) via window fallback", () => {
    expect(getCanonicalAppUrl()).toBe("http://localhost:5173");
  });

  it("hardcoded prod fallback when window AND env both missing (SSR/tests)", () => {
    globalThis.window = undefined;
    expect(getCanonicalAppUrl()).toBe("https://sitetrackpro.in");
  });

  it("strips trailing slash from window.location.origin too", () => {
    globalThis.window = { location: { origin: "https://app.example.com/" } };
    expect(getCanonicalAppUrl()).toBe("https://app.example.com");
  });
});
