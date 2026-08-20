// SiteTrack Pro — dependency-free CAD preview (v4 B5 + B5.1 depth).
//
// Client-side preview for uploaded CAD files in the drawing / deliverable
// register. DXF is a documented ASCII format we can parse and re-render to
// SVG with zero dependencies; DWG / SKP are closed binary formats we cannot
// parse client-side, so they fall back to a metadata + download prompt (the
// CadPreviewModal handles that surface — this module is pure + DOM-free).
//
// Depth (B5.1):
//   - BLOCK → INSERT expansion (incl. nested blocks + MINSERT grids) so real
//     drawings that place geometry through blocks render fully instead of
//     showing only the top-level entities.
//   - LAYER-table color resolution + the AutoCAD Color Index (ACI) so layers
//     render with their CAD colors instead of one theme stroke.
//   - MTEXT (multi-line / formatted text) flattened to TEXT lines.
//   - ELLIPSE entities (full + partial) rendered by parametric sampling.
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

/** Every renderable entity carries its resolved ACI color (see `aciColor`). */
interface DxfColored { layer: string; color?: number; }

export type DxfEntity =
  | ({ type: "LINE"; x1: number; y1: number; x2: number; y2: number } & DxfColored)
  | ({ type: "LWPOLYLINE" | "POLYLINE"; points: DxfPoint[]; closed: boolean } & DxfColored)
  | ({ type: "CIRCLE"; cx: number; cy: number; r: number } & DxfColored)
  | ({ type: "ARC"; cx: number; cy: number; r: number; startAngle: number; endAngle: number } & DxfColored)
  | ({ type: "ELLIPSE"; cx: number; cy: number; majorDx: number; majorDy: number; ratio: number; startParam: number; endParam: number } & DxfColored)
  | ({ type: "TEXT"; x: number; y: number; height: number; text: string; rotation: number } & DxfColored);

/** Internal (pre-expansion) INSERT reference into the BLOCK table. */
interface RawInsert extends DxfColored {
  type: "INSERT";
  name: string;
  x: number; y: number;
  scaleX: number; scaleY: number;
  rotation: number;
  cols: number; rows: number;
  colSpacing: number; rowSpacing: number;
}

type RawEntity = DxfEntity | RawInsert;

interface BlockDef { baseX: number; baseY: number; entities: RawEntity[]; }

// ── DXF tokenizer ────────────────────────────────────────────────────────────

interface Group { code: number; value: string; }

/**
 * A DXF group is exactly two lines: a numeric group code, then its value.
 * We pair lines positionally and skip non-numeric code lines (junk / BOM).
 */
function tokenize(source: string): Group[] {
  const lines = String(source ?? "").split(/\r?\n/);
  const groups: Group[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = lines[i].trim();
    if (!/^-?\d+$/.test(codeStr)) continue;
    const code = parseInt(codeStr, 10);
    groups.push({ code, value: lines[i + 1].trim() });
  }
  return groups;
}

