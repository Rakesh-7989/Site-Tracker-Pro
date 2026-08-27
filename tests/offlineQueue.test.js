// SiteTrack Pro — Sprint 2 (Session 30.3): offlineQueue tests.
//
// Uses the in-memory adapter (makeMemoryAdapter) so tests don't need a
// real IndexedDB. Exercises enqueue/drain/retry/GC/queueDepth.

import { describe, it, expect } from "vitest";

import {
  SUPPORTED_KINDS,
  nextRetryDelay,
  isStaleFailed,
  makeMemoryAdapter,
  enqueue,
  drain,
  queueDepth,
  clearAll,
} from "../src/lib/platform/offlineQueue";

describe("offlineQueue — constants + pure helpers", () => {
  it("supports 3 kinds: dpr / voice / photo", () => {
    expect(SUPPORTED_KINDS).toEqual(["dpr", "voice", "photo"]);
  });

  it("nextRetryDelay returns the 5-step exponential schedule", () => {
    expect(nextRetryDelay(0)).toBe(1_000);
    expect(nextRetryDelay(1)).toBe(4_000);
    expect(nextRetryDelay(2)).toBe(16_000);
    expect(nextRetryDelay(3)).toBe(64_000);
    expect(nextRetryDelay(4)).toBe(256_000);
  });

  it("nextRetryDelay returns null when exhausted", () => {
    expect(nextRetryDelay(5)).toBeNull();
    expect(nextRetryDelay(99)).toBeNull();
  });

  it("nextRetryDelay handles negative input", () => {
    expect(nextRetryDelay(-1)).toBe(1_000);
  });

  it("isStaleFailed only matches status=failed AND age > 7 days", () => {
    const now = Date.now();
    expect(isStaleFailed({ status: "failed", created_at: now - 8 * 24 * 60 * 60 * 1000 }, now)).toBe(true);
    expect(isStaleFailed({ status: "failed", created_at: now - 1 * 24 * 60 * 60 * 1000 }, now)).toBe(false);
    expect(isStaleFailed({ status: "pending", created_at: now - 10 * 24 * 60 * 60 * 1000 }, now)).toBe(false);
    expect(isStaleFailed({ status: "sent", created_at: now - 10 * 24 * 60 * 60 * 1000 }, now)).toBe(false);
    expect(isStaleFailed(null, now)).toBe(false);
  });
});

describe("enqueue() + queueDepth()", () => {
  it("adds a pending item", async () => {
    const adapter = makeMemoryAdapter();
    const id = await enqueue({ key: "k1", payload: { x: 1 }, kind: "dpr" }, adapter);
    expect(typeof id).toBe("string");
    const item = await adapter.get(id);
    expect(item.status).toBe("pending");
    expect(item.retry_count).toBe(0);
    expect(item.kind).toBe("dpr");
    expect(item.payload).toEqual({ x: 1 });
  });

  it("rejects unsupported kind", async () => {
    const adapter = makeMemoryAdapter();
    await expect(enqueue({ key: "k1", payload: {}, kind: "unknown" }, adapter)).rejects.toThrow();
  });

  it("rejects missing key", async () => {
    const adapter = makeMemoryAdapter();
    await expect(enqueue({ key: null, payload: {}, kind: "dpr" }, adapter)).rejects.toThrow();
  });

  it("queueDepth aggregates by kind + status", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    await enqueue({ key: "2", payload: {}, kind: "dpr" }, adapter);
    await enqueue({ key: "3", payload: {}, kind: "voice" }, adapter);
    const depth = await queueDepth(adapter);
    expect(depth.total).toBe(3);
    expect(depth.by_kind.dpr).toBe(2);
    expect(depth.by_kind.voice).toBe(1);
    expect(depth.by_status.pending).toBe(3);
  });
});

describe("drain() — happy path", () => {
  it("noop when offline", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    const stats = await drain({ online: false, send: async () => ({ ok: true }) }, adapter);
    expect(stats).toEqual({ sent: 0, failed: 0, deferred: 0, gc: 0 });
  });

  it("sends all pending items when send always succeeds", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "1", payload: { a: 1 }, kind: "dpr" }, adapter);
    await enqueue({ key: "2", payload: { a: 2 }, kind: "voice" }, adapter);
    let calls = 0;
    const stats = await drain(
      { online: true, send: async () => { calls++; return { ok: true }; } },
      adapter,
    );
    expect(calls).toBe(2);
    expect(stats.sent).toBe(2);
    expect(stats.failed).toBe(0);
    expect(stats.deferred).toBe(0);
    const all = await adapter.list();
    expect(all.every(i => i.status === "sent")).toBe(true);
  });

  it("retries failed items (defers) up to max retry count, then marks failed", async () => {
    const adapter = makeMemoryAdapter();
    const id = await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    const sendFail = async () => ({ ok: false, error: "network down" });

    // Simulate 5 drain cycles with bypassed retry windows by mutating
    // last_attempt_at backwards.
    for (let cycle = 0; cycle < 6; cycle++) {
      // Force the item's last_attempt_at far enough back to be eligible.
      const item = await adapter.get(id);
      if (item) await adapter.update(id, { last_attempt_at: 0 });
      await drain({ online: true, send: sendFail }, adapter);
    }
    const final = await adapter.get(id);
    expect(final.status).toBe("failed");
    expect(final.retry_count).toBeGreaterThanOrEqual(5);
    expect(final.last_error).toBe("network down");
  });

  it("defers items not yet past retry window", async () => {
    const adapter = makeMemoryAdapter();
    const id = await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    // Mark item as already retried once with last_attempt_at=now.
    await adapter.update(id, { retry_count: 1, last_attempt_at: Date.now(), status: "pending" });
    let calls = 0;
    await drain({ online: true, send: async () => { calls++; return { ok: true }; } }, adapter);
    expect(calls).toBe(0);
  });

  it("garbage-collects stale failed items", async () => {
    const adapter = makeMemoryAdapter();
    const oldId = await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    await adapter.update(oldId, {
      status: "failed",
      created_at: Date.now() - 8 * 24 * 60 * 60 * 1000,   // 8 days ago
    });
    const stats = await drain({ online: true, send: async () => ({ ok: true }) }, adapter);
    expect(stats.gc).toBe(1);
    const remaining = await adapter.list();
    expect(remaining.length).toBe(0);
  });

  it("catches send-fn exceptions without crashing drain", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    const stats = await drain(
      { online: true, send: async () => { throw new Error("boom"); } },
      adapter,
    );
    // First failure ? deferred (retry < MAX), not failed yet
    expect(stats.failed + stats.deferred).toBe(1);
  });
});

describe("clearAll()", () => {
  it("removes every item and returns count", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "1", payload: {}, kind: "dpr" }, adapter);
    await enqueue({ key: "2", payload: {}, kind: "voice" }, adapter);
    const removed = await clearAll(adapter);
    expect(removed).toBe(2);
    const depth = await queueDepth(adapter);
    expect(depth.total).toBe(0);
  });
});
