import { describe, it, expect } from "vitest";
import { getDprMessage, listDprDeliveryLog, listDprMessages, getBuildnowAnchor } from "@/app/dprQueries";

/* eslint-disable @typescript-eslint/no-explicit-any */
const row = {
  id: "11111111-1111-1111-1111-111111111111",
  org_id: "org-1",
  project_id: null,
  transcript_text: "slab pour ayindi",
  voice_audio_url: "https://cdn/v.webm",
  voice_audio_sha256: "ab".repeat(32),
  photo_url: "https://cdn/p.webp",
  photo_taken_at: "2026-08-06T06:00:00.000Z",
  photo_lat: 17.412346,
  photo_lon: 78.456789,
  photo_accuracy_metres: 12,
  status: "sent",
  promoter_phone_e164: "+919876543210",
  supervisor: { name: "Ravi" },
  language: "te",
  client_token: "22222222-2222-2222-2222-222222222222",
  attempts: 2,
  failure_reason: null,
  meta_message_id: "wamid.xyz",
  buildnow_anchor_url: null,
  buildnow_anchor_hash: null,
  buildnow_synced_at: null,
  created_at: "2026-08-06T05:30:00.000Z",
  sent_at: "2026-08-06T05:31:00.000Z",
};

function client(result: any): any {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => chain,
    then: (onF: any, onR: any) => Promise.resolve(result).then(onF, onR),
    catch: (onR: any) => Promise.resolve(result).catch(onR),
  };
  return { from: () => chain };
}

describe("getDprMessage", () => {
  it("maps a full row (camelCase + extra detail fields)", async () => {
    const res = await getDprMessage(client({ data: row, error: null }), "org-1", row.id);
    expect(res.ok && res.data).toMatchObject({
      id: row.id, orgId: "org-1", status: "sent", promoterPhone: "+919876543210",
      voiceSha256: "ab".repeat(32), photoTakenAt: "2026-08-06T06:00:00.000Z",
      lat: 17.412346, lon: 78.456789, attempts: 2, failureReason: null, metaMessageId: "wamid.xyz",
      supervisorName: "Ravi", transcript: "slab pour ayindi",
    });
  });

  it("returns null for a missing row and surfaces errors", async () => {
    expect(await getDprMessage(client({ data: null, error: null }), "org-1", "x")).toEqual({ ok: true, data: null });
    expect(await getDprMessage(client({ data: null, error: { message: "boom" } }), "org-1", "x"))
      .toEqual({ ok: false, error: "boom" });
  });
});

describe("listDprMessages", () => {
  it("maps rows + coerces nullable fields", async () => {
    const res = await listDprMessages(client({ data: [row], error: null }), "org-1");
    expect(res.ok && res.data?.length).toBe(1);
    expect(res.ok && res.data?.[0]).toMatchObject({ projectId: null, transcript: "slab pour ayindi", buildnowAnchorHash: null });
  });
});

describe("listDprDeliveryLog", () => {
  it("orders attempts and maps all fields", async () => {
    const data = [
      { id: "a", dpr_message_id: "m", attempt_number: 1, attempted_at: "2026-08-06T05:31:00Z", outcome: "retry", duration_ms: 500, status_code: null, error_code: "timeout", error_detail: "slow" },
      { id: "b", dpr_message_id: "m", attempt_number: 2, attempted_at: "2026-08-06T05:31:02Z", outcome: "success", duration_ms: 300, status_code: 200, error_code: null, error_detail: null },
    ];
    const res = await listDprDeliveryLog(client({ data, error: null }), "m");
    expect(res.ok && res.data).toEqual([
      { id: "a", dprMessageId: "m", attemptNumber: 1, attemptedAt: "2026-08-06T05:31:00Z", outcome: "retry", durationMs: 500, statusCode: null, errorCode: "timeout", errorDetail: "slow" },
      { id: "b", dprMessageId: "m", attemptNumber: 2, attemptedAt: "2026-08-06T05:31:02Z", outcome: "success", durationMs: 300, statusCode: 200, errorCode: null, errorDetail: null },
    ]);
  });

  it("surfaces query errors", async () => {
    expect(await listDprDeliveryLog(client({ data: null, error: { message: "nope" } }), "m"))
      .toEqual({ ok: false, error: "nope" });
  });
});

describe("getBuildnowAnchor", () => {
  const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

  it("maps the latest snapshot to badge metadata shape", async () => {
    const res = await getBuildnowAnchor(rpcClient({
      data: [{ buildnow_project_id: "BN-1", approval_status: "approved", current_stage: "phase_progress_report", fetched_at: "2026-08-06T05:00:00Z", anchor_hash: "abc" }],
      error: null,
    }), "proj-1");
    expect(res).toEqual({ ok: true, data: { approval_status: "approved", fetched_at: "2026-08-06T05:00:00Z" } });
  });

  it("returns null when no snapshot exists and surfaces errors", async () => {
    expect(await getBuildnowAnchor(rpcClient({ data: null, error: null }), "proj-1")).toEqual({ ok: true, data: null });
    expect(await getBuildnowAnchor(rpcClient({ data: null, error: { message: "denied" } }), "proj-1"))
      .toEqual({ ok: false, error: "denied" });
  });
});
