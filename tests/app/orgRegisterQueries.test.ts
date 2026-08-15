// SiteTrack Pro — self-service org registration query tests (P-D unified signup).

import { describe, it, expect } from "vitest";
import { registerOrg, type RegisterInput } from "@/app/orgRegisterQueries";

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

  it("falls back to error.message when no JSON body", async () => {
    const err = { message: "network down", context: {} };
    const r = await registerOrg(input, client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "network down" });
  });
});
