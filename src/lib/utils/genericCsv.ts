// SiteTrack Pro — v5 Phase G5: generic CSV export helpers.
//
// Single, testable source for building + downloading CSV blobs from an array
// of records. Reuses escape.cscvRow for RFC-4180 escaping + CSV-injection
// defusal, and pre-pends a UTF-8 BOM so Excel opens accented/multilingual
// text (Telugu/Hindi) correctly. The download helper is the only DOM-touching
// part; everything else is pure so it can be unit-tested.

import { csvRow } from "./escape";

export interface CsvColumn<K extends string> {
  /** Record key to read from each row. */
  key: K;
  /** Header label (defaults to the key). */
  label?: string;
}

export const CSV_BOM = "\uFEFF";

/** Pick a value for a column, coercing to a display string. */
export function csvCell(row: Record<string, unknown>, key: string): unknown {
  return row?.[key] ?? "";
}

/** Pure: build a CSV string (with BOM) from rows + column spec. */
export function buildCsv<K extends string>(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<CsvColumn<K>>,
): string {
  if (!Array.isArray(rows) || rows.length === 0 || !columns.length) return "";
  const head = columns.map(c => c.label ?? c.key);
  const lines = [csvRow(head)];
  for (const r of rows) {
    lines.push(csvRow(columns.map(c => csvCell(r as Record<string, unknown>, c.key))));
  }
  // BOM first so Excel treats the body as UTF-8 (not the system ANSI codepage).
  return CSV_BOM + lines.join("\r\n");
}

/** Convenience: plain string cells (for one-off fixed-column exports). */
export function buildCsvRows(rows: ReadonlyArray<unknown[]>): string {
  if (!rows.length) return "";
  return CSV_BOM + rows.map(csvRow).join("\r\n");
}

/** Trigger a browser download of `content`. Pure-ish: only touches the DOM. */
export function downloadCsv(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** "2026-08-07" filename-friendly date stamp (local, not UTC shift-proof). */
export function csvDateStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}