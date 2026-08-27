// SiteTrack Pro — 1.3 (SEC-06 Vendor permissions + SEC-07 Approval SoD).
// PO approval trail mapper tests + the self-approval UI guard + a source
// contract on migration 218 (DB backstop: vendor PO read narrowed, vendor PO
// insert removed, requester force-stamped, approver != requester enforced).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listPOs } from "@/app/queries/financeQueries";
import { getOrgPurchaseOrders } from "@/app/queries/crossPoQueries";
import { poStatusOptionsFor, poApprovalDate } from "@/features/project/tabs/POsTab";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
const mockClient = (result: { data?: unknown; error?: unknown }) => ({ from: () => chain(result) });
const rpcClient = (result: { data?: unknown; error?: unknown }) => ({ rpc: () => result });

describe("listPOs — approval trail mapping (SEC-07)", () => {
  it("maps requested_by / approved_by name embeds + approved_at", async () => {
    const r = await listPOs(mockClient({ data: [
      { id: "1", po_no: "PO-1", amount: 50000, status: "approved", requested_by: "u1", requested: { name: "Ravi" }, approved_by: "u2", approved: { name: "Anu" }, approved_at: "2026-08-18T10:00:00Z" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({
      requestedById: "u1", requestedByName: "Ravi",
      approvedById: "u2", approvedByName: "Anu",
      approvedAt: "2026-08-18T10:00:00Z",
    });
  });

  it("treats null requester / approver / approved_at as null", async () => {
    const r = await listPOs(mockClient({ data: [
      { id: "2", po_no: "PO-2", amount: 0, status: "pending", requested_by: null, requested: null, approved_by: null, approved: null, approved_at: null },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({
      requestedById: null, requestedByName: null, approvedById: null, approvedByName: null, approvedAt: null,
    });
  });

  it("surfaces the query error", async () => {
    const r = await listPOs(mockClient({ data: null, error: { message: "PGRST204 column does not exist" } }), "p");
    expect(r.ok).toBe(false);
  });
});

describe("poStatusOptionsFor / poApprovalDate (self-approval UI guard)", () => {
  it("removes the approved transition for self-requested POs", () => {
    const po = { id: "1", poNo: "PO-1", items: null, amount: 1, status: "pending" as const, deliveryDate: null, vendorId: null, vendorName: null, quoteId: null, quoteItem: null, materialRequestId: null, materialRequestItem: null, requestedById: "me", requestedByName: "Ravi", approvedById: null, approvedByName: null, approvedAt: null };
    const st = poStatusOptionsFor(po, "me");
    expect(st.selfRequested).toBe(true);
    expect(st.options.map(o => o.value)).toEqual(["pending", "delivered", "cancelled"]);
  });

  it("keeps the full ladder for POs someone else requested", () => {
    const po = { id: "1", poNo: "PO-1", items: null, amount: 1, status: "pending" as const, deliveryDate: null, vendorId: null, vendorName: null, quoteId: null, quoteItem: null, materialRequestId: null, materialRequestItem: null, requestedById: "other", requestedByName: "Ravi", approvedById: null, approvedByName: null, approvedAt: null };
    expect(poStatusOptionsFor(po, "me").options.map(o => o.value)).toEqual(["pending", "approved", "delivered", "cancelled"]);
    expect(poStatusOptionsFor(po, "me").selfRequested).toBe(false);
  });

  it("does not gate when the viewer id is unknown (DB remains the backstop)", () => {
    const po = { id: "1", poNo: "PO-1", items: null, amount: 1, status: "pending" as const, deliveryDate: null, vendorId: null, vendorName: null, quoteId: null, quoteItem: null, materialRequestId: null, materialRequestItem: null, requestedById: "me", requestedByName: null, approvedById: null, approvedByName: null, approvedAt: null };
    expect(poStatusOptionsFor(po, null).selfRequested).toBe(false);
    expect(poStatusOptionsFor(po, null).options.map(o => o.value)).toEqual(["pending", "approved", "delivered", "cancelled"]);
  });

  it("formats the approval timestamp to YYYY-MM-DD", () => {
    expect(poApprovalDate("2026-08-18T10:00:00Z")).toBe("2026-08-18");
    expect(poApprovalDate(null)).toBeNull();
  });
});

describe("getOrgPurchaseOrders — approval trail in the org rollup", () => {
  it("maps requested_by_name / approved_by_name / approved_at", async () => {
    const r = await getOrgPurchaseOrders(rpcClient({ data: [
      { id: "1", po_no: "PO-1", project_id: "p1", project_name: "Villa", amount: 50000, status: "approved", received_amount: 0, open_amount: 50000, requested_by_name: "Ravi", approved_by_name: "Anu", approved_at: "2026-08-18T10:00:00Z" },
    ], error: null }), "org1");
    expect(r.ok && r.data[0]).toMatchObject({
      requestedByName: "Ravi", approvedByName: "Anu", approvedAt: "2026-08-18T10:00:00Z",
    });
  });
});

describe("migration 218 — DB backstop source contract", () => {
  const sql = readFileSync(join(process.cwd(), "scripts", "supabase", "218_po_approval_sod.sql"), "utf8");

  it("drops the over-broad vendor read policy and never re-creates it", () => {
    expect(sql).toContain("DROP POLICY IF EXISTS v4_vendor_read_pos ON public.purchase_orders;");
    expect(sql).not.toContain("CREATE POLICY v4_vendor_read_pos");
  });

  it("recreates v4_pos_insert WITHOUT the vendor INSERT branch", () => {
    expect(sql).toContain("CREATE POLICY v4_pos_insert ON public.purchase_orders FOR INSERT");
    const block = sql.slice(sql.indexOf("CREATE POLICY v4_pos_insert"), sql.indexOf("CREATE POLICY v4_pos_insert") + 400);
    expect(block).not.toContain("is_vendor()");
  });

  it("force-stamps requested_by to auth.uid() on INSERT (spoof-proof)", () => {
    expect(sql).toContain("po_stamp_requested_by");
    expect(sql).toContain("new.requested_by := coalesce(auth.uid(), new.requested_by);");
    expect(sql).toContain("CREATE TRIGGER trg_po_stamp_requested_by");
  });

  it("enforces approver != requester for PO and change_order approvals", () => {
    expect(sql).toContain("requester cannot approve their own purchase order");
    expect(sql).toContain("requester cannot approve their own change order");
    expect(sql).toContain("new.requested_by = auth.uid()");
    expect(sql).toContain("new.raised_by = auth.uid()");
  });

  it("stamps approved_by / approved_at on PO approval", () => {
    expect(sql).toContain("if new.status = 'approved'");
    expect(sql).toContain("new.approved_by := coalesce(auth.uid(), new.approved_by);");
    expect(sql).toContain("new.approved_at := coalesce(new.approved_at, now());");
  });

  it("scopes vendor quote submission to the caller's own vendor row", () => {
    expect(sql).toContain("vendor_id in (");
    expect(sql).toContain("select id from public.vendors");
    expect(sql).toContain("profile_id = auth.uid()");
  });

  it("surfaces the approval trail in org_purchase_orders()", () => {
    expect(sql).toContain("requested_by uuid, requested_by_name text,");
    expect(sql).toContain("approved_by uuid, approved_by_name text, approved_at timestamptz");
  });
});