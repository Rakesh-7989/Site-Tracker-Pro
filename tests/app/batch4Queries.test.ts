// SiteTrack Pro — Batch 3/4 query tests (RA bills, ledger, drawings, RFI).

import { describe, it, expect } from "vitest";
import { raNetPayable, stockBalance, listRaBills, type LedgerTxn } from "@/app/financeQueries";
import { listDrawings, listRfis } from "@/app/designQueries";
import { approvalCapabilityForKind } from "@/app/approvalsQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });

describe("raNetPayable", () => {
  it("subtracts retention", () => {
    expect(raNetPayable({ billAmount: 100000, retentionPct: 5 })).toBe(95000);
    expect(raNetPayable({ billAmount: 100000, retentionPct: 0 })).toBe(100000);
  });
});

describe("stockBalance", () => {
  it("nets inward/return up, outward/wastage down per material", () => {
    const txns = [
      { material: "Cement", qty: 100, direction: "inward" },
      { material: "Cement", qty: 30, direction: "outward" },
      { material: "Cement", qty: 5, direction: "wastage" },
      { material: "Steel", qty: 50, direction: "inward" },
      { material: "Steel", qty: 10, direction: "return" },
    ] as LedgerTxn[];
    const bal = stockBalance(txns);
    expect(bal.get("Cement")).toBe(65);
    expect(bal.get("Steel")).toBe(60);
  });
});

describe("listRaBills", () => {
  it("maps amounts + coerces status", async () => {
    const r = await listRaBills(mockClient({ data: [{ id: "1", no: "RA-1", subcontractor: "X", scope: "civil", bill_amount: 500000, retention_pct: 5, paid_amount: 0, status: "approved", bill_date: "2026-06-01" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ no: "RA-1", billAmount: 500000, retentionPct: 5, status: "approved" });
  });
});

describe("listDrawings", () => {
  it("maps + coerces status", async () => {
    const r = await listDrawings(mockClient({ data: [{ id: "1", title: "GF plan", type: "architectural", revision: "Rev B", status: "weird", release_date: "2026-06-01" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ title: "GF plan", revision: "Rev B", status: "current", designStage: "concept" });
  });
});

describe("listRfis", () => {
  it("maps + coerces status + surfaces error", async () => {
    const r = await listRfis(mockClient({ data: [{ id: "1", no: "RFI-1", subject: "Beam", question: "Size?", category: "structural", status: "weird", response: null, asked_at: "2026-06-01" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ no: "RFI-1", subject: "Beam", status: "open" });
    const e = await listRfis(mockClient({ data: null, error: { message: "denied" } }), "p");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("approvalCapabilityForKind", () => {
  it("maps each approval queue kind to its exact approve capability", () => {
    expect(approvalCapabilityForKind("changeorder")).toBe("changeorder:approve");
    expect(approvalCapabilityForKind("rabill")).toBe("rabill:approve");
    expect(approvalCapabilityForKind("po")).toBe("po:approve");
  });
});
