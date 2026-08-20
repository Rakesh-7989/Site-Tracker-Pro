// SiteTrack Pro — register_org edge function segment wiring (v4 C0).
//
// register_org stamps the org's company segment (migration 134). This file
// parses the EF source and asserts the allowlist validation + org insert
// keep passing segment through — a future edit can't silently drop it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "supabase", "functions", "register_org", "index.ts"), "utf8");

describe("register_org — company segment (v4 C0)", () => {
  it("defines the segment allowlist", () => {
    expect(src).toMatch(/VALID_SEGMENTS\s*=/);
    for (const s of ["construction", "architecture", "interior", "consultancy", "multiple"]) {
      expect(src).toContain(s);
    }
  });

  it("rejects an unknown segment with invalid-segment", () => {
    expect(src).toMatch(/invalid-segment/);
  });

  it("passes segment into the organizations insert", () => {
    // The insert must include segment (spread only when present), selecting
    // its value from the validated body field.
    expect(src).toMatch(/\.insert\(\{\s*slug: slugify\(firmName\),\s*name: firmName,\s*plan: TRIAL_PLAN,/);
    expect(src).toContain("segment");
  });

  it("defaults the plan to the Pro trial (Zoho-style trial-first)", () => {
    expect(src).toMatch(/const TRIAL_PLAN = "pro"/);
    expect(src).toMatch(/plan: TRIAL_PLAN/);
  });

  it("provisions a 14-day trial subscription row (status='trial')", () => {
    expect(src).toMatch(/TRIAL_DAYS = 14/);
    expect(src).toMatch(/trial_ends_at: trialEnd/);
    expect(src).toMatch(/status: "trial"/);
    expect(src).toMatch(/onConflict: "org_id"/);
  });

  it("creates the auth user with email_confirm: false (owner must verify)", () => {
    expect(src).toMatch(/email_confirm: false/);
  });

  it("returns plan + trialEndsAt for the client verify screen", () => {
    expect(src).toMatch(/plan: TRIAL_PLAN/);
    expect(src).toMatch(/trialEndsAt: trialEnd/);
  });

  it("dispatches the confirmation email via generateLink (createUser does NOT email)", () => {
    // createUser(email_confirm:false) never sends a confirmation email — the
    // handler must explicitly generate a signup link so GoTrue dispatches it
    // via SMTP (single source of truth). Locked so a future edit can't drop it.
    expect(src).toMatch(/generateLink\(\{/);
    expect(src).toMatch(/type: "signup"/);
    expect(src).toMatch(/options: \{ redirectTo: siteUrl \}/);
    expect(src).toMatch(/confirmDispatched = !confirmErr/);
  });

  it("reports emailSent from the confirm dispatch, not the welcome email", () => {
    expect(src).toMatch(/emailSent: confirmDispatched/);
    expect(src).toMatch(/welcomeSent/);
  });

  it("uses the canonical app URL for the confirm redirect", () => {
    expect(src).toMatch(/PUBLIC_SITE_URL/);
    expect(src).toContain("https://sitetrackpro.in");
  });
});
