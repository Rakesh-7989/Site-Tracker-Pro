// SiteTrack Pro — planCheck.ts fail-closed enforcement (SEC-05).
//
// planCheck.ts is the server-side plan gate shared by the EFs. It mixes Deno
// (Deno.env, fetch) with the pure `capsAllow` decision — so this file:
//   1. imports capsAllow directly (pure, unit-tested in vitest), and
//   2. source-contract-checks requirePlanFeature so a future edit can't
//      silently flip any deny path back to an allow.
//
// The 4 EF consumers (cashfree-subscription, gstn-einvoice, whatsapp-send,
// whatsapp_dpr_send) are also source-contract-checked for the 402 handling.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { capsAllow } from "../supabase/functions/_shared/planCheck";

const src = readFileSync(join(process.cwd(), "supabase", "functions", "_shared", "planCheck.ts"), "utf8");

const EF_FILES = [
  ["cashfree-subscription", "cashfree-subscription/index.ts"],
  ["gstn-einvoice", "gstn-einvoice/index.ts"],
  ["whatsapp-send", "whatsapp-send/index.ts"],
  ["whatsapp_dpr_send", "whatsapp_dpr_send/index.ts"],
] as const;

describe("capsAllow (pure decision)", () => {
  it("denies when caps are missing / null / undefined", () => {
    expect(capsAllow(null, "crm")).toBe(false);
    expect(capsAllow(undefined, "crm")).toBe(false);
    expect(capsAllow({}, "crm")).toBe(false);
  });

  it("denies when the feature is absent or not exactly true", () => {
    expect(capsAllow({ crm: false }, "crm")).toBe(false);
    expect(capsAllow({ other: true }, "crm")).toBe(false);
  });

  it("allows only when the feature key is exactly true", () => {
    expect(capsAllow({ crm: true }, "crm")).toBe(true);
    expect(capsAllow({ crm: true, x: true }, "crm")).toBe(true);
  });
});

describe("planCheck.ts — SEC-05 fail-closed source contract", () => {
  it("declares the fail-closed posture in the header comment", () => {
    expect(src).toMatch(/fail closed|Fail-CLOSED|deny-by-default/);
    expect(src).toMatch(/SEC-05/);
  });

  it("exports requirePlanFeature + capsAllow", () => {
    expect(src).toMatch(/export async function requirePlanFeature/);
    expect(src).toMatch(/export function capsAllow/);
  });

  it("NEVER returns a bare allow — every missing/infra path is a deny", () => {
    // After SEC-05 there must be no `return { allow: true ...}` anywhere:
    // missing org/env, HTTP error, missing plan row, missing caps row, and the
    // catch block must all deny.
    expect(src).not.toMatch(/return \{ allow: true/);
    // Sanity: the deny paths DO exist.
    expect(src).toMatch(/return \{ allow: false \}; \/\/ can't verify → deny/);
    expect(src).toMatch(/return \{ allow: false \}; \/\/ any unexpected error → deny/);
    expect(src).toMatch(/return \{ allow: false, plan \};/);
  });

  it("short-circuits to deny before any network call when env is missing", () => {
    expect(src).toMatch(/if \(!orgId \|\| !url \|\| !key\) return \{ allow: false \}/);
  });
});

describe("EF consumers — 402 on !allow (SEC-05)", () => {
  for (const [name, file] of EF_FILES) {
    it(`${name} calls requirePlanFeature and 402s when the verdict denies`, () => {
      const ef = readFileSync(join(process.cwd(), "supabase", "functions", file), "utf8");
      expect(ef).toMatch(/requirePlanFeature\(/);
      expect(ef).toMatch(/planChk\.allow/);
      expect(ef).toMatch(/402/);
      expect(ef).toMatch(/plan-upgrade-required/);
    });
  }
});