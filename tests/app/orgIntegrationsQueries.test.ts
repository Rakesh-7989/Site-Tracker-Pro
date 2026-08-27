// SiteTrack Pro — org integrations query tests.

import { describe, it, expect } from "vitest";
import { getIntegrationStatus, saveProvider, clearProvider, PROVIDERS, SECRET_FIELDS } from "@/app/queries/orgIntegrationsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

describe("getIntegrationStatus", () => {
  it("maps booleans (missing → false) + surfaces error", async () => {
    const r = await getIntegrationStatus(rpcClient({ data: { whatsapp: true, ai: false }, error: null }), "o");
    expect(r.ok && r.data).toEqual({ whatsapp: true, ai: false, razorpay: false, cashfree: false });
    const e = await getIntegrationStatus(rpcClient({ data: null, error: { message: "denied" } }), "o");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("saveProvider / clearProvider", () => {
  it("upserts only the provider's column", async () => {
    let captured: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = { from: () => ({ upsert: (row: Record<string, unknown>) => { captured = row; return Promise.resolve({ error: null }); } }) };
    const r = await saveProvider(client, "org1", "whatsapp", { phone_id: "123", token: "secret" }, "user1");
    expect(r.ok).toBe(true);
    expect(captured).toMatchObject({ org_id: "org1", updated_by: "user1", whatsapp: { phone_id: "123", token: "secret" } });
    expect(captured.ai).toBeUndefined(); // other providers untouched
  });
  it("clear sets the provider to {}", async () => {
    let patch: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client: any = { from: () => ({ update: (p: Record<string, unknown>) => { patch = p; return { eq: () => Promise.resolve({ error: null }) }; } }) };
    const r = await clearProvider(client, "org1", "razorpay", "user1");
    expect(r.ok).toBe(true);
    expect(patch).toMatchObject({ razorpay: {}, updated_by: "user1" });
  });
});

describe("provider metadata", () => {
  it("has 4 providers + secret fields flagged", () => {
    expect(PROVIDERS.map(p => p.id).sort()).toEqual(["ai", "cashfree", "razorpay", "whatsapp"]);
    expect(SECRET_FIELDS.has("key_secret")).toBe(true);
    expect(SECRET_FIELDS.has("phone_id")).toBe(false);
  });
});
