// SiteTrack Pro — v4 D6 cross-link tests: PO↔quote provenance mapper,
// project-scoped quote lister, and NOC-in-calendar bucketing.

import { describe, it, expect } from "vitest";
import { listPOs } from "@/app/queries/financeQueries";
import { listProjectQuotes } from "@/app/queries/procurementQuotes";
import { getOrgCalendar, bucketByDate, type CalItem } from "@/app/queries/calendarQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

describe("listPOs (D6 quote provenance)", () => {
  it("maps quote_id + quote item and vendor name", async () => {
    const r = await listPOs(mockClient({ data: [
      { id: "1", po_no: "PO-1", items: "Chairs", amount: 5000, status: "approved", delivery_date: null, vendor_id: "v9", vendor: { name: "Vendor A" }, quote_id: "q3", quote: { item_name: "Auditorium chairs" } },
      { id: "2", po_no: "PO-2", items: null, amount: 0, status: "pending", delivery_date: null, vendor_id: null, vendor: null, quote_id: null, quote: null },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ poNo: "PO-1", vendorId: "v9", vendorName: "Vendor A", quoteId: "q3", quoteItem: "Auditorium chairs" });
    expect(r.ok && r.data[1]).toMatchObject({ vendorId: null, vendorName: null, quoteId: null, quoteItem: null });
  });
});

describe("listProjectQuotes (D6)", () => {
  it("scopes to the project + maps the same shape as listOrgQuotes", async () => {
    const r = await listProjectQuotes(mockClient({ data: [
      { id: "q1", org_id: "o1", ffe_entry_id: "f1", project_id: "p1", vendor_id: "v1", vendor: { name: "Vendor A" }, item_name: "Chair", unit_price: 1000, qty: 2, lead_days: 10, valid_until: "2026-09-01", status: "received", notes: null, created_by: null, created_at: "2026-08-01T00:00:00Z" },
    ], error: null }), "p1");
    expect(r.ok && r.data[0]).toMatchObject({ projectId: "p1", ffeEntryId: "f1", vendorName: "Vendor A", unitPrice: 1000, qty: 2, status: "received" });
    const e = await listProjectQuotes(mockClient({ data: null, error: { message: "denied" } }), "p1");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("getOrgCalendar (D6 NOC branch)", () => {
  it("maps kind='noc' rows without falling back to milestone", async () => {
    const r = await getOrgCalendar(rpcClient({ data: [
      { kind: "noc", id: "s1", project_id: "p1", project_name: "Tower A", title: "Fire NOC", due_date: "2026-08-20", status: "approved" },
    ], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ kind: "noc", title: "Fire NOC", dueDate: "2026-08-20", status: "approved" });
  });
});

describe("bucketByDate with NOC items (D6)", () => {
  const mk = (kind: CalItem["kind"], id: string, dueDate: string, status = "pending"): CalItem => ({ kind, id, projectId: "p", projectName: "P", title: id, dueDate, status });
  it("buckets an approved NOC by valid_until like a milestone", () => {
    const items = [
      mk("noc", "old", "2026-06-01", "approved"),
      mk("noc", "today", "2026-06-06", "approved"),
      mk("noc", "soon", "2026-06-10", "approved"),
    ];
    const { overdue, today, upcoming } = bucketByDate(items, "2026-06-06");
    expect(overdue.map(i => i.id)).toEqual(["old"]);
    expect(today.map(i => i.id)).toEqual(["today"]);
    expect(upcoming.get("2026-06-10")?.map(i => i.id)).toEqual(["soon"]);
  });
  it("an approved NOC is never treated as completed (renewal stays actionable)", () => {
    const { overdue } = bucketByDate([mk("noc", "old", "2026-06-01", "approved")], "2026-06-06");
    expect(overdue.map(i => i.id)).toEqual(["old"]);
  });
});
