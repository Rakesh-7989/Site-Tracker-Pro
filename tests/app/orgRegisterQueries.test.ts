// SiteTrack Pro — self-service org registration query tests (P-D unified signup).

import { describe, it, expect } from "vitest";
import { registerOrg, resendConfirmation, type RegisterInput } from "@/app/queries/orgRegisterQueries";

const input: RegisterInput = {
  email: "owner@firm.com",
  password: "s3cret-Pass",
  firmName: "Sri Builders",
  contactName: "Rakesh",
  plan: "pro",
  billing: "annual",
  segment: "construction",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (resp: { data?: unknown; error?: unknown }): any => ({
  functions: { invoke: async () => resp },
});

describe("registerOrg", () => {
  it("returns ok with orgId + emailSent on success", async () => {
    const r = await registerOrg(input, client({ data: { ok: true, orgId: "org-1", emailSent: true }, error: null }));
    expect(r).toEqual({ ok: true, orgId: "org-1", emailSent: true });
  });

  it("sends the billing period through in the EF body (P-D)", async () => {
    let body: unknown;
    const c = client({ data: { ok: true, orgId: "org-1", emailSent: false }, error: null });
    c.functions.invoke = async (_fn: string, opts: { body: unknown }) => {
      body = opts.body;
      return { data: { ok: true, orgId: "org-1", emailSent: false }, error: null };
    };
    await registerOrg(input, c);
    expect(body).toMatchObject({ plan: "pro", billing: "annual", segment: "construction" });
  });

  it("sends the honeypot field through (empty for real users, autofilled by bots)", async () => {
    let body: unknown;
    const c = client({ data: { ok: true, orgId: "org-1", emailSent: false }, error: null });
    c.functions.invoke = async (_fn: string, opts: { body: unknown }) => {
      body = opts.body;
      return { data: { ok: true, orgId: "org-1", emailSent: false }, error: null };
    };
    await registerOrg({ ...input, website: "http://spam.example" }, c);
    expect(body).toMatchObject({ website: "http://spam.example" });
  });

  it("defaults emailSent to false when the EF omits it", async () => {
    const r = await registerOrg(input, client({ data: { ok: true, orgId: "org-1" }, error: null }));
    expect(r).toEqual({ ok: true, orgId: "org-1", emailSent: false });
  });

  it("surfaces EF data-level error message", async () => {
    const r = await registerOrg(input, client({ data: { ok: false, message: "This email already has an account. Please sign in instead." }, error: null }));
    expect(r).toEqual({ ok: false, error: "This email already has an account. Please sign in instead." });
  });

  it("surfaces the EF JSON error body from a 4xx (FunctionsHttpError)", async () => {
    const err = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ ok: false, message: "Please enter a valid work email." }) } };
    const r = await registerOrg(input, client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "Please enter a valid work email." });
  });

  it("surfaces the friendly rate-limited message from a 429 (migration 201)", async () => {
    const err = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ ok: false, error: "rate-limited", message: "Too many workspace signups from your network. Please try again in about an hour." }) } };
    const r = await registerOrg(input, client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "Too many workspace signups from your network. Please try again in about an hour." });
  });

  it("falls back to error.message when no JSON body", async () => {
    const err = { message: "network down", context: {} };
    const r = await registerOrg(input, client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "network down" });
  });

  it("omits plan/billing/segment from the body when the identity screen omits them (Pro-trial default)", async () => {
    let body: unknown;
    const c = client({ data: { ok: true, orgId: "org-1", emailSent: false }, error: null });
    c.functions.invoke = async (_fn: string, opts: { body: unknown }) => {
      body = opts.body;
      return { data: { ok: true, orgId: "org-1", emailSent: false }, error: null };
    };
    const minimal: RegisterInput = { email: "a@b.co", password: "s3cret-Pass", firmName: "a", contactName: "a" };
    const r = await registerOrg(minimal, c);
    expect(r.ok).toBe(true);
    expect(body).not.toHaveProperty("plan");
    expect(body).not.toHaveProperty("billing");
    expect(body).not.toHaveProperty("segment");
  });

  it("passes plan + trialEndsAt through on success (verify screen)", async () => {
    const r = await registerOrg(input, client({ data: { ok: true, orgId: "org-1", emailSent: true, plan: "pro", trialEndsAt: "2026-08-30T00:00:00.000Z" }, error: null }));
    expect(r).toEqual({ ok: true, orgId: "org-1", emailSent: true, plan: "pro", trialEndsAt: "2026-08-30T00:00:00.000Z" });
  });
});

describe("resendConfirmation", () => {
  it("sends the email through the EF body", async () => {
    let body: unknown;
    const c = client({ data: { ok: true, emailSent: true }, error: null });
    c.functions.invoke = async (_fn: string, opts: { body: unknown }) => {
      body = opts.body;
      return { data: { ok: true, emailSent: true }, error: null };
    };
    const r = await resendConfirmation("owner@firm.com", c);
    expect(r).toEqual({ ok: true, emailSent: true });
    expect(body).toMatchObject({ email: "owner@firm.com" });
  });

  it("surfaces an EF error message", async () => {
    const r = await resendConfirmation("owner@firm.com", client({ data: { ok: false, message: "This email is already confirmed. Please sign in." }, error: null }));
    expect(r).toEqual({ ok: false, error: "This email is already confirmed. Please sign in." });
  });

  it("surfaces the EF JSON body from a 4xx (FunctionsHttpError)", async () => {
    const err = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ ok: false, error: "rate-limited", message: "Too many resend requests. Please wait a minute." }) } };
    const r = await resendConfirmation("owner@firm.com", client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "Too many resend requests. Please wait a minute." });
  });

  it("falls back to error.message when no JSON body", async () => {
    const err = { message: "network down", context: {} };
    const r = await resendConfirmation("owner@firm.com", client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "network down" });
  });
});
