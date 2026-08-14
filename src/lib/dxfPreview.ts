// SiteTrack Pro — dependency-free CAD preview (v4 B5).
//
// Client-side preview for uploaded CAD files in the drawing / deliverable
// register. DXF is a documented ASCII format we can parse and re-render to
// SVG with zero dependencies; DWG / SKP are closed binary formats we cannot
// parse client-side, so they fall back to a metadata + download prompt (the
// CadPreviewModal handles that surface — this module is pure + DOM-free).
//
// Pure functions only (no client, no canvas, no DOM) so the parser + renderer
// are fully unit-testable in the node vitest env.

export type CadKind = "dxf" | "dwg" | "skp" | "other";

const CAD_EXT: Record<string, CadKind> = {
  ".dxf": "dxf",
  ".dwg": "dwg",
  ".skp": "skp",
};

/** Classify a file name by its extension. */
export function cadKind(name: string): CadKind {
  const lower = String(name ?? "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "other";
  return CAD_EXT[lower.slice(dot)] ?? "other";
}

/** True when the file is a CAD file we classify (.dxf/.dwg/.skp). */
export function isCadFileName(name: string): boolean {
  return cadKind(name) !== "other";
}

/** True when the file is a DXF (the only CAD format we can parse client-side). */
export function isDxfFileName(name: string): boolean {
  return cadKind(name) === "dxf";
}

// ── DXF entity model ────────────────────────────────────────────────────────

export interface DxfPoint { x: number; y: number; }

export type DxfEntity =
  | { type: "LINE"; x1: number; y1: number; x2: number; y2: number; layer: string }
  | { type: "LWPOLYLINE" | "POLYLINE"; points: DxfPoint[]; closed: boolean; layer: string }
  | { type: "CIRCLE"; cx: number; cy: number; r: number; layer: string }
  | { type: "ARC"; cx: number; cy: number; r: number; startAngle: number; endAngle: number; layer: string }
  | { type: "TEXT"; x: number; y: number; height: number; text: string; rotation: number; layer: string };

// ── DXF parser ──────────────────────────────────────────────────────────────

/**
 * Parse a DXF ASCII source into a normalized entity list. DXF is a stream of
 * (group code, value) line pairs; group code 0 begins a new entity. We read the
 * groups we care about per entity type and ignore everything else (headers,
 * tables, blocks, VIEWPORT boilerplate, unsupported entities) so any real DXF
 * — even one produced by another CAD tool — parses without throwing.
 *
 * Returns entities in document order. An empty string / unparsable source
 * yields `[]` (callers treat an empty result as "nothing renderable").
 */
export function parseDxf(source: string): DxfEntity[] {
  const raw = String(source ?? "");
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const entities: DxfEntity[] = [];
  let layer = "0";

  const num = (v: string | undefined, fallback = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // A DXF group is two consecutive lines: code, then value.
  let i = 0;
  while (i + 1 < lines.length) {
    const codeStr = lines[i].trim();
    const value = lines[i + 1].trim();
    if (/^-?\d+$/.test(codeStr)) {
      const code = parseInt(codeStr, 10);
      if (code === 0) {
        const type = value.toUpperCase();
        if (type === "LINE") {
          let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
          let j = i + 2;
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            if (c === "0") break;
            const v = lines[j + 1].trim();
            if (c === "8") layer = v;
            else if (c === "10") x1 = num(v);
            else if (c === "20") y1 = num(v);
            else if (c === "11") x2 = num(v);
            else if (c === "21") y2 = num(v);
            j += 2;
          }
          entities.push({ type: "LINE", x1, y1, x2, y2, layer });
          i = j - 2;
        } else if (type === "LWPOLYLINE") {
          const points: DxfPoint[] = [];
          let closed = false;
          let j = i + 2;
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            if (c === "0") break;
            const v = lines[j + 1].trim();
            if (c === "8") layer = v;
            else if (c === "70") closed = (num(v) & 1) === 1;
            else if (c === "10") points.push({ x: num(v), y: 0 });
            else if (c === "20" && points.length > 0) points[points.length - 1].y = num(v);
            j += 2;
          }
          entities.push({ type: "LWPOLYLINE", points, closed, layer });
          i = j - 2;
        } else if (type === "POLYLINE") {
          const points: DxfPoint[] = [];
          let closed = false;
          let j = i + 2;
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            if (c === "0") break;
            const v = lines[j + 1].trim();
            if (c === "8") layer = v;
            else if (c === "70") closed = (num(v) & 1) === 1;
            j += 2;
          }
          // POLYLINE's vertices are VERTEX entities until SEQEND; each carries
          // 10/20 like an LWPOLYLINE point.
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            const v = lines[j + 1].trim();
            if (c === "0") {
              if (v.toUpperCase() === "VERTEX") {
                let vx = 0, vy = 0;
                let k = j + 2;
                while (k + 1 < lines.length) {
                  const c2 = lines[k].trim();
                  if (c2 === "0") break;
                  const v2 = lines[k + 1].trim();
                  if (c2 === "10") vx = num(v2);
                  else if (c2 === "20") vy = num(v2);
                  k += 2;
                }
                points.push({ x: vx, y: vy });
                j = k - 2;
              } else if (v.toUpperCase() === "SEQEND") {
                j += 2;
                break;
              } else {
                break;
              }
            } else {
              j += 2;
            }
          }
          entities.push({ type: "POLYLINE", points, closed, layer });
          i = j - 2;
        } else if (type === "CIRCLE") {
          let cx = 0, cy = 0, r = 0;
          let j = i + 2;
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            if (c === "0") break;
            const v = lines[j + 1].trim();
            if (c === "8") layer = v;
            else if (c === "10") cx = num(v);
            else if (c === "20") cy = num(v);
            else if (c === "40") r = num(v);
            j += 2;
          }
          entities.push({ type: "CIRCLE", cx, cy, r: Math.abs(r), layer });
          i = j - 2;
        } else if (type === "ARC") {
          let cx = 0, cy = 0, r = 0, a1 = 0, a2 = 0;
          let j = i + 2;
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            if (c === "0") break;
            const v = lines[j + 1].trim();
            if (c === "8") layer = v;
            else if (c === "10") cx = num(v);
            else if (c === "20") cy = num(v);
            else if (c === "40") r = num(v);
            else if (c === "50") a1 = num(v);
            else if (c === "51") a2 = num(v);
            j += 2;
          }
          entities.push({ type: "ARC", cx, cy, r: Math.abs(r), startAngle: a1, endAngle: a2, layer });
          i = j - 2;
        } else if (type === "TEXT") {
          let x = 0, y = 0, h = 2.5, text = "", rot = 0;
          let j = i + 2;
          while (j + 1 < lines.length) {
            const c = lines[j].trim();
            if (c === "0") break;
            const v = lines[j + 1].trim();
            if (c === "8") layer = v;
            else if (c === "10") x = num(v);
            else if (c === "20") y = num(v);
            else if (c === "40") h = num(v, 2.5);
            else if (c === "1") text = v;
            else if (c === "50") rot = num(v);
            j += 2;
          }
          if (text) entities.push({ type: "TEXT", x, y, height: h, text, rotation: rot, layer });
          i = j - 2;
        }
        // anything else (SECTION/HEADER/ENDBLK/INSERT/SPLINE/…) → skip to next "0"
      }
    }
    i += 2;
  }
  return entities;
}

