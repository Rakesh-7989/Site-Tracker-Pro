import { describe, it, expect } from "vitest";
import {
  getOrgIntegrations, getProviderForOrg, setProviderForOrg,
  clearProviderForOrg, isProviderConfigured, migrateLegacyToOrg,
  maskSecret, integrationsSummary, INIT_ORG_INTEGRATIONS,
  EMPTY_INTEGRATION, PROVIDERS,
} from "../src/lib/orgIntegrations.js";

describe("orgIntegrations — reads", () => {
  it("returns empty integration for unknown org", () => {
    const rec = getOrgIntegrations({}, "ghost");
    expect(rec.ai).toEqual(EMPTY_INTEGRATION.ai);
    expect(rec.razorpay).toEqual(EMPTY_INTEGRATION.razorpay);
  });
  it("returns specific provider config", () => {
    const store = { org1: { ai: { provider: "openai", key: "sk-1", model: "gpt-4" } } };
    expect(getProviderForOrg(store, "org1", "ai").provider).toBe("openai");
  });
  it("returns null for unknown provider", () => {
    expect(getProviderForOrg({}, "org1", "bogus")).toBeNull();
  });
});

describe("orgIntegrations — writes (immutable)", () => {
  it("setProviderForOrg returns new store, doesn't mutate", () => {
    const before = { org1: { ai: { provider: "old", key: "", model: "" } } };
    const after = setProviderForOrg(before, "org1", "ai", { provider: "new", key: "x", model: "m" });
    expect(before.org1.ai.provider).toBe("old");
    expect(after.org1.ai.provider).toBe("new");
    expect(after.org1.ai.key).toBe("x");
  });
  it("clearProviderForOrg resets only that provider", () => {
    const before = setProviderForOrg(INIT_ORG_INTEGRATIONS, "org1", "razorpay", { key_id: "k", key_secret: "s" });
    const after = clearProviderForOrg(before, "org1", "razorpay");
    expect(after.org1.razorpay).toEqual(EMPTY_INTEGRATION.razorpay);
  });
  it("ignores invalid provider names", () => {
    const before = { org1: { ai: { provider: "anthropic" } } };
    const after = setProviderForOrg(before, "org1", "bogus", { key: "x" });
    expect(after).toBe(before);
  });
});

describe("orgIntegrations — isProviderConfigured", () => {
  it("returns false for an empty provider", () => {
    expect(isProviderConfigured({}, "org1", "ai")).toBe(false);
  });
  it("returns true when at least one secret field is non-empty", () => {
    const store = setProviderForOrg({}, "org1", "ai", { key: "sk-x" });
    expect(isProviderConfigured(store, "org1", "ai")).toBe(true);
  });
});

describe("orgIntegrations — migration", () => {
  it("merges legacy localStorage shape into org record", () => {
    const next = migrateLegacyToOrg({}, "org1", {
      ai: { provider: "claude", key: "ant-1", model: "claude-3" },
      razorpay: { key_id: "rzp_test", key_secret: "secret", vpa: "x@axis" },
    });
    expect(next.org1.ai.provider).toBe("claude");
    expect(next.org1.razorpay.vpa).toBe("x@axis");
    expect(next.org1.whatsapp).toEqual(EMPTY_INTEGRATION.whatsapp);
  });
});

describe("orgIntegrations — display helpers", () => {
  it("maskSecret hides the middle of long strings", () => {
    const masked = maskSecret("sk-ant-1234567890abcdefg");
    expect(masked.startsWith("sk-")).toBe(true);
    expect(masked.endsWith("defg")).toBe(true);
    expect(masked.includes("*")).toBe(true);
  });
  it("maskSecret returns **** for very short strings", () => {
    expect(maskSecret("abc")).toBe("****");
  });
  it("integrationsSummary counts configured providers", () => {
    let store = INIT_ORG_INTEGRATIONS;
    store = setProviderForOrg(store, "org1", "ai", { key: "x" });
    store = setProviderForOrg(store, "org1", "razorpay", { key_id: "y" });
    const s = integrationsSummary(store, "org1");
    expect(s.count).toBe(2);
    expect(s.total).toBe(PROVIDERS.length);
    expect(s.ai).toBe(true);
    expect(s.whatsapp).toBe(false);
  });
});
