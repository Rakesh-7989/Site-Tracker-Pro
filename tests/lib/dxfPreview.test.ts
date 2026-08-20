// SiteTrack Pro — v4 B5 CAD preview pure-helper tests.
// Dependency-free DXF parser + SVG renderer (no client, no DOM).

import { describe, it, expect } from "vitest";
import {
  cadKind, isCadFileName, isDxfFileName,
  parseDxf, parseDxfDoc, dxfBounds, dxfToSvg, entityCount,
  aciColor, resolveStroke, layerCounts,
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

// ── B5.1 depth: ACI colors + layer table ─────────────────────────────────────

describe("aciColor", () => {
  it("maps the fixed 1–9 palette", () => {
    expect(aciColor(1)).toBe("#FF0000");
    expect(aciColor(2)).toBe("#FFFF00");
    expect(aciColor(3)).toBe("#00FF00");
    expect(aciColor(4)).toBe("#00FFFF");
    expect(aciColor(5)).toBe("#0000FF");
    expect(aciColor(6)).toBe("#FF00FF");
    expect(aciColor(8)).toBe("#808080");
    expect(aciColor(9)).toBe("#C0C0C0");
  });

  it("returns null for BYBLOCK / theme / BYLAYER", () => {
    expect(aciColor(0)).toBeNull();
    expect(aciColor(7)).toBeNull();
    expect(aciColor(256)).toBeNull();
    expect(aciColor(undefined)).toBeNull();
    expect(aciColor(999)).toBeNull();
  });

  it("maps the 10–249 hue ramp and 250–255 grays", () => {
    expect(aciColor(10)).toMatch(/^#[0-9A-F]{6}$/i);
    expect(aciColor(249)).toMatch(/^#[0-9A-F]{6}$/i);
    expect(aciColor(250)).toBe("#808080");
    expect(aciColor(255)).toBe("#C0C0C0");
  });
});

describe("resolveStroke", () => {
  it("returns the hex for a concrete color and currentColor otherwise", () => {
    expect(resolveStroke({ color: 1 })).toBe("#FF0000");
    expect(resolveStroke({ color: 7 })).toBe("currentColor");
    expect(resolveStroke({})).toBe("currentColor");
    expect(resolveStroke({ color: undefined })).toBe("currentColor");
  });
});

const LAYER_COLOR_DXF = `0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
WALLS
70
0
62
1
0
LAYER
2
GRID
70
0
62
3
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
WALLS
10
0
20
0
11
10
21
10
0
LINE
8
GRID
62
5
10
0
20
20
11
10
21
30
0
EOF
`;

describe("layer table + per-entity color", () => {
  it("resolves layer colors from the TABLES section", () => {
    const doc = parseDxfDoc(LAYER_COLOR_DXF);
    expect(doc.layerColors).toMatchObject({ WALLS: "#FF0000", GRID: "#00FF00" });
  });

  it("stamps each entity with its layer color (62 override wins)", () => {
    const ents = parseDxf(LAYER_COLOR_DXF);
    expect(ents).toHaveLength(2);
    expect(ents[0]).toMatchObject({ type: "LINE", layer: "WALLS", color: 1 });
    expect(ents[1]).toMatchObject({ type: "LINE", layer: "GRID", color: 5 });
  });

  it("renders per-color stroke groups in the SVG", () => {
    const svg = dxfToSvg(parseDxf(LAYER_COLOR_DXF));
    expect(svg).toContain('stroke="#FF0000"');
    expect(svg).toContain('stroke="#0000FF"');
  });

  it("keeps theme stroke when a layer has no color", () => {
    const svg = dxfToSvg(parseDxf(LINE_DXF));
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toContain('stroke="#');
  });
});

// ── B5.1 depth: BLOCK → INSERT expansion ─────────────────────────────────────

const BLOCK_DXF = (rotation: string, scale = `41\n1\n42\n1`) => `0
SECTION
2
BLOCKS
0
BLOCK
8
0
2
DOOR
10
0
20
0
70
0
0
LINE
8
FRAME
10
0
20
0
11
10
21
0
0
CIRCLE
8
HINGE
10
0
20
0
40
2
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
8
0
2
DOOR
10
100
20
50
${scale}
50
${rotation}
0
EOF
`;

describe("BLOCK / INSERT expansion", () => {
  it("expands a block's entities at the insert point", () => {
    const ents = parseDxf(BLOCK_DXF("0"));
    expect(ents).toHaveLength(2);
    expect(ents[0]).toMatchObject({ type: "LINE", x1: 100, y1: 50, x2: 110, y2: 50, layer: "FRAME" });
    expect(ents[1]).toMatchObject({ type: "CIRCLE", cx: 100, cy: 50, r: 2, layer: "HINGE" });
    const b = dxfBounds(ents);
    expect(b).not.toBeNull();
    if (b) {
      // LINE 100–110 × 50, plus the HINGE circle r=2 at (100,50).
      expect(b.minX).toBe(98);
      expect(b.maxX).toBe(110);
      expect(b.minY).toBe(48);
      expect(b.maxY).toBe(52);
    }
  });

  it("applies insert rotation to block geometry", () => {
    const ents = parseDxf(BLOCK_DXF("90"));
    const line = ents.find(e => e.type === "LINE");
    expect(line).toMatchObject({ x1: 100, y1: 50, x2: 100, y2: 60 });
  });

  it("applies non-uniform scale (circle → ellipse)", () => {
    const ents = parseDxf(BLOCK_DXF("0", `41\n2\n42\n1`));
    const ell = ents.find(e => e.type === "ELLIPSE");
    expect(ell).toMatchObject({ type: "ELLIPSE", cx: 100, cy: 50, majorDx: 4, ratio: 0.5 });
  });

  it("expands nested blocks recursively", () => {
    const src = `0
SECTION
2
BLOCKS
0
BLOCK
2
INNER
0
LINE
10
0
20
0
11
5
21
0
0
ENDBLK
0
BLOCK
2
OUTER
0
INSERT
2
INNER
10
0
20
0
0
LINE
10
0
20
10
11
10
21
10
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
OUTER
10
0
20
0
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(2);
    expect(ents[0]).toMatchObject({ type: "LINE", x1: 0, y1: 0, x2: 5, y2: 0 });
    expect(ents[1]).toMatchObject({ type: "LINE", x1: 0, y1: 10, x2: 10, y2: 10 });
  });

  it("replicates MINSERT column grids", () => {
    const src = `0
SECTION
2
BLOCKS
0
BLOCK
2
DOT
0
CIRCLE
10
0
20
0
40
1
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
DOT
70
3
44
10
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(3);
    expect(ents.map(e => (e as { cx?: number }).cx)).toEqual([0, 10, 20]);
  });

  it("skips unknown blocks with a warning and keeps the rest", () => {
    const src = `0
INSERT
2
MISSING
10
0
20
0
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
    const doc = parseDxfDoc(src);
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].type).toBe("LINE");
    expect(doc.warnings.join(" ")).toContain("MISSING");
  });

  it("guards against circular block nesting", () => {
    const src = `0
SECTION
2
BLOCKS
0
BLOCK
2
A
0
INSERT
2
B
0
LINE
10
0
20
0
11
1
21
1
0
ENDBLK
0
BLOCK
2
B
0
INSERT
2
A
0
LINE
10
5
20
5
11
6
21
6
0
ENDBLK
0
ENDSEC
0
SECTION
2
ENTITIES
0
INSERT
2
A
0
EOF
`;
    const doc = parseDxfDoc(src);
    expect(() => doc.entities).not.toThrow();
    expect(doc.warnings.join(" ")).toContain("nesting too deep");
  });
});

// ── B5.1 depth: MTEXT + ELLIPSE ──────────────────────────────────────────────

describe("MTEXT", () => {
  it("flattens paragraph breaks + strips formatting codes into TEXT lines", () => {
    const src = `0
MTEXT
8
TXT
10
0
20
0
40
2
1
First line\\PSecond \\fArial; big
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(2);
    expect(ents[0]).toMatchObject({ type: "TEXT", x: 0, y: 0, height: 2, text: "First line" });
    expect(ents[1]).toMatchObject({ type: "TEXT", y: -2.8, text: "Second  big" });
  });

  it("decodes common %% escapes", () => {
    const src = `0
MTEXT
10
0
20
0
40
1
1
Ø 45%%d %%c12 %%p1
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents[0]).toMatchObject({ type: "TEXT", text: "Ø 45° Ø12 ±1" });
  });

  it("drops fully-empty MTEXT", () => {
    const src = `0
MTEXT
10
0
20
0
1

0
EOF
`;
    expect(parseDxf(src)).toEqual([]);
  });
});

describe("ELLIPSE", () => {
  it("parses major axis vector + ratio + params", () => {
    const src = `0
ELLIPSE
8
ELL
10
0
20
0
11
10
21
0
40
0.5
41
0
42
6.283185307179586
0
EOF
`;
    const ents = parseDxf(src);
    expect(ents).toHaveLength(1);
    expect(ents[0]).toMatchObject({ type: "ELLIPSE", cx: 0, cy: 0, majorDx: 10, majorDy: 0, ratio: 0.5, startParam: 0, endParam: 6.283185307179586 });
  });

  it("bounds a full ellipse by its major/minor extents and renders a closed path", () => {
    const src = `0
ELLIPSE
10
0
20
0
11
10
21
0
40
0.5
41
0
42
6.283185307179586
0
EOF
`;
    const ents = parseDxf(src);
    const b = dxfBounds(ents);
    expect(b).not.toBeNull();
    if (b) {
      expect(b.minX).toBeCloseTo(-10, 0);
      expect(b.maxX).toBeCloseTo(10, 0);
      expect(b.minY).toBeCloseTo(-5, 0);
      expect(b.maxY).toBeCloseTo(5, 0);
    }
    const svg = dxfToSvg(ents);
    expect(svg).toContain("<path d=");
    expect(svg).toContain(" Z");
  });

  it("renders a partial ellipse as an open path", () => {
    const src = `0
ELLIPSE
10
0
20
0
11
10
21
0
40
0.5
41
0
42
1.5707963267948966
0
EOF
`;
    const svg = dxfToSvg(parseDxf(src));
    expect(svg).toContain("<path d=");
    expect(svg).not.toContain(" Z");
  });
});

// ── B5.1 depth: layer summary ────────────────────────────────────────────────

describe("layerCounts", () => {
  it("counts entities per layer", () => {
    expect(layerCounts(parseDxf(LINE_DXF))).toEqual({ WALLS: 1, COLS: 1 });
    expect(layerCounts([])).toEqual({});
  });
});

describe("parseDxfDoc", () => {
  it("surfaces layerColors + warnings without changing parseDxf", () => {
    const doc = parseDxfDoc(LINE_DXF);
    expect(doc.entities).toHaveLength(2);
    expect(doc.layerColors).toEqual({});
    expect(doc.warnings).toEqual([]);
  });
});
