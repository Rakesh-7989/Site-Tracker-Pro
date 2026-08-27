// SiteTrack Pro — zero-spend budget guard tests.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUDGET_MODES,
  DEFAULT_BUDGET_MODE,
  PAID_PROVIDERS,
  CAPPED_FREE_PROVIDERS,
  ALWAYS_FREE_PROVIDERS,
  getBudgetMode,
  classifyProvider,
  isProviderAllowed,
  filterAllowedProviders,
  blockedResponse,
} from "../src/lib/utils/budgetMode";

describe("BUDGET_MODES + DEFAULT_BUDGET_MODE", () => {
  it("exposes both modes", () => {
    expect(BUDGET_MODES).toEqual(["zero-spend", "paid"]);
  });
  it("defaults to the strictest mode", () => {
    expect(DEFAULT_BUDGET_MODE).toBe("zero-spend");
  });
});

describe("PAID_PROVIDERS catalog", () => {
  it("includes the known paid third-parties we have wired", () => {
    expect(PAID_PROVIDERS.has("aws")).toBe(true);
    expect(PAID_PROVIDERS.has("polygon-mainnet")).toBe(true);
    expect(PAID_PROVIDERS.has("openai")).toBe(true);
    expect(PAID_PROVIDERS.has("anthropic-api")).toBe(true);
    expect(PAID_PROVIDERS.has("twilio")).toBe(true);
  });
  it("does NOT include the free alternatives we picked", () => {
    expect(PAID_PROVIDERS.has("bhashini")).toBe(false);
    expect(PAID_PROVIDERS.has("telegram")).toBe(false);
    expect(PAID_PROVIDERS.has("polygon-amoy")).toBe(false);
    expect(PAID_PROVIDERS.has("resend")).toBe(false);
  });
});

describe("CAPPED_FREE_PROVIDERS catalog", () => {
  it("includes the known capped-tier services", () => {
    expect(CAPPED_FREE_PROVIDERS.has("whatsapp-meta")).toBe(true);
    expect(CAPPED_FREE_PROVIDERS.has("resend")).toBe(true);
    expect(CAPPED_FREE_PROVIDERS.has("sentry")).toBe(true);
    expect(CAPPED_FREE_PROVIDERS.has("supabase-free")).toBe(true);
  });
});

describe("ALWAYS_FREE_PROVIDERS catalog", () => {
  it("includes bhashini + telegram + amoy", () => {
    expect(ALWAYS_FREE_PROVIDERS.has("bhashini")).toBe(true);
    expect(ALWAYS_FREE_PROVIDERS.has("telegram")).toBe(true);
    expect(ALWAYS_FREE_PROVIDERS.has("polygon-amoy")).toBe(true);
    expect(ALWAYS_FREE_PROVIDERS.has("mock")).toBe(true);
  });
});

describe("getBudgetMode()", () => {
  it("returns zero-spend by default", () => {
    expect(getBudgetMode({})).toBe("zero-spend");
    expect(getBudgetMode()).toBe("zero-spend");
  });
  it("reads BUDGET_MODE env override", () => {
    expect(getBudgetMode({ BUDGET_MODE: "paid" })).toBe("paid");
    expect(getBudgetMode({ BUDGET_MODE: "zero-spend" })).toBe("zero-spend");
  });
  it("reads VITE_BUDGET_MODE as fallback (browser envs)", () => {
    expect(getBudgetMode({ VITE_BUDGET_MODE: "paid" })).toBe("paid");
  });
  it("falls back to zero-spend on garbage values", () => {
    expect(getBudgetMode({ BUDGET_MODE: "free-for-all" })).toBe("zero-spend");
    expect(getBudgetMode({ BUDGET_MODE: "" })).toBe("zero-spend");
  });
});

describe("classifyProvider()", () => {
  it("buckets the canonical providers", () => {
    expect(classifyProvider("aws")).toBe("paid");
    expect(classifyProvider("polygon-mainnet")).toBe("paid");
    expect(classifyProvider("whatsapp-meta")).toBe("capped-free");
    expect(classifyProvider("bhashini")).toBe("always-free");
    expect(classifyProvider("telegram")).toBe("always-free");
    expect(classifyProvider("polygon-amoy")).toBe("always-free");
    expect(classifyProvider("mock")).toBe("always-free");
  });
  it("returns 'unknown' for surprise providers", () => {
    expect(classifyProvider("some-new-saas")).toBe("unknown");
  });
});

