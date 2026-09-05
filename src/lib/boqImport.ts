import { BOQ_UNITS } from "../data/lookups";

const VALID_CATEGORIES = ["Civil", "MEP", "Finishing", "External", "Other"];

type HeaderField = "code" | "description" | "category" | "unit" | "qty" | "rate";

const HEADER_MAP: [string[], HeaderField][] = [
  [["code", "item code", "sl", "sno", "s.no", "item no", "ref"], "code"],
  [["description", "desc", "item description", "particulars", "item name", "work"], "description"],
  [["category", "cat", "type", "group", "head"], "category"],
  [["unit", "uom", "u.o.m"], "unit"],
  [["qty", "quantity", "no.", "nos"], "qty"],
  [["rate", "rate (rs)", "rate per unit", "unit rate", "unit price", "price"], "rate"],
];

export function detectSeparator(text: string): string {
  if (!text || typeof text !== "string") return ",";
  const firstLine = text.split(/\r?\n/)[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

export function splitLine(line: string, sep: string = ","): string[] {
  if (!line) return [];
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = false; continue; }
      cur += ch;
    } else {
      if (ch === '"') { inQ = true; continue; }
      if (ch === sep) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function looksLikeHeader(cells: string[]): boolean {
  if (!cells || cells.length === 0) return false;
  const lowered = cells.map(c => String(c).toLowerCase());
  for (const [keys] of HEADER_MAP) {
    for (const k of keys) {
      if (lowered.some(c => c.includes(k))) return true;
    }
  }
  return false;
}

export function buildColumnMap(headerCells: string[]): Partial<Record<HeaderField, number>> {
  const map: Partial<Record<HeaderField, number>> = {};
  if (!headerCells) return map;
  headerCells.forEach((cell, idx) => {
    const l = String(cell).toLowerCase().trim();
    if (!l) return;
    let bestField: HeaderField | null = null;
    let bestScore = 0;
    for (const [keys, field] of HEADER_MAP) {
      for (const k of keys) {
        let score = 0;
        if (l === k) score = 1000;
        else if (l.includes(k)) score = k.length;
        if (score > bestScore) {
          bestScore = score;
          bestField = field;
        }
      }
    }
    if (bestField && !(bestField in map)) map[bestField] = idx;
  });
  return map;
}

function defaultColumnMap(rowLength: number): Partial<Record<HeaderField, number>> {
  if (rowLength >= 6) return { code: 0, description: 1, category: 2, unit: 3, qty: 4, rate: 5 };
  if (rowLength === 5) return { code: 0, description: 1, unit: 2, qty: 3, rate: 4 };
  if (rowLength === 4) return { description: 0, unit: 1, qty: 2, rate: 3 };
  if (rowLength === 3) return { description: 0, qty: 1, rate: 2 };
  return { description: 0 };
}

function toNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/[₹,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normaliseCategory(v: string | null | undefined): string {
  if (!v) return "Other";
  const lowered = String(v).toLowerCase().trim();
  for (const cat of VALID_CATEGORIES) {
    if (cat.toLowerCase() === lowered) return cat;
  }
  return "Other";
}

function normaliseUnit(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).trim();
  const known = BOQ_UNITS.find(u => u.toLowerCase() === s.toLowerCase());
  return known || s;
}

interface BoqRow {
  code: string;
  description: string;
  category: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number;
  sort: number;
  rowNo: number;
}

interface ParseError {
  rowNo: number;
  message: string;
}

interface ParseSummary {
  detected: {
    separator: string;
    hasHeader: boolean;
    columns: Partial<Record<HeaderField, number>>;
  };
  totalLines: number;
  validRows: number;
  invalidRows: number;
  total: number;
}

interface ParseResult {
  rows: BoqRow[];
  errors: ParseError[];
  summary: ParseSummary;
}

interface ParseOptions {
  separator?: string;
  hasHeader?: boolean;
}

export function parseBoq(text: string, opts: ParseOptions = {}): ParseResult {
  const rows: BoqRow[] = [];
  const errors: ParseError[] = [];
  if (!text || typeof text !== "string") {
    return { rows, errors: [{ rowNo: 0, message: "Empty input" }], summary: { totalLines: 0, validRows: 0, invalidRows: 0, total: 0, detected: { separator: "", hasHeader: false, columns: {} } } };
  }
  const sep = opts.separator || detectSeparator(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows, errors: [{ rowNo: 0, message: "No data lines found" }], summary: { totalLines: 0, validRows: 0, invalidRows: 0, total: 0, detected: { separator: sep === "\t" ? "TAB" : "COMMA", hasHeader: false, columns: {} } } };
  }

  const firstCells = splitLine(lines[0], sep);
  const hasHeader = opts.hasHeader !== undefined ? opts.hasHeader : looksLikeHeader(firstCells);
  const colMap = hasHeader ? buildColumnMap(firstCells) : defaultColumnMap(firstCells.length);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  let total = 0;
  dataLines.forEach((line, i) => {
    const rowNo = (hasHeader ? i + 2 : i + 1);
    const cells = splitLine(line, sep);
    const description = colMap.description !== undefined ? cells[colMap.description] : "";
    const qty = colMap.qty !== undefined ? toNumber(cells[colMap.qty]) : null;
    const rate = colMap.rate !== undefined ? toNumber(cells[colMap.rate]) : null;
    if (!description || !description.trim()) {
      errors.push({ rowNo, message: "Description is empty" });
      return;
    }
    if (qty === null || qty <= 0) {
      errors.push({ rowNo, message: `Quantity must be a positive number (got "${cells[colMap.qty!] || ""}")` });
      return;
    }
    if (rate === null || rate < 0) {
      errors.push({ rowNo, message: `Rate must be a non-negative number (got "${cells[colMap.rate!] || ""}")` });
      return;
    }
    const amount = qty * rate;
    total += amount;
    rows.push({
      code:        colMap.code !== undefined ? String(cells[colMap.code] || "").trim() : "",
      description: description.trim(),
      category:    normaliseCategory(colMap.category !== undefined ? cells[colMap.category] : ""),
      unit:        normaliseUnit(colMap.unit !== undefined ? cells[colMap.unit] : ""),
      qty,
      rate,
      amount,
      sort:        rows.length + 1,
      rowNo,
    });
  });

  return {
    rows,
    errors,
    summary: {
      detected: { separator: sep === "\t" ? "TAB" : "COMMA", hasHeader, columns: colMap },
      totalLines: dataLines.length,
      validRows: rows.length,
      invalidRows: errors.length,
      total,
    },
  };
}

interface ApplyOptions {
  mode?: "append" | "replace";
}

interface BoqImportRow {
  code?: string;
  description: string;
  category?: string;
  unit?: string;
  qty: number;
  rate: number;
  sort?: number;
}

interface BoqState {
  [projectId: string]: BoqImportRow[];
}

export function applyBoqImport(state: BoqState | undefined, projectId: string, parsedRows: BoqImportRow[], opts: ApplyOptions = {}): BoqState {
  if (!projectId || !Array.isArray(parsedRows) || parsedRows.length === 0) return state || {};
  const mode = opts.mode || "append";
  const next: BoqState = { ...(state || {}) };
  const existing = mode === "replace" ? [] : [...(next[projectId] || [])];
  const startSort = existing.reduce((max: number, r) => Math.max(max, r.sort || 0), 0);
  const fresh = parsedRows.map((r, i) => ({
    id: `bq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}`,
    code: r.code || "",
    description: r.description,
    category: r.category || "Other",
    unit: r.unit || "",
    qty: r.qty,
    rate: r.rate,
    sort: startSort + i + 1,
  }));
  next[projectId] = [...existing, ...fresh];
  return next;
}
