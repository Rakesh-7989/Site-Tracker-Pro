// SiteTrack Pro — BOQ Excel/CSV import (Session 25, missed in v1-v24).
//
// Per the competitor-comparison doc §19: the SINGLE biggest sales miss. Every
// Indian builder has 5-50 historical BOQs in Excel today. Without one-click
// upload, asking them to re-enter 200 line items by hand is a guaranteed
// lost sale.
//
// This module is the import pipeline:
//   1. Accept paste text (TSV from Excel) OR raw CSV string.
//   2. Auto-detect separator (tab or comma).
//   3. Auto-map columns to BOQ schema {code, description, category, unit, qty, rate}.
//   4. Validate rows (qty + rate must be positive numbers, description required).
//   5. Return { rows, errors, summary } so the UI can show a preview + commit.
//
// We deliberately DON'T parse real .xlsx (would need SheetJS at ~200kB
// gzipped). Indian users universally copy-paste Excel rows or export to CSV.
// Both produce TSV/CSV at the byte level, which is what we handle.

import { BOQ_UNITS } from "../data/lookups.js";

const VALID_CATEGORIES = ["Civil", "MEP", "Finishing", "External", "Other"];

// Header keywords for auto-mapping. Right side = canonical field name.
// Match is substring + case-insensitive.
const HEADER_MAP = [
  [["code", "item code", "sl", "sno", "s.no", "item no", "ref"], "code"],
  [["description", "desc", "item description", "particulars", "item name", "work"], "description"],
  [["category", "cat", "type", "group", "head"], "category"],
  [["unit", "uom", "u.o.m"], "unit"],
  [["qty", "quantity", "no.", "nos"], "qty"],
  [["rate", "rate (rs)", "rate per unit", "unit rate", "unit price", "price"], "rate"],
];

