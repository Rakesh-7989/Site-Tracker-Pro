// SiteTrack Pro — monthly statement PDF export (v4 Phase D backlog).
//
// Client-side PDF generation with jsPDF. Builds a printable org-wide statement:
// header (org + month), a summary block of the key totals, and a per-project
// financial table (10 columns from the view). The table is drawn with jsPDF's
// raw text/fill APIs so it needs no autotable dependency.

import { jsPDF } from "jspdf";
import type { MonthlyStatementRow, MonthlyStatementTotals } from "../queries/monthlyStatementQueries";

const PAGE_W = 210;   // A4, mm
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

const MONO = "helvetica";
const BOLD = "bold";
const NORMAL = "normal";

const INDIGO: [number, number, number] = [79, 70, 229];   // indigo-600
const GRAY: [number, number, number] = [107, 114, 128];   // gray-500
const DARK: [number, number, number] = [31, 41, 55];       // gray-800
const LIGHT: [number, number, number] = [243, 244, 246];   // gray-100
const BORDER: [number, number, number] = [209, 213, 219];  // gray-300

/** Format an INR amount as a compact string for PDF cells. */
export function pdfRupees(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const rounded = Math.round(v);
  return (rounded < 0 ? "-₹" : "₹") + Math.abs(rounded).toLocaleString("en-IN");
}

/** Capitalize a project type for display. */
export function pdfType(t: string | null): string {
  if (!t) return "—";
  const s = t.charAt(0).toUpperCase() + t.slice(1);
  return s.replace(/_/g, " ");
}

/** Month label from a YYYY-MM string, e.g. "2026-08" → "August 2026". */
export function pdfMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

interface PdfCol {
  key: keyof MonthlyStatementRow;
  title: string;
  w: number;
  align: "left" | "right";
}

const COLUMNS: PdfCol[] = [
  { key: "name", title: "Project", w: 40, align: "left" },
  { key: "invoicedPhase", title: "Phase", w: 16, align: "right" },
  { key: "invoicedHourly", title: "Hourly", w: 16, align: "right" },
  { key: "invoicedRetainer", title: "Retainer", w: 17, align: "right" },
  { key: "invoicedTotal", title: "Invoiced", w: 18, align: "right" },
  { key: "mrr", title: "MRR", w: 16, align: "right" },
  { key: "expenses", title: "Expenses", w: 18, align: "right" },
  { key: "raBills", title: "RA Bills", w: 17, align: "right" },
  { key: "poReceipts", title: "PO Recv", w: 18, align: "right" },
];

/** X (left edge) of a column, in mm. */
function colX(i: number): number {
  return MARGIN + COLUMNS.slice(0, i).reduce((s, c) => s + c.w, 0);
}

/** Cell value for a row: project name for the name column, ₹ formatted else. */
function cellText(p: MonthlyStatementRow, c: PdfCol): string {
  if (c.key === "name") return p.name;
  const v = p[c.key];
  return pdfRupees(Number(v));
}

const ROW_H = 7;

function drawSummary(doc: jsPDF, totals: MonthlyStatementTotals, y: number): number {
  const items: Array<[string, string, [number, number, number]]> = [
    ["Total Invoiced", pdfRupees(totals.invoicedTotal), INDIGO],
    ["Retainer MRR", pdfRupees(totals.mrr), DARK],
    ["Expenses", pdfRupees(totals.expenses), DARK],
    ["RA Bills", pdfRupees(totals.raBills), DARK],
    ["PO Receipts", pdfRupees(totals.poReceipts), DARK],
  ];
  const boxW = CONTENT_W / items.length;
  let xx = MARGIN;
  for (const [label, val, color] of items) {
    doc.setFillColor(...LIGHT);
    doc.rect(xx, y, boxW - 2, 20, "F");
    doc.setFont(MONO, NORMAL); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(label.toUpperCase(), xx + 3, y + 7, { align: "left" });
    doc.setFont(MONO, BOLD); doc.setFontSize(12); doc.setTextColor(...color);
    doc.text(val, xx + 3, y + 15.5, { align: "left" });
    xx += boxW;
  }
  return y + 26;
}

function drawTable(doc: jsPDF, rows: MonthlyStatementRow[], y: number): number {
  // Header row
  doc.setFont(MONO, BOLD); doc.setFontSize(8);
  doc.setFillColor(...INDIGO);
  doc.rect(MARGIN, y, CONTENT_W, ROW_H, "F");
  doc.setTextColor(255, 255, 255);
  COLUMNS.forEach((c, i) => {
    const x = colX(i) + (c.align === "right" ? c.w - 2 : 2);
    doc.text(c.title, x, y + 4.8, { align: c.align === "right" ? "right" : "left" });
  });
  let yy = y + ROW_H;

  doc.setFont(MONO, NORMAL); doc.setFontSize(8);
  rows.forEach((p, idx) => {
    if (idx % 2 === 1) { doc.setFillColor(...LIGHT); doc.rect(MARGIN, yy, CONTENT_W, ROW_H, "F"); }
    doc.setTextColor(...DARK);
    COLUMNS.forEach((c, i) => {
      const x = colX(i) + (c.align === "right" ? c.w - 2 : 2);
      doc.text(cellText(p, c), x, yy + 4.8, { align: c.align === "right" ? "right" : "left" });
    });
    yy += ROW_H;
  });

  // Totals row
  doc.setFillColor(...BORDER);
  doc.rect(MARGIN, yy, CONTENT_W, ROW_H, "F");
  doc.setFont(MONO, BOLD); doc.setTextColor(...DARK);
  COLUMNS.forEach((c, i) => {
    const x = colX(i) + (c.align === "right" ? c.w - 2 : 2);
    const val = c.key === "name" ? "Totals" : pdfRupees(rows.reduce((s, p) => s + Number(p[c.key]), 0));
    doc.text(val, x, yy + 4.8, { align: c.align === "right" ? "right" : "left" });
  });
  return yy + ROW_H;
}

/**
 * Build a Monthly Statement PDF and trigger a download. Pure-ish: only side
 * effect is the browser download of the generated blob.
 */
export function downloadMonthlyStatementPdf(params: {
  orgName: string;
  month: string;            // YYYY-MM
  rows: MonthlyStatementRow[];
  totals: MonthlyStatementTotals;
}): void {
  const { orgName, month, rows, totals } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // Header
  doc.setFont(MONO, BOLD); doc.setFontSize(14); doc.setTextColor(...DARK);
  doc.text("MONTHLY STATEMENT", MARGIN, 22);
  doc.setFont(MONO, NORMAL); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(orgName, MARGIN, 29);
  doc.text(pdfMonthLabel(month), MARGIN, 34.5);
  const now = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  doc.setFont(MONO, NORMAL); doc.setFontSize(7.5);
  doc.text(`Generated ${now}`, PAGE_W - MARGIN, 22, { align: "right" });

  // Accent rule
  doc.setDrawColor(...INDIGO); doc.setLineWidth(0.8);
  doc.line(MARGIN, 39, PAGE_W - MARGIN, 39);

  let y = 48;
  y = drawSummary(doc, totals, y);
  y += 4;
  drawTable(doc, rows, y);

  // Footer note
  doc.setFont(MONO, NORMAL); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text("Invoiced = invoices issued in the month by source. MRR = active retainers. Hours = approved billable consultancy effort.",
    MARGIN, PAGE_H - 14);

  doc.save(`monthly-statement-${month}.pdf`);
}
