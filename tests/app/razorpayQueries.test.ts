// SiteTrack Pro — Razorpay payment-link query layer tests.

import { describe, it, expect } from "vitest";
import { createPaymentLink } from "@/app/razorpayQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (resp: { data?: unknown; error?: unknown }): any => ({
  functions: { invoke: async () => resp },
});

describe("createPaymentLink", () => {
  it("invokes the razorpay-payment-link EF with invoice_id + project_id", async () => {
    let called = "";
    let body: unknown;
    const c = client({ data: { ok: true, payment_link_id: "plink_x", short_url: "https://rzp.io/abc", status: "created", amount: 11600000 }, error: null });
    c.functions.invoke = async (fn: string, opts: { body: unknown }) => {
      called = fn;
      body = opts.body;
      return { data: { ok: true, payment_link_id: "plink_x", short_url: "https://rzp.io/abc", status: "created", amount: 11600000 }, error: null };
    };
    const r = await createPaymentLink(c, "inv-1", "proj-1");
    expect(called).toBe("razorpay-payment-link");
    expect(body).toMatchObject({ invoice_id: "inv-1", project_id: "proj-1" });
    expect(r).toEqual({ ok: true, data: { paymentLinkId: "plink_x", shortUrl: "https://rzp.io/abc", status: "created", amount: 11600000 } });
  });

  it("omits project_id from the body when not provided", async () => {
    let body: unknown;
    const c = client({ data: { ok: true, payment_link_id: "plink_x", short_url: "https://rzp.io/abc", status: "created", amount: 100 }, error: null });
    c.functions.invoke = async (_fn: string, opts: { body: unknown }) => {
      body = opts.body;
      return { data: { ok: true, payment_link_id: "plink_x", short_url: "https://rzp.io/abc", status: "created", amount: 100 }, error: null };
    };
    const r = await createPaymentLink(c, "inv-1");
    expect(body).toMatchObject({ invoice_id: "inv-1" });
    expect((body as { project_id?: string }).project_id).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it("surfaces an EF transport error message", async () => {
    const c = client({ data: { ok: false, error: "razorpay-error", detail: "invalid key id" }, error: null });
    const r = await createPaymentLink(c, "inv-1");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("razorpay-error");
  });

  it("surfaces a FunctionsError (network/auth) with a context JSON body", async () => {
    const fnErr = Object.assign(new Error("FunctionsHttpError"), { context: { json: async () => ({ error: "unauthorized", detail: "bad token" }) } });
    const c = client({ data: null, error: fnErr });
    const r = await createPaymentLink(c, "inv-1");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("unauthorized");
  });

  it("catches thrown errors and returns ok:false with the message", async () => {
    const c = { functions: { invoke: async () => { throw new Error("network down"); } } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await createPaymentLink(c as any, "inv-1");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network down");
  });

  it("returns ok:false when data.ok is falsy (EF-level failure)", async () => {
    const c = client({ data: { ok: false, error: "already-paid" }, error: null });
    const r = await createPaymentLink(c, "inv-1");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("already-paid");
  });

  it("handles null data (no EF response)", async () => {
    const c = client({ data: null, error: null });
    const r = await createPaymentLink(c, "inv-1");
    expect(r.ok).toBe(false);
  });
});