const num = (v: string | undefined, fallback = 0): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clampInt = (v: string | undefined, min: number, max: number, fallback: number): number => {
  const n = parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// ── AutoCAD Color Index (ACI) ───────────────────────────────────────────────

const ACI_FIXED: Record<number, string> = {
  1: "#FF0000", 2: "#FFFF00", 3: "#00FF00", 4: "#00FFFF", 5: "#0000FF",
  6: "#FF00FF", 7: "#FFFFFF", 8: "#808080", 9: "#C0C0C0",
};

/** Canonical ACI grays (250–255). */
const ACI_GRAY: Record<number, string> = {
  250: "#808080", 251: "#8C8C8C", 252: "#999999", 253: "#A6A6A6", 254: "#B3B3B3", 255: "#C0C0C0",
};

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function hsvToHex(hueDeg: number, sat: number, val: number): string {
  const h = ((hueDeg % 360) + 360) % 360;
  const c = val * sat;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = val - c;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * Map an ACI index to a hex color. Returns `null` for the special values the
 * renderer should leave to the theme: 0 (BYBLOCK), 7 (black/white) and 256
 * (BYLAYER). 10–249 follow the classic hue ramp (1.5°/index, saturation
 * triangular wave), 250–255 are grays — a close approximation of AutoCAD's
 * palette sufficient for preview.
 */
export function aciColor(index: number | undefined): string | null {
  if (index === undefined || index === null) return null;
  const i = Math.round(index);
  if (i === 0 || i === 7 || i === 256) return null;
  if (i >= 1 && i <= 9) return ACI_FIXED[i];
  if (i >= 250 && i <= 255) return ACI_GRAY[i] ?? null;
  if (i >= 10 && i <= 249) {
    const hue = (i - 10) * 1.5;
    const sat = 0.5 + 0.5 * Math.sin((hue * Math.PI) / 180);
    return hsvToHex(hue, sat, 1);
  }
  return null;
}

/** Resolve an entity's stroke/fill: hex when it has a renderable color, else "currentColor". */
export function resolveStroke(e: { color?: number }): string {
  if (e.color !== undefined && e.color !== null) {
    const hex = aciColor(e.color);
    if (hex) return hex;
  }
  return "currentColor";
}

// ── Document scans (LAYER table + BLOCK definitions) ─────────────────────────

/** Collect the LAYER table: layer name → ACI color. Global to the document. */
function scanLayers(groups: Group[]): Map<string, number> {
  const layers = new Map<string, number>();
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].code === 0 && groups[i].value.toUpperCase() === "LAYER") {
      let name = "";
      let color = 7;
      let j = i + 1;
      while (j < groups.length && groups[j].code !== 0) {
        if (groups[j].code === 2) name = groups[j].value;
        else if (groups[j].code === 62) {
          const c = parseInt(groups[j].value, 10);
          color = Number.isFinite(c) && c >= 0 ? c : 7;
        }
        j++;
      }
      if (name) layers.set(name, color);
      i = j - 1;
    }
  }
  return layers;
}

/** Collect BLOCK definitions (name → base point + raw entities in local space). */
function scanBlocks(groups: Group[], layers: Map<string, number>): Map<string, BlockDef> {
  const blocks = new Map<string, BlockDef>();
  let i = 0;
  while (i < groups.length) {
    if (groups[i].code === 0 && groups[i].value.toUpperCase() === "BLOCK") {
      let name = "";
      let baseX = 0;
      let baseY = 0;
      let j = i + 1;
      while (j < groups.length && groups[j].code !== 0) {
        if (groups[j].code === 2) name = groups[j].value;
        else if (groups[j].code === 10) baseX = num(groups[j].value);
        else if (groups[j].code === 20) baseY = num(groups[j].value);
        j++;
      }
      const parsed = parseEntityList(groups, j, new Set(["ENDBLK"]), layers);
      if (name) blocks.set(name, { baseX, baseY, entities: parsed.entities });
      // parsed.next points at ENDBLK; jump past it and continue scanning.
      i = parsed.next < groups.length ? parsed.next + 1 : groups.length;
      continue;
    }
    i++;
  }
  return blocks;
}

// ── Entity parsing ───────────────────────────────────────────────────────────

/** Resolve an entity's effective ACI color: explicit 62, else the layer's color. */
function resolveColor(fields: Record<number, string>, layerColor: number | undefined): number | undefined {
  if (fields[62] !== undefined) {
    const c = parseInt(fields[62], 10);
    if (!Number.isFinite(c)) return layerColor;
    if (c === 256) return layerColor;
    if (c === 0) return undefined;
    return c;
  }
  return layerColor;
}

/** Read a single-value entity's fields up to the next code-0 group. */
function readUntilZero(groups: Group[], from: number): { fields: Record<number, string>; next: number } {
  const fields: Record<number, string> = {};
  let j = from;
  while (j < groups.length && groups[j].code !== 0) {
    fields[groups[j].code] = groups[j].value;
    j++;
  }
  return { fields, next: j };
}

