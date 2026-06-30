// SiteTrack Pro — Sprint 2 (Session 30.9) photoStorage tests.
//
// Pure-function tests for the photo pipeline. EXIF parsing tested with a
// crafted minimal JPEG; rest uses the mock storage adapter so no Supabase
// hit.

import { describe, it, expect } from "vitest";

import {
  HYDERABAD_BBOX,
  MAX_PHOTO_BYTES,
  DEFAULT_THUMB_MAX_DIM,
  validateGeotag,
  computePhotoSha256,
  extractExif,
  uploadPhoto,
  makeMockStorageAdapter,
  generateThumbnail,
} from "../src/lib/photoStorage.js";

describe("constants", () => {
  it("HYDERABAD_BBOX covers GHMC + outer ring", () => {
    expect(HYDERABAD_BBOX.latMin).toBeLessThan(17.4);   // Banjara Hills is ~17.41
    expect(HYDERABAD_BBOX.latMax).toBeGreaterThan(17.4);
    expect(HYDERABAD_BBOX.lonMin).toBeLessThan(78.4);   // Banjara Hills is ~78.43
    expect(HYDERABAD_BBOX.lonMax).toBeGreaterThan(78.4);
  });

  it("MAX_PHOTO_BYTES = 5 MB (pre-compression input cap)", () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });

  it("DEFAULT_THUMB_MAX_DIM = 640", () => {
    expect(DEFAULT_THUMB_MAX_DIM).toBe(640);
  });
});

describe("validateGeotag()", () => {
  it("rejects missing lat/lon", () => {
    expect(validateGeotag(null).ok).toBe(false);
    expect(validateGeotag({}).ok).toBe(false);
    expect(validateGeotag({ lat: 17.4 }).ok).toBe(false);
    expect(validateGeotag({ lon: 78.4 }).ok).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(validateGeotag({ lat: "17.4", lon: 78.4 }).ok).toBe(false);
    expect(validateGeotag({ lat: NaN, lon: 78.4 }).ok).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(validateGeotag({ lat: 91, lon: 78.4 }).reason).toMatch(/Latitude/);
    expect(validateGeotag({ lat: -91, lon: 78.4 }).reason).toMatch(/Latitude/);
    expect(validateGeotag({ lat: 17.4, lon: 181 }).reason).toMatch(/Longitude/);
    expect(validateGeotag({ lat: 17.4, lon: -181 }).reason).toMatch(/Longitude/);
  });

  it("rejects 0,0 dropout signature", () => {
    expect(validateGeotag({ lat: 0, lon: 0 }).ok).toBe(false);
    expect(validateGeotag({ lat: 0, lon: 0 }).reason).toMatch(/dropout/);
  });

  it("accepts Hyderabad coordinates without warning", () => {
    const banjaraHills = validateGeotag({ lat: 17.412, lon: 78.43 });
    expect(banjaraHills.ok).toBe(true);
    expect(banjaraHills.warning).toBeUndefined();
  });

  it("accepts but warns on non-Hyderabad coordinates", () => {
    const bengaluru = validateGeotag({ lat: 12.97, lon: 77.59 });
    expect(bengaluru.ok).toBe(true);
    expect(bengaluru.warning).toMatch(/outside Hyderabad bbox/);
    const delhi = validateGeotag({ lat: 28.6, lon: 77.2 });
    expect(delhi.ok).toBe(true);
    expect(delhi.warning).toBeDefined();
  });

  it("treats edge cases of the bbox as inside", () => {
    expect(validateGeotag({ lat: HYDERABAD_BBOX.latMin, lon: HYDERABAD_BBOX.lonMin }).warning).toBeUndefined();
    expect(validateGeotag({ lat: HYDERABAD_BBOX.latMax, lon: HYDERABAD_BBOX.lonMax }).warning).toBeUndefined();
  });
});

