// SiteTrack Pro — DPR view pure-helper tests (sorting + detail formatting).
//
// sortByStatus / sortByDate (DPRHistoryView) and outcomeVisual / fmtDateTime
// (DPRDetailView) are extracted pure functions — test them without the
// component or a Supabase runtime.

import { describe, it, expect } from "vitest";
import { sortByStatus, sortByDate, STATUS_ORDER } from "@/features/dpr/DPRHistoryView";
import { outcomeVisual, fmtDateTime } from "@/features/dpr/DPRDetailView";
import type { DprMessageRow } from "@/app/dprQueries";

const row = (status: DprMessageRow["status"], createdAt: string): DprMessageRow =>
  ({
    id: "1",
    orgId: "o1",
    projectId: null,
    transcript: null,
    voiceUrl: null,
    voiceSha256: null,
    photoUrl: null,
    photoTakenAt: null,
    lat: null,
    lon: null,
    photoAccuracyMetres: null,
    status,
    promoterPhone: "+919000000000",
    supervisorName: null,
    language: "te",
    clientToken: "",
    attempts: 0,
    failureReason: null,
    metaMessageId: null,
    buildnowAnchorUrl: null,
    buildnowAnchorHash: null,
    buildnowSyncedAt: null,
    createdAt,
    sentAt: null,
  }) as DprMessageRow;

describe("STATUS_ORDER", () => {
  it("orders queued(0) < sending(1) < sent(2) < delivered(3) < read(4) < failed(5)", () => {
    const order = ["queued", "sending", "sent", "delivered", "read", "failed"] as const;
    const mapped = order.map(s => STATUS_ORDER[s]);
    expect(mapped).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("sortByStatus", () => {
  it("sorts ascending by numeric order: queued first, failed last", () => {
    const rows = [
      { id: "queued", status: "queued" as const, createdAt: "t" },
      { id: "failed", status: "failed" as const, createdAt: "t" },
      { id: "sent", status: "sent" as const, createdAt: "t" },
    ].map(r => row(r.status, r.createdAt));
    const sorted = [...rows].sort(sortByStatus);
    expect(sorted.map(r => r.status)).toEqual(["queued", "sent", "failed"]);
  });

  it("is stable for equal statuses (keeps input order)", () => {
    const a = row("sent", "2026-08-06T01:00:00");
    const b = row("sent", "2026-08-06T02:00:00");
    expect(sortByStatus(a, b)).toBe(0);
  });
});

describe("sortByDate", () => {
  it("sorts newest first", () => {
    const older = row("sent", "2026-08-06T01:00:00");
    const newer = row("sent", "2026-08-06T02:00:00");
    expect(sortByDate(older, newer)).toBeGreaterThan(0);
    expect(sortByDate(newer, older)).toBeLessThan(0);
  });

  it("returns 0 for equal dates", () => {
    const a = row("sent", "2026-08-06T02:00:00");
    const b = row("sent", "2026-08-06T02:00:00");
    expect(sortByDate(a, b)).toBe(0);
  });
});

describe("outcomeVisual", () => {
  it("maps success → success tint, failed → error tint", () => {
    expect(outcomeVisual("success")).toBe("text-success");
    expect(outcomeVisual("failed")).toBe("text-error");
  });
  it("maps any retry/pending outcome → neutral", () => {
    expect(outcomeVisual("retry")).toBe("text-fg-secondary");
    expect(outcomeVisual("retry")).toBe("text-fg-secondary");
  });
});

describe("fmtDateTime", () => {
  it("formats a valid ISO datetime to a short local string", () => {
    const out = fmtDateTime("2026-08-06T12:30:00.000Z");
    expect(out).not.toBe("2026-08-06T12:30:00.000Z");
    expect(out).toMatch(/Aug/i);
  });
  it("returns the raw string for an invalid date", () => {
    expect(fmtDateTime("not-a-date")).toBe("not-a-date");
  });
});