/** Parse entities starting at `i` until a stop-type code-0 group (or end). */
function parseEntityList(groups: Group[], i: number, stop: Set<string>, layers: Map<string, number>): { entities: RawEntity[]; next: number } {
  const entities: RawEntity[] = [];
  while (i < groups.length) {
    const g = groups[i];
    if (g.code !== 0) { i++; continue; }
    const type = g.value.toUpperCase();
    if (stop.has(type)) return { entities, next: i };
    if (type === "BLOCK") {
      // BLOCK definitions are collected separately by scanBlocks; never parse
      // their content as top-level entities (and never descend into them).
      i = skipToEndblk(groups, i + 1) + 1;
      continue;
    }
    const parsed = parseSingleEntity(groups, i, type, layers);
    if (parsed) {
      entities.push(...parsed.entities);
      i = parsed.next;
    } else {
      // Unknown entity type (SECTION/HEADER/SPLINE/…) → skip to next "0".
      i++;
    }
  }
  return { entities, next: i };
}

/** Return the index of the ENDBLK group for a block starting after `from`. */
function skipToEndblk(groups: Group[], from: number): number {
  let j = from;
  while (j < groups.length) {
    if (groups[j].code === 0 && groups[j].value.toUpperCase() === "ENDBLK") return j;
    j++;
  }
  return groups.length - 1;
}

function parseSingleEntity(
  groups: Group[],
  i: number,
  type: string,
  layers: Map<string, number>,
): { entities: RawEntity[]; next: number } | null {
  const layerColor = (layer: string): number | undefined => layers.get(layer);

  if (type === "LINE") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    return {
      entities: [{
        type: "LINE",
        x1: num(fields[10]), y1: num(fields[20]),
        x2: num(fields[11]), y2: num(fields[21]),
        layer, color: resolveColor(fields, layerColor(layer)),
      }],
      next,
    };
  }

  if (type === "LWPOLYLINE") {
    const points: DxfPoint[] = [];
    let layer = "0";
    let closed = false;
    let color62: string | undefined;
    let j = i + 1;
    while (j < groups.length && groups[j].code !== 0) {
      const g = groups[j];
      if (g.code === 8) layer = g.value;
      else if (g.code === 62) color62 = g.value;
      else if (g.code === 70) closed = (num(g.value) & 1) === 1;
      else if (g.code === 10) points.push({ x: num(g.value), y: 0 });
      else if (g.code === 20 && points.length > 0) points[points.length - 1].y = num(g.value);
      j++;
    }
    return {
      entities: [{
        type: "LWPOLYLINE", points, closed, layer,
        color: color62 !== undefined ? resolveColor({ 62: color62 }, layerColor(layer)) : layerColor(layer),
      }],
      next: j,
    };
  }

  if (type === "POLYLINE") {
    let layer = "0";
    let closed = false;
    let color62: string | undefined;
    let j = i + 1;
    while (j < groups.length && groups[j].code !== 0) {
      const g = groups[j];
      if (g.code === 8) layer = g.value;
      else if (g.code === 62) color62 = g.value;
      else if (g.code === 70) closed = (num(g.value) & 1) === 1;
      j++;
    }
    const points: DxfPoint[] = [];
    while (j < groups.length) {
      const g = groups[j];
      if (g.code !== 0) { j++; continue; }
      const t = g.value.toUpperCase();
      if (t === "VERTEX") {
        let vx = 0, vy = 0;
        let k = j + 1;
        while (k < groups.length && groups[k].code !== 0) {
          if (groups[k].code === 10) vx = num(groups[k].value);
          else if (groups[k].code === 20) vy = num(groups[k].value);
          k++;
        }
        points.push({ x: vx, y: vy });
        j = k;
      } else if (t === "SEQEND") {
        j++;
        break;
      } else {
        break;
      }
    }
    return {
      entities: [{
        type: "POLYLINE", points, closed, layer,
        color: color62 !== undefined ? resolveColor({ 62: color62 }, layerColor(layer)) : layerColor(layer),
      }],
      next: j,
    };
  }

  if (type === "CIRCLE") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    return {
      entities: [{
        type: "CIRCLE", cx: num(fields[10]), cy: num(fields[20]), r: Math.abs(num(fields[40])),
        layer, color: resolveColor(fields, layerColor(layer)),
      }],
      next,
    };
  }

  if (type === "ARC") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    return {
      entities: [{
        type: "ARC", cx: num(fields[10]), cy: num(fields[20]), r: Math.abs(num(fields[40])),
        startAngle: num(fields[50]), endAngle: num(fields[51]),
        layer, color: resolveColor(fields, layerColor(layer)),
      }],
      next,
    };
  }

  if (type === "ELLIPSE") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    const endParam = fields[42] !== undefined ? num(fields[42]) : Math.PI * 2;
    return {
      entities: [{
        type: "ELLIPSE", cx: num(fields[10]), cy: num(fields[20]),
        majorDx: num(fields[11]), majorDy: num(fields[21]),
        ratio: num(fields[40], 1),
        startParam: num(fields[41]), endParam,
        layer, color: resolveColor(fields, layerColor(layer)),
      }],
      next,
    };
  }

  if (type === "TEXT") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    const text = fields[1] ?? "";
    const color = resolveColor(fields, layerColor(layer));
    if (!text) return { entities: [], next };
    return {
      entities: [{
        type: "TEXT", x: num(fields[10]), y: num(fields[20]),
        height: num(fields[40], 2.5), text, rotation: num(fields[50]),
        layer, color,
      }],
      next,
    };
  }

  if (type === "MTEXT") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    const color = resolveColor(fields, layerColor(layer));
    const text = (fields[1] ?? "") + (fields[3] ?? "");
    return {
      entities: mtextToText(text, num(fields[10]), num(fields[20]), num(fields[40], 2.5), num(fields[50]), layer, color),
      next,
    };
  }

  if (type === "INSERT") {
    const { fields, next } = readUntilZero(groups, i + 1);
    const layer = fields[8] ?? "0";
    return {
      entities: [{
        type: "INSERT",
        name: fields[2] ?? "",
        x: num(fields[10]), y: num(fields[20]),
        scaleX: fields[41] !== undefined ? num(fields[41], 1) : 1,
        scaleY: fields[42] !== undefined ? num(fields[42], 1) : 1,
        rotation: num(fields[50]),
        cols: clampInt(fields[70], 1, 64, 1),
        rows: clampInt(fields[71], 1, 64, 1),
        colSpacing: num(fields[44]),
        rowSpacing: num(fields[45]),
        layer, color: resolveColor(fields, layerColor(layer)),
      }],
      next,
    };
  }

  return null;
}

