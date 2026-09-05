// SiteTrack Pro — Change Orders + Estimate query tests (Batch 4/5).

import { describe, it, expect } from "vitest";
import { listChangeOrders, listEstimates } from "@/app/queries/designQueries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }): TypedSupabaseClient => ({ from: () => chain(result) } as unknown as TypedSupabaseClient);

describe("listChangeOrders", () => {
  it("maps impacts + coerces status", async () => {
    const r = await listChangeOrders(mockClient({ data: [
      { id: "1", no: "CO-1", description: "Add basement", cost_impact: 500000, schedule_impact: 15, reason: "client", status: "approved" },
      { id: "2", no: "CO-2", description: "X", cost_impact: null, schedule_impact: null, reason: null, status: "weird" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ no: "CO-1", costImpact: 500000, scheduleImpact: 15, status: "approved" });
    expect(r.ok && r.data[1]).toMatchObject({ costImpact: null, status: "submitted" });
  });
});

describe("listEstimates", () => {
  it("maps amount/version + coerces status + surfaces error", async () => {
    const r = await listEstimates(mockClient({ data: [{ id: "1", name: "Quote", version: 2, total_amount: 7500000, status: "weird" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ name: "Quote", version: 2, totalAmount: 7500000, status: "draft" });
    const e = await listEstimates(mockClient({ data: null, error: { message: "denied" } }), "p");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});
