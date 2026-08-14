// SiteTrack Pro — v4 B5 CAD preview pure-helper tests.
// Dependency-free DXF parser + SVG renderer (no client, no DOM).

import { describe, it, expect } from "vitest";
import {
  cadKind, isCadFileName, isDxfFileName,
  parseDxf, dxfBounds, dxfToSvg, entityCount,
} from "@/lib/dxfPreview";

describe("cadKind / file classifiers", () => {
  it("classifies by extension (case-insensitive)", () => {
    expect(cadKind("plan.dxf")).toBe("dxf");
    expect(cadKind("PLAN.DXF")).toBe("dxf");
    expect(cadKind("plan.dwg")).toBe("dwg");
    expect(cadKind("model.skp")).toBe("skp");
  });

  it("treats unknown / missing extensions as other", () => {
    expect(cadKind("plan.pdf")).toBe("other");
    expect(cadKind("plan")).toBe("other");
    expect(cadKind("")).toBe("other");
    expect(cadKind("")).toBe("other");
  });

  it("isCadFileName only for the three CAD kinds", () => {
    expect(isCadFileName("a.dxf")).toBe(true);
    expect(isCadFileName("a.dwg")).toBe(true);
    expect(isCadFileName("a.skp")).toBe(true);
    expect(isCadFileName("a.png")).toBe(false);
  });

  it("isDxfFileName only for DXF", () => {
    expect(isDxfFileName("a.dxf")).toBe(true);
    expect(isDxfFileName("a.dwg")).toBe(false);
    expect(isDxfFileName("a.skp")).toBe(false);
  });
});

const LINE_DXF = `0
SECTION
2
ENTITIES
0
LINE
8
WALLS
10
0.0
20
0.0
11
100.0
21
50.0
0
CIRCLE
8
COLS
10
50.0
20
25.0
40
12.5
0
ENDSEC
0
EOF
`;

describe("parseDxf", () => {
  it("parses LINE + CIRCLE entities with layer + coordinates", () => {
    const ents = parseDxf(LINE_DXF);
    expect(ents).toHaveLength(2);
    expect(ents[0]).toMatchObject({ type: "LINE", x1: 0, y1: 0, x2: 100, y2: 50, layer: "WALLS" });
    expect(ents[1]).toMatchObject({ type: "CIRCLE", cx: 50, cy: 25, r: 12.5, layer: "COLS" });
  });

  it("parses TEXT entities (height + content) and skips empty text", () => {
    const src = `0
TEXT
8
LBL
10
5
20
5
40
2.5
1
Room A
0
TEXT
1

0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ type: "TEXT", x: 5, y: 5, height: 2.5, text: "Room A" });
  });

  it("parses LWPOLYLINE vertices + closed flag", () => {
    const src = `0
LWPOLYLINE
8
FENCE
90
3
70
1
10
0
20
0
10
10
20
0
10
10
20
10
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ type: "LWPOLYLINE", closed: true, layer: "FENCE" });
    if (ents[0] && ents[0].type === "LWPOLYLINE") {
      expect(ents[0].points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    }
  });

  it("parses POLYLINE → VERTEX entities until SEQEND", () => {
    const src = `0
POLYLINE
8
ROAD
70
1
0
VERTEX
10
0
20
0
0
VERTEX
10
5
20
8
0
VERTEX
10
10
20
0
0
SEQEND
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ type: "POLYLINE", closed: true });
    if (ents[0] && ents[0].type === "POLYLINE") {
      expect(ents[0].points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 8 }, { x: 10, y: 0 }]);
    }
  });

  it("parses ARC entities with degrees + radius", () => {
    const src = `0
ARC
10
0
20
0
40
10
50
0
51
90
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ type: "ARC", cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: 90 });
  });

  it("returns [] on empty / garbage input without throwing", () => {
    expect(parseDxf("")).toEqual([]);
    expect(parseDxf("   \n \n")).toEqual([]);
    expect(parseDxf("not a dxf\nsecond line\n")).toEqual([]);
  });

  it("skips unsupported entity types (INSERT / SPLINE) and continues", () => {
    const src = `0
INSERT
10
1
20
2
0
LINE
10
0
20
0
11
5
21
5
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(1);
    expect(ents[0].type).toBe("LINE");
  });
});

describe("dxfBounds", () => {
  it("computes min/max across lines + circles", () => {
    const ents = parseDxf(LINE_DXF);
    const b = dxfBounds(ents);
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
  });

  it("returns null when nothing renderable", () => {
    expect(dxfBounds([])).toBeNull();
  });

  it("guards against zero-area bounds", () => {
    const src = `0
CIRCLE
10
5
20
5
40
0
0
EOF
`;
    const ents = parseDxf(src);
    const b = dxfBounds(ents);
    expect(b).not.toBeNull();
    if (b) {
      expect(b.maxX - b.minX).toBeGreaterThanOrEqual(1);
      expect(b.maxY - b.minY).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("dxfToSvg", () => {
  it("renders a self-contained svg with viewBox + entities", () => {
    const ents = parseDxf(LINE_DXF);
    const svg = dxfToSvg(ents);
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg).toContain("viewBox=");
    expect(svg).toContain("<line ");
    expect(svg).toContain("<circle ");
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("returns empty string when nothing renderable", () => {
    expect(dxfToSvg([])).toBe("");
  });

  it("escapes text content so it can't inject markup", () => {
    const src = `0
TEXT
10
0
20
0
40
1
1
<script>alert(1)</script>
0
EOF
`;
    const ents = parseDxf(src);
    const svg = dxfToSvg(ents);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("renders polylines (open + closed seam) and text groups", () => {
    const src = `0
LWPOLYLINE
90
2
70
1
10
0
20
0
10
10
20
0
0
TEXT
10
1
20
1
40
0.5
1
Hi
0
EOF
`;
    const svg = dxfToSvg(parseDxf(src));
    expect(svg).toContain("<polyline ");
    expect(svg).toContain("<text ");
    expect(svg).toContain("Hi");
  });
});

describe("entityCount", () => {
  it("counts parsed entities", () => {
    expect(entityCount(parseDxf(LINE_DXF))).toBe(2);
    expect(entityCount([])).toBe(0);
  });
});