// ── MTEXT → TEXT flattening ──────────────────────────────────────────────────

/** Strip MTEXT formatting codes and split paragraphs into TEXT lines. */
function cleanMtext(raw: string): string {
  return String(raw ?? "")
    .replace(/\\P/gi, "\n")
    .replace(/\\~+/g, " ")
    .replace(/%%c/gi, "Ø")
    .replace(/%%d/gi, "°")
    .replace(/%%p/gi, "±")
    .replace(/%%%/g, "%")
    .replace(/\\(L|l|O|o|K|k)/g, "")
    .replace(/\\[a-zA-Z]+[^;]*;/g, "")
    .replace(/\\[a-zA-Z]/g, "");
}

/** Flatten MTEXT into per-line TEXT entities (baseline flows downward). */
function mtextToText(
  raw: string,
  x: number, y: number, height: number, rotation: number,
  layer: string, color: number | undefined,
): DxfEntity[] {
  const lines = cleanMtext(raw).split("\n");
  const out: DxfEntity[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const text = lines[idx].trim();
    if (!text) continue;
    out.push({ type: "TEXT", x, y: y - idx * height * 1.4, height, text, rotation, layer, color });
  }
  return out;
}

// ── Block expansion (INSERT → transformed geometry) ─────────────────────────

const MAX_BLOCK_DEPTH = 8;
const MAX_ENTITIES = 20000;

function transformPoint(x: number, y: number, tx: number, ty: number, cos: number, sin: number, sx: number, sy: number): DxfPoint {
  const px = x * sx;
  const py = y * sy;
  return { x: px * cos - py * sin + tx, y: px * sin + py * cos + ty };
}

