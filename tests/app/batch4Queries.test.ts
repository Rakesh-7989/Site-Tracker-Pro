// SiteTrack Pro — Batch 3/4 query tests (RA bills, ledger, drawings, RFI).

import { describe, it, expect } from "vitest";
import { raNetPayable, stockBalance, listRaBills, type LedgerTxn } from "@/app/queries/financeQueries";
import { listDrawings, listRfis, applyAutoSupersede, type Drawing } from "@/app/queries/designQueries";
import { approvalCapabilityForKind } from "@/app/queries/approvalsQueries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }): TypedSupabaseClient => ({ from: () => chain(result) } as unknown as TypedSupabaseClient);
const drawing = (over: Partial<Drawing>): Drawing => ({
  id: "d1", projectId: "proj1", title: "GF plan", type: "architectural",
  revision: "Rev A", status: "current", releaseDate: "2026-06-01",
  storagePath: null, previewUrl: null, designStage: "concept", supersededBy: null,
  ...over,
});

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
  it("maps + coerces status + superseded_by", async () => {
    const r = await listDrawings(mockClient({ data: [{ id: "1", title: "GF plan", type: "architectural", revision: "Rev B", status: "weird", release_date: "2026-06-01", superseded_by: "rev2" }], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ title: "GF plan", revision: "Rev B", status: "current", designStage: "concept", supersededBy: "rev2" });
  });
});

describe("applyAutoSupersede (ST-016)", () => {
  const old = drawing({ id: "revA", revision: "Rev A", releaseDate: "2026-07-01" });
  const other = drawing({ id: "other", title: "Section", type: "architectural", status: "current" });
  const superseded = drawing({ id: "revX", revision: "Rev X", status: "superseded", supersededBy: "prev" });

  it("flips the matching current revision to superseded with supersededBy set", () => {
    const out = applyAutoSupersede([old, other], drawing({ id: "revB", revision: "Rev B", releaseDate: "2026-08-01" }));
    expect(out.find(x => x.id === "revA")).toMatchObject({ status: "superseded", supersededBy: "revB" });
    expect(out.find(x => x.id === "other")?.status).toBe("current");
  });

  it("leaves already-superseded rows untouched", () => {
    const out = applyAutoSupersede([old, superseded], drawing({ id: "revB", revision: "Rev B" }));
    expect(out.find(x => x.id === "revX")).toMatchObject({ status: "superseded", supersededBy: "prev" });
  });

  it("matches case-insensitively with trimmed title/type (mirrors the DB constraint)", () => {
    const out = applyAutoSupersede([drawing({ id: "a", title: " GF Plan ", type: " Architectural " })], drawing({ id: "b", title: "gf plan", type: "architectural" }));
    expect(out.find(x => x.id === "a")?.status).toBe("superseded");
  });

  it("does not touch different-title rows or return the added row (DrawingsTab prepends it)", () => {
    const out = applyAutoSupersede([old, other], drawing({ id: "revB", revision: "Rev B", releaseDate: "2026-08-01" }));
    expect(out.find(x => x.id === "revB")).toBeUndefined();
    expect(out.find(x => x.id === "other")?.status).toBe("current");
  });

  it("returns a NEW array (never mutates input)", () => {
    const input = [old];
    const out = applyAutoSupersede(input, drawing({ id: "revB", revision: "Rev B" }));
    expect(out).not.toBe(input);
    expect(input[0].status).toBe("current");
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
