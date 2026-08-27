// SiteTrack Pro — public signup submission tests.

import { describe, it, expect } from "vitest";
import { submitSignupRequest, type SignupInput } from "@/app/queries/signupQueries";

const input: SignupInput = { firmName: "Sri Builders", contactName: "Rakesh", email: "r@firm.com", plan: "pro" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (resp: { data?: unknown; error?: unknown }): any => ({
  functions: { invoke: async () => resp },
});

describe("submitSignupRequest", () => {
  it("returns ok on success", async () => {
    const r = await submitSignupRequest(input, client({ data: { ok: true, id: "abc" }, error: null }));
    expect(r).toEqual({ ok: true });
  });

  it("surfaces EF data-level error message", async () => {
    const r = await submitSignupRequest(input, client({ data: { ok: false, message: "We've already got a request from this email" }, error: null }));
    expect(r).toEqual({ ok: false, error: "We've already got a request from this email" });
  });

  it("surfaces the EF JSON error body from a 4xx (FunctionsHttpError)", async () => {
    const err = { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ ok: false, message: "Please enter a valid work email." }) } };
    const r = await submitSignupRequest(input, client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "Please enter a valid work email." });
  });

  it("falls back to error.message when no JSON body", async () => {
    const err = { message: "network down", context: {} };
    const r = await submitSignupRequest(input, client({ data: null, error: err }));
    expect(r).toEqual({ ok: false, error: "network down" });
  });
});
