// SiteTrack Pro — v4 D2 drawing-diff pure-helper tests.
// Pure functions only (pairing, raster detection, preview mapping, pixel mask)
// — no client, no canvas. The geometry in drawingDiff.ts is already covered by
// tests/drawingDiff.test.js.

import { describe, it, expect } from "vitest";
import {
  diffPairs, formatKey, isRasterFileName, rasterPathForDrawing,
  diffPixelMask, applyDiffMask, layerForDrawing,
} from "@/lib/drawingDiffPair";
import { drawingObjectPath } from "@/app/queries/drawingFileQueries";
import type { Drawing } from "@/app/queries/designQueries";

function drawing(over: Partial<Drawing>): Drawing {
  return {
    id: "id", projectId: "proj1", title: "Slab", type: "structural",
    revision: "Rev A", status: "current", releaseDate: "2026-08-01",
    storagePath: null, previewUrl: null, designStage: "concept", supersededBy: null,
    ...over,
  };
}

describe("drawingDiffPair — diff pairing", () => {
  it("builds a pair for same title+type with different revisions", () => {
    const pairs = diffPairs([
      drawing({ id: "a", revision: "Rev A", releaseDate: "2026-07-01" }),
      drawing({ id: "b", revision: "Rev B", releaseDate: "2026-08-01" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].old.id).toBe("a");
    expect(pairs[0].newer.id).toBe("b");
  });

  it("returns old before newer by release date", () => {
    const pairs = diffPairs([
      drawing({ id: "new", revision: "Rev B", releaseDate: "2026-08-01" }),
      drawing({ id: "old", revision: "Rev A", releaseDate: "2026-07-01" }),
    ]);
    expect(pairs[0].old.id).toBe("old");
    expect(pairs[0].newer.id).toBe("new");
  });

  it("skips same-revision pairs and cross-title/type pairs", () => {
    const pairs = diffPairs([
      drawing({ id: "a", revision: "Rev A", title: "Slab" }),
      drawing({ id: "b", revision: "Rev A", title: "Slab" }),
      drawing({ id: "c", revision: "Rev B", title: "Foundation" }),
    ]);
    expect(pairs).toHaveLength(0);
  });

  it("is forgiving on title case + whitespace", () => {
    const pairs = diffPairs([
      drawing({ id: "a", title: "Slab", revision: "Rev A" }),
      drawing({ id: "b", title: "  slab ", revision: "Rev B" }),
    ]);
    expect(pairs).toHaveLength(1);
  });

  it("formatKey normalises type+title", () => {
    expect(formatKey("Slab", "Structure")).toBe("structure|slab");
  });
});

describe("drawingDiffPair — raster detection + preview mapping", () => {
  it("detects raster extensions", () => {
    expect(isRasterFileName("plan.png")).toBe(true);
    expect(isRasterFileName("plan.JPG")).toBe(true);
    expect(isRasterFileName("plan.webp")).toBe(true);
    expect(isRasterFileName("plan.pdf")).toBe(false);
    expect(isRasterFileName("plan")).toBe(false);
  });

  it("prefers preview_url when set", () => {
    const d = drawing({ previewUrl: "proj1/preview.png" });
    expect(rasterPathForDrawing(d, [])).toBe("proj1/preview.png");
  });

  it("falls back to the first raster file in the folder", () => {
    const d = drawing({ id: "d1" });
    const files = [
      { name: "notes.pdf", size: 100, updatedAt: null },
      { name: "plan.png", size: 100, updatedAt: null },
    ];
    const path = rasterPathForDrawing(d, files);
    expect(path).toBe(drawingObjectPath("proj1", "d1", "plan.png"));
  });

  it("returns null when no raster exists and no preview set", () => {
    const d = drawing({ previewUrl: null });
    expect(rasterPathForDrawing(d, [{ name: "a.pdf", size: 1, updatedAt: null }])).toBeNull();
  });
});

describe("drawingDiffPair — pixel mask + blend helpers", () => {
  it("marks pixels that differ beyond tolerance", () => {
    const oldPx = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255]);
    const newPx = new Uint8ClampedArray([255, 255, 255, 255, 110, 110, 110, 255]);
    const mask = diffPixelMask(oldPx, newPx, 16);
    expect(mask).toEqual(new Uint8Array([1, 0])); // first differs, second within tolerance
  });

  it("throws on length mismatch", () => {
    expect(() => diffPixelMask(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toThrow();
  });

  it("applyDiffMask makes differing pixels opaque and identical pixels transparent", () => {
    const newPx = new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 0]);
    const mask = new Uint8Array([1, 0]);
    const out = applyDiffMask(mask, newPx);
    expect(out[3]).toBe(255);   // kept + opaque
    expect(out[7]).toBe(0);     // hidden (transparent)
    expect([...out.slice(0, 3)]).toEqual([10, 20, 30]);
  });
});

describe("drawingDiffPair — layer builder", () => {
  it("buildLayer ties a Drawing row to the geometry Layer", () => {
    const d = drawing({ id: "d1", revision: "Rev B", releaseDate: "2026-08-01" });
    const l = layerForDrawing(d, "https://bucket/proj1/d1/plan.png");
    expect(l.id).toBe("d1");
    expect(l.project_id).toBe("proj1");
    expect(l.title).toBe("Slab");
    expect(l.type).toBe("structural");
    expect(l.revision).toBe("Rev B");
    expect(l.imageUrl).toBe("https://bucket/proj1/d1/plan.png");
    expect(l.label).toContain("Rev B");
  });
});