/** Detect whether input looks like TSV (Excel paste) vs CSV. */
export function detectSeparator(text) {
  if (!text || typeof text !== "string") return ",";
  const firstLine = text.split(/\r?\n/)[0] || "";
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

/** Split a single CSV/TSV line, respecting quoted fields. RFC-4180-ish. */
export function splitLine(line, sep = ",") {
  if (!line) return [];
  const out = [];
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

/** True if a row looks like a header (mostly text, no numeric qty/rate). */
export function looksLikeHeader(cells) {
  if (!cells || cells.length === 0) return false;
  const lowered = cells.map(c => String(c).toLowerCase());
  // Any header keyword present?
  for (const [keys] of HEADER_MAP) {
    for (const k of keys) {
      if (lowered.some(c => c.includes(k))) return true;
    }
  }
  return false;
}

/** Given a header row, build a column index map: { code: 0, description: 1, qty: 3, ... }
 *
 * For each cell, pick the BEST matching field (longest keyword match wins, so
 * "Unit Rate" matches `rate` via the "unit rate" keyword rather than `unit`
 * via the shorter "unit" keyword). Exact equality beats substring.
 */
export function buildColumnMap(headerCells) {
  const map = {};
  if (!headerCells) return map;
  headerCells.forEach((cell, idx) => {
    const l = String(cell).toLowerCase().trim();
    if (!l) return;
    let bestField = null;
    let bestScore = 0;
    for (const [keys, field] of HEADER_MAP) {
      for (const k of keys) {
        let score = 0;
        if (l === k) score = 1000;            // exact match wins
        else if (l.includes(k)) score = k.length; // longer substring beats shorter
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

/** If headers are absent, fall back to positional defaults (the common 6-column Excel layout). */
function defaultColumnMap(rowLength) {
  // Most Indian BOQ Excels follow: code | description | category | unit | qty | rate
  // If only 4 cols, drop code + category and assume desc | unit | qty | rate.
  if (rowLength >= 6) return { code: 0, description: 1, category: 2, unit: 3, qty: 4, rate: 5 };
  if (rowLength === 5) return { code: 0, description: 1, unit: 2, qty: 3, rate: 4 };
  if (rowLength === 4) return { description: 0, unit: 1, qty: 2, rate: 3 };
  if (rowLength === 3) return { description: 0, qty: 1, rate: 2 };
  return { description: 0 };
}

/** Coerce a cell to a number, returning null on failure. Strips ₹ + commas. */
function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).replace(/[₹,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Pick a valid category, falling back to "Other". */
function normaliseCategory(v) {
  if (!v) return "Other";
  const lowered = String(v).toLowerCase().trim();
  for (const cat of VALID_CATEGORIES) {
    if (cat.toLowerCase() === lowered) return cat;
  }
  return "Other";
}

/** Pick a valid unit, falling back to the raw value (preserves user intent). */
function normaliseUnit(v) {
  if (!v) return "";
  const s = String(v).trim();
  const known = BOQ_UNITS.find(u => u.toLowerCase() === s.toLowerCase());
  return known || s;
}

/**
 * Parse CSV/TSV text into a preview-ready list of BOQ rows + errors.
 *
 * Returns:
 *   {
 *     rows:    [{ code, description, category, unit, qty, rate, amount, sort, rowNo }],
 *     errors:  [{ rowNo, message }],
 *     summary: { detected: { separator, hasHeader, columns }, totalLines, validRows, invalidRows, total }
 *   }
 *
 * The caller commits `rows` (those that have no entry in `errors`) to BOQ state.
 */
export function parseBoq(text, opts = {}) {
  const rows = [];
  const errors = [];
  if (!text || typeof text !== "string") {
    return { rows, errors: [{ rowNo: 0, message: "Empty input" }], summary: { totalLines: 0, validRows: 0, invalidRows: 0, total: 0 } };
  }
  const sep = opts.separator || detectSeparator(text);
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return { rows, errors: [{ rowNo: 0, message: "No data lines found" }], summary: { totalLines: 0, validRows: 0, invalidRows: 0, total: 0 } };
  }

  // Header detection
  const firstCells = splitLine(lines[0], sep);
  const hasHeader = opts.hasHeader !== undefined ? opts.hasHeader : looksLikeHeader(firstCells);
  const colMap = hasHeader ? buildColumnMap(firstCells) : defaultColumnMap(firstCells.length);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  let total = 0;
  dataLines.forEach((line, i) => {
    const rowNo = (hasHeader ? i + 2 : i + 1); // 1-indexed line numbers for error messages
    const cells = splitLine(line, sep);
    const description = colMap.description !== undefined ? cells[colMap.description] : "";
    const qty = colMap.qty !== undefined ? toNumber(cells[colMap.qty]) : null;
    const rate = colMap.rate !== undefined ? toNumber(cells[colMap.rate]) : null;
    // Required field check
    if (!description || !description.trim()) {
      errors.push({ rowNo, message: "Description is empty" });
      return;
    }
    if (qty === null || qty <= 0) {
      errors.push({ rowNo, message: `Quantity must be a positive number (got "${cells[colMap.qty] || ""}")` });
      return;
    }
    if (rate === null || rate < 0) {
      errors.push({ rowNo, message: `Rate must be a non-negative number (got "${cells[colMap.rate] || ""}")` });
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

/**
 * Apply parsed rows to existing BOQ state for a project. Returns NEW state.
 * Preserves existing rows (rows are appended), assigns fresh ids.
 *
 * mode: "append" (default) | "replace"
 */
export function applyBoqImport(state, projectId, parsedRows, opts = {}) {
  if (!projectId || !Array.isArray(parsedRows) || parsedRows.length === 0) return state || {};
  const mode = opts.mode || "append";
  const next = { ...(state || {}) };
  const existing = mode === "replace" ? [] : [...(next[projectId] || [])];
  const startSort = existing.reduce((max, r) => Math.max(max, r.sort || 0), 0);
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
