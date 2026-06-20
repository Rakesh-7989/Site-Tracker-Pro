// SiteTrack Pro — Edge Function auth-wiring parity (Phase 5).
//
// Locks in the EF security hardening from Phases 0.5 + 5. Each EF that
// touches data or sends messages MUST authenticate the caller. This test
// reads the EF source files and asserts the auth import + gate call are
// present — so a future edit can't silently regress an EF to
// unauthenticated without a red test.
//
// Pure file parsing; no Deno runtime needed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const efDir = join(process.cwd(), "supabase", "functions");
const src = (name: string) => readFileSync(join(efDir, name, "index.ts"), "utf8");

// EFs that must call authenticate() (JWT + role/project gate).
const JWT_GATED = [
  "gstn-einvoice",
  "tg-rera-submit",
  "ka-rera-submit",
  "mh-rera-submit",
  "voice_transcribe",
  "buildnow_anchor",
  "whatsapp_dpr_send",
  "whatsapp-send",
];

// EFs that must call authenticateCron() (static cron secret).
const CRON_GATED = [
  "promoter_digest_cron",
];

// EFs gated by their own internal-token check (service-to-service / triggers).
const INTERNAL_TOKEN_GATED = [
  "notify-deliver",
];

describe("EF auth wiring — JWT-gated", () => {
  for (const ef of JWT_GATED) {
    it(`${ef} imports + calls authenticate()`, () => {
      const code = src(ef);
      expect(code, `${ef} should import from _shared/auth`).toMatch(/from\s+["']\.\.\/_shared\/auth\.ts["']/);
      expect(code, `${ef} should call authenticate(`).toMatch(/authenticate\s*\(/);
    });
  }
});

describe("EF auth wiring — cron-gated", () => {
  for (const ef of CRON_GATED) {
    it(`${ef} imports + calls authenticateCron()`, () => {
      const code = src(ef);
      expect(code).toMatch(/authenticateCron/);
    });
  }
});

describe("EF auth wiring — internal-token-gated (fail-closed)", () => {
  for (const ef of INTERNAL_TOKEN_GATED) {
    it(`${ef} rejects when the internal token is not configured (fail-closed)`, () => {
      const code = src(ef);
      // Must have a branch that returns 500/401 when the expected token is
      // missing — NOT the old fail-open `expected && internal !== expected`.
      expect(code).toMatch(/if\s*\(\s*!expected\s*\)/);
    });
  }
});

describe("cashfree-subscription retains its orgadmin gate", () => {
  it("verifies the caller is orgadmin/superadmin of the target org", () => {
    const code = src("cashfree-subscription");
    expect(code).toMatch(/getUser\(/);
    expect(code).toMatch(/org_members/);
    expect(code).toMatch(/superadmin|orgadmin/);
  });
});

describe("review_signup_request repairs applicant profiles before membership", () => {
  it("ensures old auth users without profiles can still be approved", () => {
    const code = src("review_signup_request");
    expect(code).toMatch(/ensureApplicantProfile/);
    expect(code).toMatch(/profile-repair-failed/);
    expect(code.indexOf("ensureApplicantProfile")).toBeLessThan(code.indexOf(".from(\"org_members\")"));
  });
});
