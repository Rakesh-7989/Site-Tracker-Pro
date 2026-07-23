// SiteTrack Pro -- HTML / CSV escape helpers
//
// Why this exists: exportPDF, buildDPR, and exportCSV interpolate user-supplied
// strings (project names, notes, issue titles, expense descriptions, client
// names) directly into HTML template strings or CSV rows. Without escaping,
// a project named '<script>alert(1)</script>' would execute inside the print
// window, and a description containing ',' would shift CSV columns.
//
// Tech Lead Review finding HIGH-1 (2026-05-22).

interface HtmlEscapeMap {
  [char: string]: string;
}

// HTML -- escape the 5 characters that have meaning in HTML / attribute values.
// Map covers both element content and attribute values (single + double quote).
const HTML_ESCAPE_MAP: HtmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch]);
}

// Short alias for use inside template literals -- ${h(name)} is the convention.
export const h: typeof escapeHtml = escapeHtml;

// CSV -- RFC 4180 style. If the field contains a comma, double-quote, newline,
// or carriage return, wrap in double quotes and double-escape any embedded
// quotes. Also defensive against CSV injection (formula prefixes).
const CSV_DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Defuse formula injection: Excel/Numbers treat lines starting with =, +, -,
  // @ as formulas. Prefix with apostrophe so the cell displays the original
  // text without evaluating it.
  if (CSV_DANGEROUS_PREFIX.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Build a CSV row from an array of cells.
export function csvRow(cells: unknown[]): string {
  return cells.map(escapeCsv).join(",");
}