// ── Bounds + SVG renderer ───────────────────────────────────────────────────

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

/** Compute the drawing bounds across all entities (null when nothing renderable). */
export function dxfBounds(entities: DxfEntity[]): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (x: number, y: number): void => { xs.push(x); ys.push(y); };
  for (const e of entities) {
    if (e.type === "LINE") { push(e.x1, e.y1); push(e.x2, e.y2); }
    else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") { for (const p of e.points) push(p.x, p.y); }
    else if (e.type === "CIRCLE") { push(e.cx - e.r, e.cy - e.r); push(e.cx + e.r, e.cy + e.r); }
    else if (e.type === "ARC") {
      // sample the arc span (every 15°) to bound it robustly
      const a1 = Math.min(e.startAngle, e.endAngle);
      const a2 = Math.max(e.startAngle, e.endAngle);
      for (let a = a1; a <= a2; a += 15) {
        const rad = (a * Math.PI) / 180;
        push(e.cx + e.r * Math.cos(rad), e.cy + e.r * Math.sin(rad));
      }
    }
    else if (e.type === "TEXT") { push(e.x, e.y); }
  }
  if (xs.length === 0) return null;
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  // guard against zero-area (single point / zero radius) → give 1 unit
  if (maxX - minX < 1e-9) { maxX += 1; minX -= 1; }
  if (maxY - minY < 1e-9) { maxY += 1; minY -= 1; }
  return { minX, minY, maxX, maxY };
}

