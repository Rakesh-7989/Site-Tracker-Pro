// SiteTrack Pro — resend_confirmation edge function wiring (email-confirm flow).
//
// resend_confirmation regenerates a fresh signup-confirmation link. supabase-js
// v2.108.2 generateLink takes a SINGLE params object ({ type, email, options })
// — the old positional (type, email) form sends no `email` in the body, which
// GoTrue rejects with "An email address is required" (live 502). This file
// parses the EF source and asserts the object form + explicit redirectTo so a
// future edit can't reintroduce the broken positional call.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "supabase", "functions", "resend_confirmation", "index.ts"), "utf8")
  .replace(/\r\n/g, "\n");

describe("resend_confirmation — email-confirm dispatch", () => {
  it("calls generateLink with the object form (never positional)", () => {
    expect(src).toMatch(/generateLink\(\{\n\s+type: "signup",/);
    expect(src).not.toMatch(/generateLink\("signup",\s*email\)/);
  });

  it("passes email + canonical redirectTo to GoTrue", () => {
    expect(src).toMatch(/email,/);
    expect(src).toMatch(/options: \{ redirectTo: siteUrl \}/);
    expect(src).toMatch(/PUBLIC_SITE_URL/);
    expect(src).toContain("https://sitetrack-rakesh.vercel.app");
  });

  it("treats the GoTrue dispatch as the single send (no duplicate Resend)", () => {
    expect(src).not.toMatch(/api\.resend\.com\/emails/);
    expect(src).toMatch(/emailSent: true/);
  });
});