/** Apply an INSERT transform (translate/rotate/scale, base-offset) to a final entity. */
function transformEntity(e: DxfEntity, baseX: number, baseY: number, tx: number, ty: number, rotDeg: number, sx: number, sy: number): DxfEntity {
  const rot = rotDeg * D2R;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const T = (x: number, y: number): DxfPoint => transformPoint(x - baseX, y - baseY, tx, ty, cos, sin, sx, sy);
  const absSx = Math.abs(sx);
  const absSy = Math.abs(sy);
  const uniform = Math.abs(absSx - absSy) < 1e-6;

  switch (e.type) {
    case "LINE": {
      const a = T(e.x1, e.y1);
      const b = T(e.x2, e.y2);
      return { ...e, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "LWPOLYLINE":
    case "POLYLINE":
      return { ...e, points: e.points.map(p => T(p.x, p.y)) };
    case "CIRCLE": {
      const c = T(e.cx, e.cy);
      if (uniform) return { ...e, cx: c.x, cy: c.y, r: Math.abs(e.r * absSx) };
      // Non-uniform scale turns a circle into an ellipse.
      return {
        type: "ELLIPSE", cx: c.x, cy: c.y, majorDx: e.r * sx, majorDy: 0,
        ratio: sx === 0 ? 1 : Math.abs(sy / sx), startParam: 0, endParam: Math.PI * 2,
        layer: e.layer, color: e.color,
      };
    }
    case "ARC": {
      const c = T(e.cx, e.cy);
      if (uniform) {
        return { ...e, cx: c.x, cy: c.y, r: Math.abs(e.r * absSx), startAngle: e.startAngle + rotDeg, endAngle: e.endAngle + rotDeg };
      }
      return {
        type: "ELLIPSE", cx: c.x, cy: c.y, majorDx: e.r * sx, majorDy: 0,
        ratio: sx === 0 ? 1 : Math.abs(sy / sx),
        startParam: e.startAngle * D2R, endParam: e.endAngle * D2R,
        layer: e.layer, color: e.color,
      };
    }
    case "ELLIPSE": {
      const c = T(e.cx, e.cy);
      const mx = e.majorDx * sx;
      const my = e.majorDy * sy;
      return { ...e, cx: c.x, cy: c.y, majorDx: mx * cos - my * sin, majorDy: mx * sin + my * cos };
    }
    case "TEXT": {
      const p = T(e.x, e.y);
      return { ...e, x: p.x, y: p.y, height: Math.abs(e.height * sy), rotation: e.rotation + rotDeg };
    }
  }
}

/** Expand a raw INSERT into final entities (recursively resolving nested inserts + MINSERT grids). */
function expandInsert(ins: RawInsert, depth: number, blocks: Map<string, BlockDef>, into: DxfEntity[], warnings: string[]): void {
  if (depth > MAX_BLOCK_DEPTH) {
    warnings.push(`Block "${ins.name}" skipped — nesting too deep.`);
    return;
  }
  const def = blocks.get(ins.name);
  if (!def) {
    warnings.push(`Block "${ins.name}" is not defined; skipped.`);
    return;
  }
  for (let row = 0; row < ins.rows; row++) {
    for (let col = 0; col < ins.cols; col++) {
      const tx = ins.x + col * ins.colSpacing;
      const ty = ins.y + row * ins.rowSpacing;
      for (const raw of def.entities) {
        if (into.length >= MAX_ENTITIES) {
          warnings.push("Entity limit reached; preview truncated.");
          return;
        }
        if (raw.type === "INSERT") {
          // Nested insert: expand into block space, then apply this insert's transform.
          const inner: DxfEntity[] = [];
          expandInsert(raw, depth + 1, blocks, inner, warnings);
          for (const e of inner) into.push(transformEntity(e, def.baseX, def.baseY, tx, ty, ins.rotation, ins.scaleX, ins.scaleY));
        } else {
          into.push(transformEntity(raw, def.baseX, def.baseY, tx, ty, ins.rotation, ins.scaleX, ins.scaleY));
        }
      }
    }
  }
}

/** Flatten a raw entity list, expanding every INSERT into its block geometry. */
function expandEntities(raws: RawEntity[], blocks: Map<string, BlockDef>, warnings: string[]): DxfEntity[] {
  const into: DxfEntity[] = [];
  for (const raw of raws) {
    if (into.length >= MAX_ENTITIES) {
      warnings.push("Entity limit reached; preview truncated.");
      break;
    }
    if (raw.type === "INSERT") expandInsert(raw, 0, blocks, into, warnings);
    else into.push(raw);
  }
  return into;
}

// ── Public parse API ─────────────────────────────────────────────────────────

export interface DxfDoc {
  entities: DxfEntity[];
  /** Layer name → hex color (or "currentColor" for the theme color 7). */
  layerColors: Record<string, string>;
  /** Non-fatal notes (unknown blocks, truncation, deep nesting). */
  warnings: string[];
}

/** Full parse: layers + expanded blocks. Callers wanting just entities use `parseDxf`. */
export function parseDxfDoc(source: string): DxfDoc {
  const groups = tokenize(source);
  const layers = scanLayers(groups);
  const blocks = scanBlocks(groups, layers);
  const warnings: string[] = [];
  const raws = parseEntityList(groups, 0, new Set(), layers).entities;
  const entities = expandEntities(raws, blocks, warnings);
  const layerColors: Record<string, string> = {};
  for (const [name, color] of layers) layerColors[name] = aciColor(color) ?? "currentColor";
  return { entities, layerColors, warnings };
}

/**
 * Parse a DXF ASCII source into a normalized, block-expanded entity list.
 * DXF is a stream of (group code, value) line pairs; group code 0 begins a
 * new entity. We read the groups we care about per entity type and ignore
 * everything else (headers, tables, VIEWPORT boilerplate, unsupported
 * entities) so any real DXF — even one produced by another CAD tool — parses
 * without throwing.
 *
 * Returns entities in document order (INSERTs fully expanded). An empty
 * string / unparsable source yields `[]`.
 */
export function parseDxf(source: string): DxfEntity[] {
  return parseDxfDoc(source).entities;
}

// ── Bounds + SVG renderer ───────────────────────────────────────────────────

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; }

/** Normalize an arc's sweep (degrees) to a positive span ≤ 360. */
function arcSpanDeg(a1: number, a2: number): number {
  if (!Number.isFinite(a1) || !Number.isFinite(a2)) return 0;
  const diff = a2 - a1;
  if (Math.abs(diff) < 1e-9) return 360;
  const span = ((diff % 360) + 360) % 360;
  return span === 0 ? 360 : span;
}

/** Sample a full/partial ellipse (parametric angles in radians) into points. */
function sampleEllipse(e: Extract<DxfEntity, { type: "ELLIPSE" }>): DxfPoint[] {
  let a1 = e.startParam;
  let a2 = e.endParam;
  if (!Number.isFinite(a1) || !Number.isFinite(a2)) return [];
  let span = a2 - a1;
  if (Math.abs(span) < 1e-9 || Math.abs(Math.abs(span) - Math.PI * 2) < 1e-9) {
    a1 = 0;
    a2 = Math.PI * 2;
    span = Math.PI * 2;
  } else {
    span = ((span % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (span === 0) { a1 = 0; a2 = Math.PI * 2; span = Math.PI * 2; }
  }
  const len = Math.hypot(e.majorDx, e.majorDy);
  const n = Math.max(8, Math.min(72, Math.ceil(span / (Math.PI / 18))));
  const b = len * e.ratio;
  const ux = len === 0 ? 1 : e.majorDx / len;
  const uy = len === 0 ? 0 : e.majorDy / len;
  const nx = -uy;
  const ny = ux;
  const pts: DxfPoint[] = [];
  for (let k = 0; k <= n; k++) {
    const t = a1 + (span * k) / n;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push({ x: e.cx + e.majorDx * ct + nx * b * st, y: e.cy + e.majorDy * ct + ny * b * st });
  }
  return pts;
}

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
      const span = arcSpanDeg(e.startAngle, e.endAngle);
      for (let a = 0; a <= span; a += 15) {
        const rad = ((e.startAngle + a) * Math.PI) / 180;
        push(e.cx + e.r * Math.cos(rad), e.cy + e.r * Math.sin(rad));
      }
    }
    else if (e.type === "ELLIPSE") { for (const p of sampleEllipse(e)) push(p.x, p.y); }
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
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number, f: (n: number) => string): string {
  const span = arcSpanDeg(startDeg, endDeg);
  if (span >= 359.999) return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`;
  const a1 = startDeg * D2R;
  const a2 = (startDeg + span) * D2R;
  // DXF arcs run counter-clockwise from start to end; SVG y is flipped so the
  // visual direction flips too (a CCW CAD arc reads CW on screen).
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2);
  const y2 = cy + r * Math.sin(a2);
  const largeArc = span > 180 ? 1 : 0;
  const sweep = 1; // screen flip of the CCW CAD arc
  return `<path d="M${f(x1)} ${f(y1)} A${f(r)} ${f(r)} 0 ${largeArc} ${sweep} ${f(x2)} ${f(y2)}"/>`;
}

function ellipsePath(e: Extract<DxfEntity, { type: "ELLIPSE" }>, f: (n: number) => string): string {
  const pts = sampleEllipse(e);
  if (pts.length < 2) return "";
  const diff = e.endParam - e.startParam;
  const isFull = Math.abs(diff) < 1e-9 || Math.abs(Math.abs(diff) - Math.PI * 2) < 1e-9;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p.x)} ${f(p.y)}`).join(" ") + (isFull ? " Z" : "");
  return `<path d="${d}"/>`;
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

/**
 * Render parsed DXF entities to a self-contained SVG string that fits the
 * content in a viewBox. Entities carry their resolved ACI colors; entities
 * without a renderable color (BYLAYER-on-color-7 etc.) use `currentColor` so
 * the preview follows the app theme. `maxView` caps the largest viewBox
 * dimension; the drawing keeps aspect ratio either way. Returns an empty
 * string when nothing is renderable.
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

  const render = (e: DxfEntity): string => {
    if (e.type === "LINE") {
      return `<line x1="${f(e.x1)}" y1="${f(e.y1)}" x2="${f(e.x2)}" y2="${f(e.y2)}"/>`;
    }
    if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      if (e.points.length < 2) return "";
      const pts = e.points.map(p => `${f(p.x)},${f(p.y)}`).join(" ");
      let out = `<polyline points="${pts}"/>`;
      if (e.closed) {
        const a = e.points[0];
        const b = e.points[e.points.length - 1];
        out += `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}"/>`;
      }
      return out;
    }
    if (e.type === "CIRCLE") return `<circle cx="${f(e.cx)}" cy="${f(e.cy)}" r="${f(e.r)}"/>`;
    if (e.type === "ARC") return arcPath(e.cx, e.cy, e.r, e.startAngle, e.endAngle, f);
    if (e.type === "ELLIPSE") return ellipsePath(e, f);
    return "";
  };

  // Group geometry by resolved stroke color.
  const byColor = new Map<string, DxfEntity[]>();
  for (const e of entities) {
    if (e.type === "TEXT") continue;
    const color = resolveStroke(e);
    let list = byColor.get(color);
    if (!list) { list = []; byColor.set(color, list); }
    list.push(e);
  }
  for (const [color, list] of byColor) {
    const stroke = color === "currentColor" ? "stroke=\"currentColor\"" : `stroke="${color}"`;
    parts.push(`<g fill="none" ${stroke} stroke-width="${num(sw)}" stroke-linecap="round" stroke-linejoin="round">`);
    for (const e of list) parts.push(render(e));
    parts.push("</g>");
  }

  // TEXT is drawn above the geometry, filled in its resolved color.
  const texts = entities.filter((e): e is Extract<DxfEntity, { type: "TEXT" }> => e.type === "TEXT");
  if (texts.length > 0) {
    const tByColor = new Map<string, Extract<DxfEntity, { type: "TEXT" }>[]>();
    for (const t of texts) {
      const color = resolveStroke(t);
      let list = tByColor.get(color);
      if (!list) { list = []; tByColor.set(color, list); }
      list.push(t);
    }
    for (const [color, list] of tByColor) {
      const fill = color === "currentColor" ? "fill=\"currentColor\"" : `fill="${color}"`;
      parts.push(`<g ${fill} stroke="none" font-family="sans-serif" text-anchor="start">`);
      for (const t of list) {
        parts.push(`<text x="${f(t.x)}" y="${f(t.y)}" font-size="${f(t.height)}">${escapeXml(t.text)}</text>`);
      }
      parts.push("</g>");
    }
  }
  parts.push("</svg>");
  return parts.join("");
}

/** Count of renderable entities (for the preview footer / empty state). */
export function entityCount(entities: DxfEntity[]): number {
  return entities.length;
}

/** Layer name → number of entities, for the preview layer summary. */
export function layerCounts(entities: DxfEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.layer] = (counts[e.layer] ?? 0) + 1;
  return counts;
}