const D2R = Math.PI / 180;

/** DXF degrees (CCW, y-up) → SVG path for an arc (screen y-down, sweep inverted). */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const a1 = startDeg * D2R;
  const a2 = endDeg * D2R;
  // DXF arcs run counter-clockwise from start to end; SVG y is flipped so the
  // visual direction flips too (a CCW CAD arc reads CW on screen).
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = 1; // screen flip of the CCW CAD arc
  const f = (n: number): string => (Math.round(n * 1000) / 1000).toString();
  return `M${f(x1)} ${f(y1)} A${f(r)} ${f(r)} 0 ${largeArc} ${sweep} ${f(x2)} ${f(y2)}`;
}

/**
 * Render parsed DXF entities to a self-contained SVG string (stroke-only,
 * transparent background) that fits the content in a viewBox. `maxView` caps
 * the largest viewBox dimension; the drawing keeps aspect ratio either way.
 * Returns an empty string when nothing is renderable.
 */
export function dxfToSvg(entities: DxfEntity[], opts?: { maxView?: number; strokeWidth?: number }): string {
  const bounds = dxfBounds(entities);
  if (!bounds) return "";
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const height = maxY - minY;
  const maxView = opts?.maxView ?? 1000;
  const scale = maxView / Math.max(width, height);
  const sw = opts?.strokeWidth ?? Math.max(0.4, 1 / scale);
  // Pad the viewBox by 4% each side so strokes at the edge aren't clipped.
  const padX = width * 0.04;
  const padY = height * 0.04;
  const vbx = minX - padX;
  const vby = minY - padY;
  const vbw = width + padX * 2;
  const vbh = height + padY * 2;
  const f = (n: number): string => (Math.round(n * 1000) / 1000).toString();
  const num = (v: string | number): string => f(Number(v));

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vbx)} ${f(vby)} ${f(vbw)} ${f(vbh)}" role="img" aria-label="CAD drawing preview">`);
  parts.push(`<g fill="none" stroke="currentColor" stroke-width="${num(sw)}" stroke-linecap="round" stroke-linejoin="round">`);
  for (const e of entities) {
    if (e.type === "LINE") {
      parts.push(`<line x1="${f(e.x1)}" y1="${f(e.y1)}" x2="${f(e.x2)}" y2="${f(e.y2)}"/>`);
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      if (e.points.length < 2) continue;
      const pts = e.points.map(p => `${f(p.x)},${f(p.y)}`).join(" ");
      parts.push(`<polyline points="${pts}"/>`);
      if (e.closed) {
        const a = e.points[0];
        const b = e.points[e.points.length - 1];
        parts.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}"/>`);
      }
    } else if (e.type === "CIRCLE") {
      parts.push(`<circle cx="${f(e.cx)}" cy="${f(e.cy)}" r="${f(e.r)}"/>`);
    } else if (e.type === "ARC") {
      parts.push(`<path d="${arcPath(e.cx, e.cy, e.r, e.startAngle, e.endAngle)}"/>`);
    }
  }
  parts.push("</g>");
  // TEXT is drawn above the geometry in the foreground color.
  const texts = entities.filter((e): e is Extract<DxfEntity, { type: "TEXT" }> => e.type === "TEXT");
  if (texts.length > 0) {
    parts.push(`<g fill="currentColor" stroke="none" font-family="sans-serif" text-anchor="start">`);
    for (const t of texts) {
      parts.push(`<text x="${f(t.x)}" y="${f(t.y)}" font-size="${f(t.height)}">${escapeXml(t.text)}</text>`);
    }
    parts.push("</g>");
  }
  parts.push("</svg>");
  return parts.join("");
}

/** Minimal XML escape so DXF text can't inject markup into the generated SVG. */
function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Count of renderable entities (for the preview footer / empty state). */
export function entityCount(entities: DxfEntity[]): number {
  return entities.length;
}
