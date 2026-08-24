// Unit tests for the canonical offline sync engine (src/lib/offlineQueue.ts).
//
// Locks the status machine (pending → sending → sent/failed), retry
// backoff, stale-failed GC, kind whitelist, queue-depth buckets, and the
// memory-adapter semantics — using makeMemoryAdapter() so no IndexedDB is
// required in Node.

import { describe, expect, it, vi } from "vitest";
import {
  clearAll,
  drain,
  enqueue,
  isStaleFailed,
  makeMemoryAdapter,
  nextRetryDelay,
  queueDepth,
  SUPPORTED_KINDS,
  type QueueItem,
} from "@/lib/offlineQueue";

const DAY = 24 * 60 * 60 * 1000;

function item(partial: Partial<QueueItem>): QueueItem {
  return {
    id: "x",
    key: "k",
    kind: "dpr",
    payload: {},
    status: "pending",
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...partial,
  };
}

describe("nextRetryDelay", () => {
  it("exposes the escalating backoff table", () => {
    expect(nextRetryDelay(0)).toBe(1_000);
    expect(nextRetryDelay(1)).toBe(4_000);
    expect(nextRetryDelay(2)).toBe(16_000);
    expect(nextRetryDelay(3)).toBe(64_000);
    expect(nextRetryDelay(4)).toBe(256_000);
  });

  it("returns null when retries are exhausted and clamps negatives to first delay", () => {
    expect(nextRetryDelay(5)).toBeNull();
    expect(nextRetryDelay(99)).toBeNull();
    expect(nextRetryDelay(-1)).toBe(1_000);
  });
});

describe("isStaleFailed", () => {
  it("flags only failed items older than 7 days", () => {
    const now = Date.now();
    expect(isStaleFailed(item({ status: "failed", created_at: now - 8 * DAY }), now)).toBe(true);
    expect(isStaleFailed(item({ status: "failed", created_at: now - 6 * DAY }), now)).toBe(false);
    expect(isStaleFailed(item({ status: "sent", created_at: now - 30 * DAY }), now)).toBe(false);
    expect(isStaleFailed(null, now)).toBe(false);
  });
});

describe("enqueue", () => {
  it("creates a pending item with zero retries", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "tok-1", payload: { a: 1 }, kind: "dpr" }, adapter);
    const all = await adapter.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ key: "tok-1", kind: "dpr", status: "pending", retry_count: 0, last_error: null });
  });

  it("rejects an empty key and unsupported kinds", async () => {
    const adapter = makeMemoryAdapter();
    await expect(enqueue({ key: "", payload: {}, kind: "dpr" }, adapter)).rejects.toThrow("key is required");
    await expect(enqueue({ key: "k", payload: {}, kind: "invoice" }, adapter)).rejects.toThrow("unsupported kind");
    expect(await adapter.list()).toHaveLength(0);
  });

  it("whitelists exactly dpr/voice/photo", () => {
    expect(SUPPORTED_KINDS).toEqual(["dpr", "voice", "photo"]);
  });
});

describe("drain", () => {
  it("no-ops when offline", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "k1", payload: {}, kind: "dpr" }, adapter);
    const send = vi.fn(async () => ({ ok: true }));
    const res = await drain({ online: false, send }, adapter);
    expect(res).toEqual({ sent: 0, failed: 0, deferred: 0, gc: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("requires a send function when online", async () => {
    const adapter = makeMemoryAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(drain({ online: true, send: undefined as any }, adapter)).rejects.toThrow("send is required");
  });

  it("marks sent on success and clears last_error", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "k1", payload: { p: 1 }, kind: "dpr" }, adapter);
    const seen: unknown[] = [];
    const res = await drain({ online: true, send: async i => { seen.push(i.payload); return { ok: true }; } }, adapter);
    expect(res.sent).toBe(1);
    const all = await adapter.list();
    expect(all[0]).toMatchObject({ status: "sent", retry_count: 0, last_error: null });
    expect(seen).toEqual([{ p: 1 }]);
  });

  it("retries with backoff and exhausts to failed after MAX_RETRY_COUNT", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "k1", payload: {}, kind: "dpr" }, adapter);

    // First attempt fails → back to pending with retry_count 1.
    let res = await drain({ online: true, send: async () => ({ ok: false, error: "boom" }) }, adapter);
    expect(res).toMatchObject({ sent: 0, failed: 0, deferred: 1 });
    let all = await adapter.list();
    expect(all[0]).toMatchObject({ status: "pending", retry_count: 1, last_error: "boom" });

    // Backoff not elapsed → deferred without attempting.
    res = await drain({ online: true, send: async () => ({ ok: true }) }, adapter);
    expect(res.sent).toBe(0);
    expect((await adapter.list())[0].retry_count).toBe(1);

    // Simulate backoff elapsing for every remaining attempt.
    for (let attempt = 2; attempt <= 5; attempt++) {
      await adapter.update(all[0].id, { last_attempt_at: Date.now() - 300_000 });
      res = await drain({ online: true, send: async () => ({ ok: false, error: "boom" }) }, adapter);
    }
    expect(res.failed).toBe(1);
    all = await adapter.list();
    expect(all[0]).toMatchObject({ status: "failed", retry_count: 5 });
  });

  it("recovers an item that succeeds after earlier failures", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "k1", payload: {}, kind: "dpr" }, adapter);
    await drain({ online: true, send: async () => ({ ok: false, error: "boom" }) }, adapter);
    await adapter.update((await adapter.list())[0].id, { last_attempt_at: Date.now() - 300_000 });
    const res = await drain({ online: true, send: async () => ({ ok: true }) }, adapter);
    expect(res.sent).toBe(1);
    expect((await adapter.list())[0]).toMatchObject({ status: "sent", retry_count: 1 });
  });

  it("GCs stale failed items before draining", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "old", payload: {}, kind: "dpr" }, adapter);
    await adapter.update((await adapter.list())[0].id, {
      status: "failed",
      created_at: Date.now() - 8 * DAY,
    });
    const send = vi.fn(async () => ({ ok: true }));
    const res = await drain({ online: true, send }, adapter);
    expect(res.gc).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await adapter.list()).toHaveLength(0);
  });

  it("treats thrown send errors as failures with the message captured", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "k1", payload: {}, kind: "voice" }, adapter);
    const res = await drain(
      { online: true, send: async () => { throw new Error("network down"); } },
      adapter,
    );
    expect(res.deferred).toBe(1);
    expect((await adapter.list())[0]).toMatchObject({ last_error: "network down" });
  });
});

describe("queueDepth + clearAll", () => {
  it("buckets by kind and status", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "a", payload: {}, kind: "dpr" }, adapter);
    await enqueue({ key: "b", payload: {}, kind: "photo" }, adapter);
    await enqueue({ key: "c", payload: {}, kind: "voice" }, adapter);
    await adapter.update((await adapter.list())[1].id, { status: "failed" });
    const depth = await queueDepth(adapter);
    expect(depth.total).toBe(3);
    expect(depth.by_kind).toEqual({ dpr: 1, photo: 1, voice: 1 });
    expect(depth.by_status).toEqual({ pending: 2, failed: 1 });
  });

  it("clearAll removes everything and reports the count", async () => {
    const adapter = makeMemoryAdapter();
    await enqueue({ key: "a", payload: {}, kind: "dpr" }, adapter);
    await enqueue({ key: "b", payload: {}, kind: "dpr" }, adapter);
    expect(await clearAll(adapter)).toBe(2);
    expect(await queueDepth(adapter)).toMatchObject({ total: 0 });
  });
});
