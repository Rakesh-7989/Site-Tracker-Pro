import { describe, it, expect } from "vitest";
import {
  clamp, composeZoom, zoomFromWheel, fitToViewport,
  screenToDrawing, drawingToScreen, zoomAbout,
  buildLayer, canDiff, blendOpacities, pixelDiffers, newViewportState,
} from "../src/lib/drawingDiff.js";

describe("drawingDiff — geometry primitives", () => {
  it("clamp respects bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it("composeZoom multiplies safely and clamps to [0.05, 32]", () => {
    expect(composeZoom(1, 2)).toBe(2);
    expect(composeZoom(1, 0)).toBe(0.05);
    expect(composeZoom(10, 10)).toBe(32);
  });

  it("zoomFromWheel zooms IN on negative deltaY (scroll up)", () => {
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 100)).toBeLessThan(1);
  });
});

describe("drawingDiff — fit + transforms", () => {
  it("fitToViewport returns zoom 1 for matching dimensions", () => {
    const t = fitToViewport(100, 100, 148, 148, 24);
    expect(t.zoom).toBe(1);
    expect(t.panX).toBe(24);
    expect(t.panY).toBe(24);
  });

  it("fitToViewport scales down for big drawings", () => {
    const t = fitToViewport(1000, 500, 248, 248, 24);
    expect(t.zoom).toBeCloseTo(0.2, 5);
  });

  it("fitToViewport handles zero dims gracefully", () => {
    expect(fitToViewport(0, 0, 100, 100).zoom).toBe(1);
  });

  it("screenToDrawing and drawingToScreen are inverse", () => {
    const transform = { zoom: 2, panX: 10, panY: 20 };
    const draw = screenToDrawing(transform, 50, 70);
    const back = drawingToScreen(transform, draw.x, draw.y);
    expect(back.x).toBeCloseTo(50, 6);
    expect(back.y).toBeCloseTo(70, 6);
  });

  it("zoomAbout keeps focal point under cursor", () => {
    const transform = { zoom: 1, panX: 0, panY: 0 };
    const focalX = 100, focalY = 100;
    const next = zoomAbout(transform, focalX, focalY, 2);
    const focalDrawing = screenToDrawing(transform, focalX, focalY);
    const focalAfter = drawingToScreen(next, focalDrawing.x, focalDrawing.y);
    expect(focalAfter.x).toBeCloseTo(focalX, 6);
    expect(focalAfter.y).toBeCloseTo(focalY, 6);
  });
});

describe("drawingDiff — layer model", () => {
  it("buildLayer wraps a drawing row with defaults", () => {
    const d = { id: "d1", revision: "Rev B", released_at: "2026-05-31T10:00:00Z", storage_path: "/x.png" };
    const l = buildLayer(d);
    expect(l.id).toBe("d1");
    expect(l.label.startsWith("Rev B")).toBe(true);
    expect(l.imageUrl).toBe("/x.png");
    expect(l.opacity).toBe(1);
  });

  it("buildLayer accepts overrides", () => {
    const l = buildLayer({ id: "d1" }, { opacity: 0.4, label: "custom" });
    expect(l.opacity).toBe(0.4);
    expect(l.label).toBe("custom");
  });

  it("buildLayer rejects null", () => {
    expect(() => buildLayer(null)).toThrow();
  });
});

describe("drawingDiff — canDiff guards", () => {
  const a = { project_id: "p1", title: "Slab", type: "structural", revision: "Rev A" };

  it("rejects when projects differ", () => {
    const res = canDiff(a, { ...a, project_id: "p2", revision: "Rev B" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("different-projects");
  });

  it("rejects when titles differ", () => {
    const res = canDiff(a, { ...a, title: "Foundation", revision: "Rev B" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("different-titles");
  });

  it("rejects when types differ", () => {
    const res = canDiff(a, { ...a, type: "arch", revision: "Rev B" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("different-types");
  });

  it("rejects when revisions match", () => {
    const res = canDiff(a, { ...a });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("same-revision");
  });

  it("accepts a valid pair", () => {
    const res = canDiff(a, { ...a, revision: "Rev B" });
    expect(res.ok).toBe(true);
  });

  it("is forgiving on case + whitespace in title", () => {
    const res = canDiff(a, { ...a, title: " slab ", revision: "Rev B" });
    expect(res.ok).toBe(true);
  });
});

describe("drawingDiff — blend + pixel diff", () => {
  it("blendOpacities at t=0 shows OLD fully", () => {
    expect(blendOpacities(0)).toEqual({ oldOpacity: 1, newOpacity: 0 });
  });

  it("blendOpacities at t=1 shows NEW fully", () => {
    expect(blendOpacities(1)).toEqual({ oldOpacity: 0, newOpacity: 1 });
  });

  it("blendOpacities at t=0.5 is midway", () => {
    expect(blendOpacities(0.5)).toEqual({ oldOpacity: 0.5, newOpacity: 0.5 });
  });

  it("pixelDiffers returns true for distinct pixels", () => {
    const a = { r: 0, g: 0, b: 0, a: 255 };
    const b = { r: 255, g: 255, b: 255, a: 255 };
    expect(pixelDiffers(a, b)).toBe(true);
  });

  it("pixelDiffers returns false within tolerance", () => {
    const a = { r: 100, g: 100, b: 100, a: 255 };
    const b = { r: 110, g: 110, b: 110, a: 255 };
    expect(pixelDiffers(a, b, 16)).toBe(false);
  });

  it("pixelDiffers handles missing alpha", () => {
    const a = { r: 100, g: 100, b: 100 };
    const b = { r: 100, g: 100, b: 100, a: 255 };
    expect(pixelDiffers(a, b)).toBe(false);
  });

  it("pixelDiffers returns true when either pixel missing", () => {
    expect(pixelDiffers(null, { r: 0, g: 0, b: 0 })).toBe(true);
  });
});

describe("drawingDiff — viewport state", () => {
  it("newViewportState applies defaults", () => {
    const v = newViewportState();
    expect(v.zoom).toBe(1);
    expect(v.opacity).toBe(0.5);
    expect(v.showOnlyDiffs).toBe(false);
  });

  it("newViewportState clamps zoom + opacity", () => {
    const v = newViewportState({ zoom: 100, opacity: 2 });
    expect(v.zoom).toBe(32);
    expect(v.opacity).toBe(1);
  });
});
