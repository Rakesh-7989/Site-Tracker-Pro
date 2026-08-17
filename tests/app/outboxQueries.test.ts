// SiteTrack Pro — VNext P1.3: event outbox query-layer tests.
import { describe, it, expect } from "vitest";
import {
  OutboxEventType, publishEvent, publishOrgBroadcast,
  OUTBOX_STATUS_LABEL, OUTBOX_STATUS_TONE, isOutboxStatus, outboxStatus,
  mapOutboxRow, outboxRollup,
} from "@/app/outboxQueries";

function mockRpc(impl: any) {
  return { rpc: impl };
}

describe("publishEvent", () => {
  it("calls the publish_event RPC with typed args", async () => {
    const calls: any[] = [];
    const client = mockRpc(async (_fn: string, args: any) => {
      calls.push(args);
      return { data: "evt-1", error: null };
    });
    const res = await publishEvent(client, {
      type: OutboxEventType.CORRECTIVE_ACTION_OPENED,
      orgId: "org-1",
      projectId: "proj-1",
      entityType: "corrective_action",
      entityId: "ca-1",
      payload: { title: "CA opened", body: "action", link: "/x" },
    });
    expect(res.ok).toBe(true);
    expect((res as any).data).toEqual({ eventId: "evt-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      p_type: "corrective_action.opened",
      p_org_id: "org-1",
      p_project_id: "proj-1",
      p_entity_type: "corrective_action",
      p_entity_id: "ca-1",
    });
    expect(calls[0].p_payload).toEqual({ title: "CA opened", body: "action", link: "/x" });
  });

  it("defaults null project/entity args", async () => {
    const calls: any[] = [];
    const client = mockRpc(async (_fn: string, args: any) => {
      calls.push(args);
      return { data: "evt-2", error: null };
    });
    await publishEvent(client, { type: OutboxEventType.ORG_BROADCAST, orgId: "org-1" });
    expect(calls[0]).toMatchObject({
      p_project_id: null,
      p_entity_type: null,
      p_entity_id: null,
    });
    expect(calls[0].p_payload).toEqual({});
  });

  it("surfaces RPC errors", async () => {
    const client = mockRpc(async () => ({ data: null, error: { message: "boom" } }));
    const res = await publishEvent(client, { type: "x", orgId: "org-1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });

  it("surfaces thrown errors", async () => {
    const client = mockRpc(async () => { throw new Error("network"); });
    const res = await publishEvent(client, { type: "x", orgId: "org-1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("network");
  });
});

describe("publishOrgBroadcast", () => {
  it("publishes an org.broadcast event with a link", async () => {
    const calls: any[] = [];
    const client = mockRpc(async (_fn: string, args: any) => {
      calls.push(args);
      return { data: "evt-3", error: null };
    });
    const res = await publishOrgBroadcast(client, "org-9", "invoice_generated", { title: "T", body: "B", link: "/invoices/1" });
    expect(res.ok).toBe(true);
    expect(calls[0].p_type).toBe("org.broadcast");
    expect(calls[0].p_org_id).toBe("org-9");
    expect(calls[0].p_payload).toMatchObject({ title: "T", body: "B", link: "/invoices/1", broadcast_type: "invoice_generated" });
  });
});

describe("status helpers", () => {
  it("labels + tones cover the three statuses", () => {
    expect(OUTBOX_STATUS_LABEL.pending).toBe("Pending");
    expect(OUTBOX_STATUS_LABEL.delivered).toBe("Delivered");
    expect(OUTBOX_STATUS_LABEL.failed).toBe("Failed");
    expect(OUTBOX_STATUS_TONE.pending).toBe("neutral");
    expect(OUTBOX_STATUS_TONE.delivered).toBe("success");
    expect(OUTBOX_STATUS_TONE.failed).toBe("danger");
  });

  it("isOutboxStatus guards the union", () => {
    expect(isOutboxStatus("pending")).toBe(true);
    expect(isOutboxStatus("delivered")).toBe(true);
    expect(isOutboxStatus("failed")).toBe(true);
    expect(isOutboxStatus("wat")).toBe(false);
    expect(isOutboxStatus(null)).toBe(false);
    expect(isOutboxStatus(undefined)).toBe(false);
  });

  it("outboxStatus coerces unknown → pending", () => {
    expect(outboxStatus("delivered")).toBe("delivered");
    expect(outboxStatus("nonsense")).toBe("pending");
    expect(outboxStatus(null)).toBe("pending");
    expect(outboxStatus(undefined)).toBe("pending");
  });
});

describe("mapOutboxRow", () => {
  it("maps a full row", () => {
    const row = mapOutboxRow({
      id: "e1", type: "org.broadcast", org_id: "o1", project_id: null,
      entity_type: null, entity_id: null, status: "pending", attempts: 2,
      error: null, created_at: "2026-08-17T10:00:00Z", delivered_at: null,
    });
    expect(row).toMatchObject({
      id: "e1", type: "org.broadcast", orgId: "o1", projectId: null,
      entityType: null, entityId: null, status: "pending", attempts: 2,
      error: null, deliveredAt: null,
    });
    expect(row.createdAt).toBe("2026-08-17T10:00:00Z");
  });

  it("coerces unknown status + numeric fields", () => {
    const row = mapOutboxRow({
      id: "e2", type: "x", org_id: "o1", project_id: "p1",
      entity_type: "invoice", entity_id: "i1", status: "wat", attempts: null,
      error: "boom", created_at: "t", delivered_at: "d",
    });
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(0);
    expect(row.projectId).toBe("p1");
    expect(row.entityType).toBe("invoice");
    expect(row.entityId).toBe("i1");
    expect(row.error).toBe("boom");
    expect(row.deliveredAt).toBe("d");
  });
});

describe("outboxRollup", () => {
  const mk = (status: any, n = 1) => Array.from({ length: n }, (_, i) =>
    mapOutboxRow({ id: `e${i}`, type: "x", org_id: "o", status }));

  it("counts pending/delivered/failed + delivery %", () => {
    const r = outboxRollup([...mk("delivered", 3), ...mk("pending", 2), ...mk("failed", 1)]);
    expect(r.total).toBe(6);
    expect(r.delivered).toBe(3);
    expect(r.pending).toBe(2);
    expect(r.failed).toBe(1);
    expect(r.deliveryPct).toBe(50);
  });

  it("empty rows → deliveryPct null", () => {
    const r = outboxRollup([]);
    expect(r.total).toBe(0);
    expect(r.deliveryPct).toBe(null);
  });
});
