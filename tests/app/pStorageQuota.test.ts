// SiteTrack Pro — B5 storage quota (P-H) pure-helper + gate-hook tests.
// Pure functions from src/app/storageQuotaQueries.ts + the derived gate
// helpers from src/hooks/useStorageQuota.ts + src/features/shared/StorageUploadGate.tsx.

import { describe, it, expect } from "vitest";
import {
  storageUsed, storageTotal, storagePercent, storageRemaining, type StorageByBucket,
} from "@/app/queries/storageQuotaQueries";
import { quotaAtLimit, bucketAtLimit } from "@/hooks/useStorageQuota";
import { gateFromQuota } from "@/features/shared/StorageUploadGate";

const SAMPLE: StorageByBucket[] = [
  { bucket: "deliverables", used_bytes: 40_000_000, total_bytes: 50_000_000, used_pct: 80 },
  { bucket: "dpr-media", used_bytes: 2_000_000, total_bytes: 15_000_000, used_pct: 13.33 },
  { bucket: "research-docs", used_bytes: 8_000_000, total_bytes: 50_000_000, used_pct: 16 },
];

const AT_LIMIT: StorageByBucket[] = [
  { bucket: "deliverables", used_bytes: 50_000_000, total_bytes: 50_000_000, used_pct: 100 },
  { bucket: "dpr-media", used_bytes: 5_000_000, total_bytes: 15_000_000, used_pct: 33.33 },
  { bucket: "research-docs", used_bytes: 50_000_000, total_bytes: 50_000_000, used_pct: 100 },
];

describe("storage quota pure helpers", () => {
  it("sums used bytes across buckets", () => {
    expect(storageUsed(SAMPLE)).toBe(50_000_000);
    expect(storageUsed([])).toBe(0);
  });

  it("sums total bytes across buckets", () => {
    expect(storageTotal(SAMPLE)).toBe(115_000_000);
    expect(storageTotal([])).toBe(0);
  });

  it("computes weighted percent rounded to whole percent", () => {
    expect(storagePercent(SAMPLE)).toBe(43); // 50/115 = 43.47%
    expect(storagePercent([])).toBe(0);
  });

  it("computes remaining bytes as total - used", () => {
    expect(storageRemaining(SAMPLE)).toBe(65_000_000);
    expect(storageRemaining([])).toBe(0);
  });

  it("returns 0 percent when total is zero", () => {
    expect(storagePercent([{ bucket: "deliverables", used_bytes: 100, total_bytes: 0, used_pct: 0 }])).toBe(0);
  });
});

describe("quota gate helpers", () => {
  it("reports at-quota when overall usage hits 100%", () => {
    const state = {
      loading: false, atQuota: true, pct: 100,
      usedBytes: 105_000_000, totalBytes: 115_000_000, remainingBytes: 10_000_000,
      data: AT_LIMIT,
    };
    expect(quotaAtLimit(state)).toBe(true);
  });

  it("reports not-at-quota below 100%", () => {
    const state = {
      loading: false, atQuota: false, pct: 43,
      usedBytes: 50_000_000, totalBytes: 115_000_000, remainingBytes: 65_000_000,
      data: SAMPLE,
    };
    expect(quotaAtLimit(state)).toBe(false);
  });

  it("detects a hard per-bucket limit even when the overall rollup is under", () => {
    const state = {
      loading: false, atQuota: false, pct: 80,
      usedBytes: 0, totalBytes: 0, remainingBytes: 0,
      data: [
        { bucket: "dpr-media", used_bytes: 15_000_000, total_bytes: 15_000_000, used_pct: 100 },
        { bucket: "deliverables", used_bytes: 1_000_000, total_bytes: 50_000_000, used_pct: 2 },
      ] satisfies StorageByBucket[],
    };
    expect(bucketAtLimit(state)).toBe(true);
  });

  it("ignores zero-cap buckets in the per-bucket check", () => {
    const state = {
      loading: false, atQuota: false, pct: 0,
      usedBytes: 0, totalBytes: 0, remainingBytes: 0,
      data: [
        { bucket: "dpr-media", used_bytes: 10, total_bytes: 0, used_pct: 0 },
        { bucket: "deliverables", used_bytes: 5, total_bytes: 50_000_000, used_pct: 0 },
      ] satisfies StorageByBucket[],
    };
    expect(bucketAtLimit(state)).toBe(false);
  });

  it("derives canUpload from loading + atQuota (fail-open while loading)", () => {
    expect(gateFromQuota({ loading: false, atQuota: false })).toEqual({ loading: false, atQuota: false, canUpload: true });
    expect(gateFromQuota({ loading: false, atQuota: true })).toEqual({ loading: false, atQuota: true, canUpload: false });
    expect(gateFromQuota({ loading: true, atQuota: false })).toEqual({ loading: true, atQuota: false, canUpload: false });
    expect(gateFromQuota({ loading: true, atQuota: true })).toEqual({ loading: true, atQuota: true, canUpload: false });
  });
});