describe("computePhotoSha256()", () => {
  it("returns 64-char hex", async () => {
    const h = await computePhotoSha256(new Uint8Array([1, 2, 3, 4, 5]));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const a = await computePhotoSha256(new Uint8Array([10, 20, 30]));
    const b = await computePhotoSha256(new Uint8Array([10, 20, 30]));
    expect(a).toBe(b);
  });

  it("differs for different bytes", async () => {
    const a = await computePhotoSha256(new Uint8Array([1, 2, 3]));
    const b = await computePhotoSha256(new Uint8Array([1, 2, 4]));
    expect(a).not.toBe(b);
  });

  it("rejects non-bytes input", async () => {
    await expect(computePhotoSha256(42)).rejects.toThrow();
    await expect(computePhotoSha256("string")).rejects.toThrow();
  });
});

describe("extractExif()", () => {
  it("returns null for non-JPEG input", async () => {
    expect(await extractExif(new Uint8Array([0, 0, 0, 0]))).toBeNull();
  });

  it("returns null for tiny inputs", async () => {
    expect(await extractExif(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("returns null for JPEG without EXIF segment", async () => {
    // Minimal JPEG: SOI + EOI only
    expect(await extractExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
  });

  it("returns null on unrecognised input shape", async () => {
    expect(await extractExif(null)).toBeNull();
    expect(await extractExif(undefined)).toBeNull();
    expect(await extractExif("not-bytes")).toBeNull();
  });
});

describe("generateThumbnail()", () => {
  it("returns original blob when OffscreenCanvas unavailable (Node test env)", async () => {
    // In Node test env, OffscreenCanvas is undefined → passthrough
    const blob = { size: 1234 };
    const result = await generateThumbnail(blob, 800);
    expect(result.blob).toBe(blob);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });
});

describe("makeMockStorageAdapter()", () => {
  it("captures uploads + returns synthetic URL", async () => {
    const a = makeMockStorageAdapter();
    const blob = new Blob(["hello"]);
    const res = await a.put("dpr", "path/to/file.jpg", blob);
    expect(res.ok).toBe(true);
    expect(res.url).toBe("mock://dpr/path/to/file.jpg");
    expect(a.captures.get("dpr/path/to/file.jpg")).toBe(blob);
  });
});

describe("uploadPhoto()", () => {
  it("rejects missing inputs", async () => {
    expect((await uploadPhoto(null, { bucket: "x", orgId: "y", adapter: {} })).ok).toBe(false);
    expect((await uploadPhoto(new Blob(["x"]), {})).ok).toBe(false);
  });

  it("rejects oversized photos", async () => {
    const big = { size: MAX_PHOTO_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) };
    const adapter = makeMockStorageAdapter();
    const result = await uploadPhoto(big, { bucket: "dpr", orgId: "org1", adapter });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/);
  });

  it("rejects photos without geotag when requireGeotag=true (default)", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    const adapter = makeMockStorageAdapter();
    const result = await uploadPhoto(blob, { bucket: "dpr", orgId: "org1", adapter });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Geotag rejected/);
    // sha256 is computed after geotag check, so it won't be present on rejection
    expect(result.sha256).toBeUndefined();
  });

  it("accepts photos without geotag when requireGeotag=false", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    const adapter = makeMockStorageAdapter();
    const result = await uploadPhoto(blob, {
      bucket: "dpr",
      orgId: "org1",
      adapter,
      requireGeotag: false,
    });
    expect(result.ok).toBe(true);
    expect(result.url).toMatch(/^mock:\/\/dpr\/org1\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{64}\.webp$/);
  });

  it("returns sha256 + path keyed by orgId + date + hash", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    const adapter = makeMockStorageAdapter();
    const result = await uploadPhoto(blob, {
      bucket: "dpr",
      orgId: "my-org",
      adapter,
      requireGeotag: false,
    });
    expect(result.ok).toBe(true);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.url).toContain("my-org/");
    expect(result.url).toContain(result.sha256);
  });

  it("captures storage failure", async () => {
    const failingAdapter = { put: async () => ({ ok: false, error: "storage offline" }) };
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    const result = await uploadPhoto(blob, {
      bucket: "dpr",
      orgId: "org1",
      adapter: failingAdapter,
      requireGeotag: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Upload failed/);
  });
});
