// Unit tests for the optimistic-concurrency outcome interpreter.

import { describe, expect, it } from "vitest";
import {
  versionedUpdateOutcome,
  VERSION_CONFLICT_ERROR,
} from "@/lib/versionedUpdate";

describe("versionedUpdateOutcome", () => {
  it("returns success for a plain (unguarded) update result", () => {
    const res = { data: null, error: null };
    expect(versionedUpdateOutcome(res)).toEqual({ ok: true, data: { ok: true } });
  });

  it("returns success when a guarded update matches rows", () => {
    const res = { data: [{ id: "t1" }], error: null };
    expect(versionedUpdateOutcome(res, 3)).toEqual({ ok: true, data: { ok: true } });
  });

  it("flags CONFLICT when a guarded update matches zero rows", () => {
    expect(versionedUpdateOutcome({ data: [], error: null }, 2)).toEqual({
      ok: false,
      error: VERSION_CONFLICT_ERROR,
      conflict: true,
    });
    const r = versionedUpdateOutcome({ data: null, error: null }, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict).toBe(true);
  });

  it("keeps zero-rows NON-conflicting without a guard (legacy semantics)", () => {
    expect(versionedUpdateOutcome({ data: [], error: null })).toEqual({ ok: true, data: { ok: true } });
  });

  it("surfaces builder errors as non-conflict failures", () => {
    const res = { data: null, error: { message: "permission denied" } };
    expect(versionedUpdateOutcome(res, 1)).toEqual({ ok: false, error: "permission denied", conflict: false });
    // undefined message falls back to stringifying the error
    const r = versionedUpdateOutcome({ data: null, error: {} }, 1);
    expect(!r.ok && r.error).toBe(String({}));
  });

  it("treats expectedVersion=0 as an active guard, not 'absent'", () => {
    // 0 is falsy but != null → guard semantics apply.
    const r = versionedUpdateOutcome({ data: [], error: null }, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.conflict).toBe(true);
  });
});
