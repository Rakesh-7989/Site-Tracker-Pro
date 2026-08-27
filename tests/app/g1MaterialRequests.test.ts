// SiteTrack Pro — v4 Phase G1: material requests + GRN chain pure helpers + query mappers.

import { describe, it, expect } from "vitest";
import {
  listMaterialRequests, createMaterialRequest, setMaterialRequestStatus, deleteMaterialRequest,
  requestTotals, isOpenRequest, REQUEST_NEXT, REQUEST_STATUS_LABEL,
  type MaterialRequest, type RequestStatus,
} from "@/app/queries/materialRequestQueries";

const req = (status: RequestStatus, qty = 1): MaterialRequest => ({
  id: "x", item: "Cement", unit: "bag", qty, needDate: null, reason: null, status,
  requestedByName: "Ravi", approvedByName: null, poId: null, notes: null, createdAt: "",
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (result: { data?: unknown; error?: unknown }): any => {
  const chain = {
    select: () => chain, insert: () => chain, update: () => chain, delete: () => chain,
    single: async () => result, eq: () => chain, order: async () => result,
  };
  return { from: () => chain };
};

describe("pure request helpers", () => {
  it("REQUEST_NEXT walks the requested→approved→ordered→received ladder", () => {
    expect(REQUEST_NEXT.requested).toBe("approved");
    expect(REQUEST_NEXT.approved).toBe("ordered");
    expect(REQUEST_NEXT.ordered).toBe("received");
    expect(REQUEST_NEXT.received).toBeNull();
  });
  it("REQUEST_STATUS_LABEL labels every status", () => {
    expect(REQUEST_STATUS_LABEL.requested).toBe("Requested");
    expect(REQUEST_STATUS_LABEL.received).toBe("Received");
  });
  it("isOpenRequest true for pre-delivery statuses only", () => {
    expect(isOpenRequest("requested")).toBe(true);
    expect(isOpenRequest("approved")).toBe(true);
    expect(isOpenRequest("ordered")).toBe(true);
    expect(isOpenRequest("received")).toBe(false);
  });
  it("requestTotals buckets by status and computes open", () => {
    const t = requestTotals([req("requested"), req("requested"), req("approved"), req("ordered"), req("received")]);
    expect(t).toMatchObject({ total: 5, requested: 2, approved: 1, ordered: 1, received: 1, open: 4 });
  });
  it("requestTotals empty", () => {
    expect(requestTotals([])).toMatchObject({ total: 0, requested: 0, approved: 0, ordered: 0, received: 0, open: 0 });
  });
});

describe("query mappers", () => {
  it("listMaterialRequests maps fields + joins names + coerces qty", async () => {
    const r = await listMaterialRequests(from({ data: [
      { id: "1", item: "Cement", unit: "bag", qty: "50", need_date: "2026-08-20", reason: "slab", status: "approved", requested_by: { name: "Ravi" }, approved_by: null, po_id: null, notes: null, created_at: "2026-08-10T00:00:00" },
      { id: "2", item: "Sand", unit: null, qty: 10, need_date: null, reason: null, status: "unknown", requested_by: null, approved_by: { name: "PM" }, po_id: "po1", notes: "n", created_at: null },
    ], error: null }), "proj");
    expect(r.ok && r.data).toMatchObject([
      { id: "1", item: "Cement", unit: "bag", qty: 50, needDate: "2026-08-20", reason: "slab", status: "approved", requestedByName: "Ravi", approvedByName: null, poId: null, notes: null },
      { id: "2", item: "Sand", unit: null, qty: 10, needDate: null, reason: null, status: "requested", requestedByName: null, approvedByName: "PM", poId: "po1", notes: "n" },
    ]);
  });
  it("listMaterialRequests surfaces errors", async () => {
    const r = await listMaterialRequests(from({ data: null, error: { message: "nope" } }), "proj");
    expect(r).toEqual({ ok: false, error: "nope" });
  });
  it("createMaterialRequest inserts body with requested default", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client: any = {
      from: () => {
        const chain = {
          insert: (row: unknown) => { inserted = row as Record<string, unknown>; return chain; },
          select: () => chain, single: async () => ({ data: { id: "new" }, error: null }), eq: () => chain, order: () => chain,
        };
        return chain;
      },
    };
    const r = await createMaterialRequest(client, { projectId: "proj", item: "Cement", unit: "bag", qty: 50, needDate: "2026-08-20", reason: "slab" });
    expect(r.ok && r.data?.id).toBe("new");
    expect(inserted).toMatchObject({ project_id: "proj", item: "Cement", unit: "bag", qty: 50, status: "requested", need_date: "2026-08-20", reason: "slab" });
  });
  it("setMaterialRequestStatus updates status + stamps approved_by only on approve", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let patch: any = null;
    const client: any = { from: () => ({ update: (p: unknown) => { patch = p as Record<string, unknown>; return { eq: async () => ({ data: null, error: null }) }; } }) };
    await setMaterialRequestStatus(client, "1", "approved", "u1");
    expect(patch).toMatchObject({ status: "approved", approved_by: "u1" });
    await setMaterialRequestStatus(client, "1", "ordered", "u1");
    expect(patch).toMatchObject({ status: "ordered" });
    expect(patch?.approved_by).toBeUndefined();
  });
  it("setMaterialRequestStatus surfaces errors", async () => {
    const client: any = { from: () => ({ update: () => ({ eq: async () => ({ data: null, error: { message: "denied" } }) }) }) };
    const r = await setMaterialRequestStatus(client, "1", "approved", "u1");
    expect(r).toEqual({ ok: false, error: "denied" });
  });
  it("deleteMaterialRequest surfaces errors", async () => {
    const client: any = { from: () => ({ delete: () => ({ eq: async () => ({ data: null, error: { message: "gone" } }) }) }) };
    const r = await deleteMaterialRequest(client, "1");
    expect(r).toEqual({ ok: false, error: "gone" });
  });
});
