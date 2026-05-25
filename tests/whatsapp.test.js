import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getWhatsAppConfig, saveWhatsAppConfig, clearWhatsAppConfig, isWhatsAppApiEnabled, sendWhatsApp, sendWhatsAppBulk } from "../src/lib/whatsapp.js";

// Provide a minimal localStorage shim for the JSDOM-free vitest env.
beforeEach(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

afterEach(() => { delete globalThis.localStorage; });

describe("whatsapp.getWhatsAppConfig + save/clear", () => {
  it("returns null when nothing stored", () => {
    expect(getWhatsAppConfig()).toBeNull();
  });

  it("save + read round-trips a config object", () => {
    saveWhatsAppConfig({ phone_id: "12345", access_token: "x" });
    const cfg = getWhatsAppConfig();
    expect(cfg.phone_id).toBe("12345");
    expect(cfg.access_token).toBe("x");
  });

  it("clear removes stored creds", () => {
    saveWhatsAppConfig({ phone_id: "x", access_token: "y" });
    clearWhatsAppConfig();
    expect(getWhatsAppConfig()).toBeNull();
  });
});

describe("whatsapp.isWhatsAppApiEnabled", () => {
  it("false when no creds", () => {
    expect(isWhatsAppApiEnabled()).toBe(false);
  });

  it("true only when BOTH phone_id and access_token present", () => {
    saveWhatsAppConfig({ phone_id: "12345" });
    expect(isWhatsAppApiEnabled()).toBe(false);
    saveWhatsAppConfig({ phone_id: "12345", access_token: "t" });
    expect(isWhatsAppApiEnabled()).toBe(true);
  });
});

describe("whatsapp.sendWhatsApp (no creds — fallback path)", () => {
  it("returns ok=false with a wa.me fallback_url", async () => {
    const r = await sendWhatsApp({ to: "+91-98765-43210", message: "Hi" });
    expect(r.ok).toBe(false);
    expect(r.fallback_url).toContain("wa.me/919876543210");
    expect(r.fallback_url).toContain("Hi");
  });

  it("strips non-digits from phone number", async () => {
    const r = await sendWhatsApp({ to: "(91) 98765 43210", message: "Hello" });
    expect(r.fallback_url).toContain("wa.me/919876543210");
  });

  it("returns an error when recipient is missing", async () => {
    const r = await sendWhatsApp({ to: "", message: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/recipient/i);
  });
});

describe("whatsapp.sendWhatsApp (with creds — API path mocked)", () => {
  it("POSTs to Meta Cloud API and returns ok+message_id on success", async () => {
    saveWhatsAppConfig({ phone_id: "phone-1", access_token: "tk" });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.x" }] }),
    }));
    const r = await sendWhatsApp({ to: "919876543210", message: "Test" });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
    expect(r.message_id).toBe("wamid.x");
    delete globalThis.fetch;
  });

  it("returns ok=false with fallback when API returns non-OK", async () => {
    saveWhatsAppConfig({ phone_id: "phone-1", access_token: "tk" });
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => "permission denied",
    }));
    const r = await sendWhatsApp({ to: "919876543210", message: "Test" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("permission denied");
    expect(r.fallback_url).toContain("wa.me");
    delete globalThis.fetch;
  });
});

describe("whatsapp.sendWhatsAppBulk", () => {
  it("delivers one result entry per recipient", async () => {
    const out = await sendWhatsAppBulk(["91111", "92222"], "hi");
    expect(out).toHaveLength(2);
    expect(out[0].to).toBe("91111");
    expect(out[1].to).toBe("92222");
  });
});