describe("isProviderAllowed()", () => {
  it("blocks paid providers in zero-spend", () => {
    const d = isProviderAllowed("aws", {});
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/paid provider/);
    expect(d.classification).toBe("paid");
  });
  it("blocks polygon-mainnet in zero-spend", () => {
    expect(isProviderAllowed("polygon-mainnet", {}).allowed).toBe(false);
  });
  it("allows paid providers when BUDGET_MODE=paid", () => {
    expect(isProviderAllowed("aws", { BUDGET_MODE: "paid" }).allowed).toBe(true);
    expect(isProviderAllowed("polygon-mainnet", { BUDGET_MODE: "paid" }).allowed).toBe(true);
  });
  it("allows always-free providers regardless of mode", () => {
    expect(isProviderAllowed("bhashini", {}).allowed).toBe(true);
    expect(isProviderAllowed("telegram", {}).allowed).toBe(true);
    expect(isProviderAllowed("polygon-amoy", { BUDGET_MODE: "zero-spend" }).allowed).toBe(true);
  });
  it("allows capped-free providers regardless of mode", () => {
    expect(isProviderAllowed("whatsapp-meta", {}).allowed).toBe(true);
    expect(isProviderAllowed("resend", {}).allowed).toBe(true);
  });
  it("blocks unknown providers as a safety default", () => {
    const d = isProviderAllowed("some-new-saas", {});
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/unknown provider/);
  });
});

describe("filterAllowedProviders()", () => {
  it("strips paid providers in zero-spend, preserving order", () => {
    const r = filterAllowedProviders(["bhashini", "aws", "mock"], {});
    expect(r).toEqual(["bhashini", "mock"]);
  });
  it("preserves all when paid mode is on", () => {
    const r = filterAllowedProviders(["bhashini", "aws", "mock"], { BUDGET_MODE: "paid" });
    expect(r).toEqual(["bhashini", "aws", "mock"]);
  });
  it("handles empty / null input", () => {
    expect(filterAllowedProviders([])).toEqual([]);
    expect(filterAllowedProviders(null)).toEqual([]);
  });
});

describe("blockedResponse()", () => {
  it("returns structured response for budget block", () => {
    const r = blockedResponse("aws", {});
    expect(r.ok).toBe(false);
    expect(r.provider).toBe("aws");
    expect(r.mode).toBe("zero-spend");
    expect(r.classification).toBe("paid");
    expect(r.reason).toMatch(/paid provider/);
  });
});

// -- Cross-file parity check -------------------------------------------------
// The JS + TS guards must declare identical provider sets so the browser
// and EF reach the same decision for any input.
describe("JS ? TS parity (src/lib/budgetMode.js ? supabase/functions/_shared/budget.ts)", () => {
  const tsSource = readFileSync(
    join(process.cwd(), "supabase", "functions", "_shared", "budget.ts"),
    "utf8",
  );

  function extractSet(name) {
    // Match: export const NAME = new Set<string>([ ... ]);  OR  new Set([ ... ])
    const re = new RegExp(`export const ${name} = new Set(?:<[^>]+>)?\\(\\[([\\s\\S]*?)\\]\\)`, "m");
    const m = tsSource.match(re);
    if (!m) throw new Error(`could not find ${name} in budget.ts`);
    return m[1]
      .split(",")
      .map(s => s.trim().replace(/^["']|["'],?$/g, ""))
      .filter(Boolean);
  }

  it("PAID_PROVIDERS match", () => {
    expect(extractSet("PAID_PROVIDERS").sort()).toEqual([...PAID_PROVIDERS].sort());
  });
  it("CAPPED_FREE_PROVIDERS match", () => {
    expect(extractSet("CAPPED_FREE_PROVIDERS").sort()).toEqual([...CAPPED_FREE_PROVIDERS].sort());
  });
  it("ALWAYS_FREE_PROVIDERS match", () => {
    expect(extractSet("ALWAYS_FREE_PROVIDERS").sort()).toEqual([...ALWAYS_FREE_PROVIDERS].sort());
  });
});
