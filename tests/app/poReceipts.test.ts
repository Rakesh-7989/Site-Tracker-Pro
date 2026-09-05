// SiteTrack Pro — PO goods-receipt pure helpers + query mappers (v4 Phase E).

import { describe, it, expect } from "vitest";
import {
  listPoReceipts, addPoReceipt, deletePoReceipt,
  receiptAmount, receivedTotal, openAmount, deliveryProgress, isFullyDelivered,
  type PoReceipt,
} from "@/app/queries/poReceiptQueries";

const rec = (amount: number, id = "x"): PoReceipt => ({ id, poId: "po", receivedDate: "2026-06-01", qty: 1, unitPrice: amount, amount, notes: null, receivedByName: null, createdAt: "" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (result: { data?: unknown; error?: unknown }): any => {
  const chain = {
    select: () => chain,
    insert: () => chain,
    delete: () => chain,
    single: async () => result,
    eq: () => chain,
    order: async () => result,
  };
  return { from: () => chain };
};

describe("pure receipt math", () => {
  it("receiptAmount = qty × unitPrice, clamped ≥ 0", () => {
    expect(receiptAmount(3, 200)).toBe(600);
    expect(receiptAmount(0, 100)).toBe(100); // qty floor 1
    expect(receiptAmount(5, -50)).toBe(0); // price floor 0
  });
  it("receivedTotal sums receipt amounts", () => {
    expect(receivedTotal([rec(100), rec(250)])).toBe(350);
    expect(receivedTotal([])).toBe(0);
  });
  it("openAmount = amount − received, clamped ≥ 0", () => {
    expect(openAmount(1000, [rec(300), rec(200)])).toBe(500);
    expect(openAmount(500, [rec(600)])).toBe(0);
  });
  it("deliveryProgress maps received ratio to 0–100", () => {
    expect(deliveryProgress(1000, [rec(250), rec(250)])).toBe(50);
    expect(deliveryProgress(1000, [rec(2000)])).toBe(100); // over-delivered clamps
    expect(deliveryProgress(0, [rec(100)])).toBe(0); // no PO amount
  });
  it("isFullyDelivered only when received ≥ amount and amount > 0", () => {
    expect(isFullyDelivered(1000, [rec(1000)])).toBe(true);
    expect(isFullyDelivered(1000, [rec(999)])).toBe(false);
    expect(isFullyDelivered(0, [rec(0)])).toBe(false);
    expect(isFullyDelivered(500, [rec(600)])).toBe(true);
  });
});

describe("query mappers", () => {
  it("listPoReceipts maps fields + coerce numeric + joins received_by name", async () => {
    const r = await listPoReceipts(from({ data: [
      { id: "1", po_id: "po", received_date: "2026-08-01", qty: 3, unit_price: 200, amount: 600, notes: "chalan 441", received_by: { name: "Ravi" }, created_at: "2026-08-01T10:00:00" },
      { id: "2", po_id: "po", received_date: null, qty: "2", unit_price: "100", amount: "200", notes: null, received_by: null, created_at: null },
    ], error: null }), "po");
    expect(r.ok && r.data).toMatchObject([
      { id: "1", poId: "po", receivedDate: "2026-08-01", qty: 3, unitPrice: 200, amount: 600, notes: "chalan 441", receivedByName: "Ravi" },
      { id: "2", qty: 2, unitPrice: 100, amount: 200, receivedByName: null, receivedDate: "" },
    ]);
  });
  it("listPoReceipts surfaces errors", async () => {
    const r = await listPoReceipts(from({ data: null, error: { message: "nope" } }), "po");
    expect(r).toEqual({ ok: false, error: "nope" });
  });
  it("addPoReceipt computes amount = qty × unit_price", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from: () => {
        const chain = {
          insert: (row: unknown) => { inserted = row as Record<string, unknown>; return chain; },
          select: () => chain,
          single: async () => ({ data: { id: "new" }, error: null }),
          eq: () => chain,
          order: () => chain,
        };
        return chain;
      },
    };
    const r = await addPoReceipt(client, { poId: "po", receivedDate: "2026-08-02", qty: 4, unitPrice: 250, notes: "ok" });
    expect(r.ok && r.data?.id).toBe("new");
    expect(inserted).toMatchObject({ po_id: "po", qty: 4, unit_price: 250, amount: 1000, notes: "ok" });
  });
  it("deletePoReceipt surfaces errors", async () => {
    const client = { from: () => ({ delete: () => ({ eq: async () => ({ data: null, error: { message: "denied" } }) }) }) };
    const r = await deletePoReceipt(client, "1");
    expect(r).toEqual({ ok: false, error: "denied" });
  });
});