// SiteTrack Pro — payment receipts & reconciliation tests (#30).

import { describe, it, expect } from "vitest";
import { listReceipts, reconcileInvoice, reconcileRaBill } from "@/app/receiptQueries";

interface MockClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: unknown) => {
        eq: (k: string, v: unknown) => {
          eq: (k: string, v: unknown) => {
            order: (col: string, o: unknown) => Promise<{ data: unknown; error: null }>;
          };
        };
      };
    };
  };
}

const mock = (rows: unknown): MockClient => ({
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) }) }),
  }) as never,
});

describe("listReceipts", () => {
  it("maps fields + joined received_by name", async () => {
    const r = await listReceipts(mock([{ id: "1", project_id: "pr", target_type: "invoice", target_id: "t", amount: 5000, method: "upi", received_on: "2026-08-01", reference: "INV/ref", notes: null, received_by: { name: "Rakesh" } }]), "pr", "invoice", "t");
    expect(r.ok && r.data[0]).toMatchObject({ targetType: "invoice", amount: 5000, method: "upi", receivedByName: "Rakesh" });
  });
  it("coerces unknown target to invoice + method to bank", async () => {
    const r = await listReceipts(mock([{ id: "1", project_id: "pr", target_type: "weird", target_id: "t", amount: 10, method: "weird", received_on: null, reference: null, notes: null }]), "pr", "invoice", "t");
    expect(r.ok && r.data[0]).toMatchObject({ targetType: "invoice", method: "bank" });
  });
});

describe("reconcileInvoice (#30)", () => {
  it("received vs outstanding against net receivable", () => {
    const r = reconcileInvoice({ amount: 100000, gst: 18, tds: 2 }, [{ amount: 50000 }, { amount: 10000 }]);
    expect(r.received).toBe(60000);
    expect(r.outstanding).toBe(56000); // 116000 - 60000
  });
  it("clamps outstanding at 0 when overpaid", () => {
    const r = reconcileInvoice({ amount: 100000, gst: 18, tds: 2 }, [{ amount: 200000 }]);
    expect(r.received).toBe(200000);
    expect(r.outstanding).toBe(0);
  });
});

describe("reconcileRaBill (#30)", () => {
  it("received vs outstanding against net payable (after retention)", () => {
    const r = reconcileRaBill({ billAmount: 200000, retentionPct: 10 }, [{ amount: 50000 }, { amount: 30000 }]);
    expect(r.received).toBe(80000);
    expect(r.outstanding).toBe(100000); // 180000 - 80000
  });
});