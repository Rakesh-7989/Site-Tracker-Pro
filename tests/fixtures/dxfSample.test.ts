// SiteTrack Pro — rich DXF fixture validation.
// The real-world-style sample in ./rich-cad-fencing.dxf exercises the shared
// depth features at once: a DASHED linetype in the LINETYPE table, a LAYER
// table with explicit colors/lineweights, a nested BLOCK + INSERT, and
// B5.2 geometry (bulged LWPOLYLINE, POINT). The founder can drop this exact
// file into Drawings on prod to visually confirm the CAD preview/renderer.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDxf, parseDxfDoc, dxfBounds, dxfToSvg, entityCount, layerCounts,
} from "@/lib/dxfPreview";

const fixture = readFileSync(join(process.cwd(), "tests/fixtures/rich-cad-fencing.dxf"), "utf8");

describe("rich CAD sample fixture", () => {
  it("surfaces the LAYER/LINETYPE tables with resolved colors and styles", () => {
    const doc = parseDxfDoc(fixture);
    expect(doc.warnings).toEqual([]);
    expect(doc.layerColors).toEqual({
      WALLS: "#FF0000",
      FENCE: "#00FF00",
      GRID: "#C0C0C0",
    });
  });

  it("expands the BLOCK INSERT into its geometry (LINE + CIRCLE at the insert offset)", () => {
    const ents = parseDxf(fixture);
    // top-level: LWPOLYLINE + LINE + POINT + CIRCLE + INSERT(→ LINE + CIRCLE)
    expect(entityCount(ents)).toBe(6);
    expect(layerCounts(ents)).toEqual({ FENCE: 2, WALLS: 4 });
    const blockLine = ents.find((e) => e.type === "LINE" && Math.abs(e.x1 - 6) < 1e-9 && Math.abs(e.y1 - 1) < 1e-9);
    expect(blockLine).toBeDefined();
    if (blockLine && blockLine.type === "LINE") {
      expect(blockLine.x2).toBeCloseTo(7);
      expect(blockLine.y2).toBeCloseTo(2);
    }
    const blockCircle = ents.find((e) => e.type === "CIRCLE" && Math.abs((e.cx ?? 0) - 6.5) < 1e-9);
    expect(blockCircle).toBeDefined();
    if (blockCircle && blockCircle.type === "CIRCLE") {
      expect(blockCircle.cy).toBeCloseTo(1.5);
      expect(blockCircle.r).toBeCloseTo(0.25);
    }
  });

  it("bounds cover the full drawing including the expanded block", () => {
    const b = dxfBounds(parseDxf(fixture));
    expect(b).not.toBeNull();
    if (b) {
      expect(b.minX).toBeCloseTo(0);
      // The LWPOLYLINE's first bulged chord (0,0)→(2,0) with bulge 1 arcs
      // through its centre at y = -1, so the true minY is -1, not 0.
      expect(b.minY).toBeCloseTo(-1);
      // The BOLT block's LINE spans (0,0)-(1,1), translated to (6,1)-(7,2).
      expect(b.maxX).toBeCloseTo(7);
      expect(b.maxY).toBeCloseTo(2);
    }
  });

  it("renders DASHED linetypes, per-layer colors, POINT dots and bulged paths into SVG", () => {
    const svg = dxfToSvg(parseDxf(fixture));
    expect(svg.startsWith("<svg")).toBe(true);
    // FENCE layer carries the DASHED linetype → a stroke-dasharray group.
    expect(svg).toContain("stroke-dasharray=");
    expect(svg).toContain("stroke-dasharray=\"");
    // Per-layer ACI colors (FENCE green, WALLS red).
    expect(svg).toContain('stroke="#00FF00"');
    expect(svg).toContain('stroke="#FF0000"');
    // Bulged LWPOLYLINE renders a path.
    expect(svg).toMatch(/<path d="M[^>]*Z/);
    // POINT renders as a filled dot.
    const pointDots = svg.match(/fill="currentColor" stroke="none"/g) ?? [];
    expect(pointDots.length).toBeGreaterThanOrEqual(1);
    // Block expansion: its LINE + CIRCLE appear as separate SVG elements.
    expect(svg.match(/<line /g)?.length ?? 0).toBe(2);
    expect(svg.match(/<circle /g)?.length ?? 0).toBe(3);
  });
});