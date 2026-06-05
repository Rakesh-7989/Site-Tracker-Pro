// SiteTrack Pro — superadmin signup-queue query tests.

import { describe, it, expect } from "vitest";
import { listSignupRequests, reviewSignupRequest, pendingSignupCount } from "@/app/signupAdminQueries";

function selectChain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tableClient = (result: { data?: unknown; error?: unknown }): any => ({ from: () => selectChain(result) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (data: unknown): any => ({ rpc: async () => ({ data, error: null }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fnClient = (resp: { data?: unknown; error?: unknown }): any => ({ functions: { invoke: async () => resp } });

describe("listSignupRequests", () => {
  it("maps snake→camel + coerces status", async () => {
    const r = await listSignupRequests(tableClient({ data: [
      { id: "1", firm_name: "ABC", contact_name: "R", email: "r@a.com", phone: null, plan: "pro", message: "hi", status: "pending", review_notes: null, reviewed_at: null, created_org_id: null, created_at: "2026-06-06" },
    ], error: null }));
    expect(r.ok && r.data[0]).toMatchObject({ firmName: "ABC", contactName: "R", email: "r@a.com", plan: "pro", status: "pending", message: "hi" });
  });
  it("surfaces error", async () => {
    const r = await listSignupRequests(tableClient({ data: null, error: { message: "denied" } }));
    expect(r).toEqual({ ok: false, error: "denied" });
  });
});

describe("pendingSignupCount", () => {
  it("returns the numeric count, 0 on error", async () => {
    expect(await pendingSignupCount(rpcClient(4))).toBe(4);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errClient: any = { rpc: async () => ({ data: null, error: { message: "x" } }) };
    expect(await pendingSignupCount(errClient)).toBe(0);
  });
});

describe("reviewSignupRequest", () => {
  it("returns ok + orgId on approve", async () => {
    const r = await reviewSignupRequest(fnClient({ data: { ok: true, orgId: "org1", emailSent: true }, error: null }), "req1", "approve");
    expect(r.ok && r.data).toMatchObject({ orgId: "org1", emailSent: true });
  });
  it("surfaces EF error body on conflict", async () => {
    const err = { message: "non-2xx", context: { json: async () => ({ ok: false, message: "This email already has an account" }) } };
    const r = await reviewSignupRequest(fnClient({ data: null, error: err }), "req1", "approve");
    expect(r).toEqual({ ok: false, error: "This email already has an account" });
  });
});
