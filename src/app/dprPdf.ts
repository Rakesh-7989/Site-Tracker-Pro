// SiteTrack Pro — v5 Phase G4: DPR PDF export.
//
// Client-side PDF generation with jsPDF (same dep as monthlyStatementPdf.ts).
// Renders a single Daily Progress Report: header (supervisor + date + status),
// the transcribed site update, a photo & geotag block, optional media/anchor
// rows, and a footer. Also exports pure helpers (labels, colors, wa.me link,
// env gate) so the UI can gate the WhatsApp share affordance without pulling
// jsPDF into tests.

import { jsPDF } from "jspdf";
import type { DprMessageRow } from "./dprQueries";

const PAGE_W = 210;   // A4, mm
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

const MONO = "helvetica";
const BOLD = "bold";
const NORMAL = "normal";

const BRAND: [number, number, number] = [204, 113, 47];   // accent orange
const DARK: [number, number, number] = [31, 41, 55];       // gray-800
const GRAY: [number, number, number] = [107, 114, 128];    // gray-500
const LIGHT: [number, number, number] = [243, 244, 246];   // gray-100
const BORDER: [number, number, number] = [209, 213, 219];  // gray-300
const GREEN: [number, number, number] = [22, 163, 74];
const RED: [number, number, number] = [220, 38, 38];
const AMBER: [number, number, number] = [180, 83, 9];

/** Human date from an ISO string, e.g. "2026-08-01T…" → "01 Aug 2026, 10:35". */
export function dprDateLabel(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Terminal statuses render in color; in-flight ones amber. */
export function statusColor(status: string): [number, number, number] {
  if (status === "sent" || status === "delivered" || status === "read") return GREEN;
  if (status === "failed") return RED;
  if (status === "queued" || status === "sending") return AMBER;
  return GRAY;
}

/** Human label for a DPR status. */
export function pdfStatusLabel(status: string): string {
  switch (status) {
    case "queued": return "Queued";
    case "sending": return "Sending";
    case "sent": return "Sent";
    case "delivered": return "Delivered";
    case "read": return "Read";
    case "failed": return "Failed";
    default: return status;
  }
}

/** Short hex pair, e.g. "a1b2c3…" for the voice/hash display. */
export function shortHash(h: string | null): string {
  if (!h) return "";
  const s = h.replace(/[^0-9a-fA-F]/g, "").slice(0, 10);
  return s ? `${s}…` : "";
}

/**
 * Env gate for the "Share PDF on WhatsApp" affordance. Defaults ON in dev,
 * OFF in prod; set VITE_DPR_PDF_WHATSAPP=1 to force on, =0 to force off.
 */
export function dprWhatsAppShareEnabled(env: { VITE_DPR_PDF_WHATSAPP?: string; DEV?: boolean }): boolean {
  if (env.VITE_DPR_PDF_WHATSAPP === "0") return false;
  if (env.VITE_DPR_PDF_WHATSAPP === "1") return true;
  return Boolean(env.DEV);
}

/** Build the wa.me deep-link for sharing a DPR. */
export function waShareLink(phone: string, text: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Open WhatsApp composer with pre-filled data.
 *  Supports both single-phone (detail view) and multi-recipient (org composer).
 */
export function openWhatsAppComposer(data: {
  phone: string;
  title: string;
  project?: string;
  status?: string;
  transcript?: string;
}): void {
  const { phone, title, project, status, transcript } = data;
  // Build message text
  let text = title;
  if (project) text += `\nProject: ${project}`;
  if (status) text += `\nStatus: ${status}`;
  if (transcript) text += `\n${transcript}`;
  // WhatsApp URL: whatsapp://send?phone=<phone>&text=<text>
  // URL-encode the message text
  const encodedText = encodeURIComponent(text);
  const whatsappUrl = `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodedText}`;
  // Open in new tab
  const win = window.open(whatsappUrl, "_blank");
  // If popup blocked, fallback to just setting the href for user to click
  if (!win) {
    // Create a temporary link element to trigger the download/programmatic open
    const link = document.createElement("a");
    link.href = whatsappUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/** Filter a key/value map down to present (non-empty) rows. */
export function rowPairs(o: Record<string, string>): Array<[string, string]> {
  return Object.entries(o).filter(([, v]) => v && v.trim().length > 0);
}

/** Wrap text to a width (mm) using the doc's current font metrics. */
function wrapText(text: string, width: number, doc: jsPDF): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (doc.getTextWidth(test) > width && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function drawHeader(doc: jsPDF, row: DprMessageRow): void {
  doc.setFont(MONO, BOLD); doc.setFontSize(14); doc.setTextColor(...DARK);
  doc.text("DAILY PROGRESS REPORT", MARGIN, 20);
  doc.setFont(MONO, NORMAL); doc.setFontSize(9); doc.setTextColor(...GRAY);
  doc.text(`Supervisor${row.supervisorName ? ` · ${row.supervisorName}` : ""}`, MARGIN, 27);
  doc.setFontSize(8); doc.setTextColor(...DARK);
  doc.text(dprDateLabel(row.createdAt), PAGE_W - MARGIN, 20, { align: "right" });

  // Accent rule
  doc.setDrawColor(...BRAND); doc.setLineWidth(0.8);
  doc.line(MARGIN, 32, PAGE_W - MARGIN, 32);
}

function addPageIfNeeded(doc: jsPDF, y: number): number {
  return y > PAGE_H - 24 ? (doc.addPage(), MARGIN) : y;
}

function kvRow(doc: jsPDF, label: string, value: string, y: number, color: [number, number, number] = DARK): number {
  doc.setFont(MONO, BOLD); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  doc.text(label.toUpperCase(), MARGIN, y);
  doc.setFont(MONO, NORMAL); doc.setFontSize(9); doc.setTextColor(...color);
  doc.text(value, MARGIN + 36, y);
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.line(MARGIN, y + 4.5, PAGE_W - MARGIN, y + 4.5);
  return y + 12;
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...LIGHT);
  doc.rect(MARGIN, y, CONTENT_W, 4, "F");
  doc.setFont(MONO, BOLD); doc.setFontSize(7.5); doc.setTextColor(...DARK);
  doc.text(title, MARGIN + 3, y + 3);
  return y + 14;
}

/**
 * Build a DPR PDF and trigger a download. Pure-ish: the only side effect is
 * the browser download of the generated blob.
 */
export function downloadDprPdf(row: DprMessageRow, orgName: string): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  drawHeader(doc, row);

  let y = 40;

  // ── Summary block ──
  y = kvRow(doc, "Report ID", row.metaMessageId ? `Meta ${row.metaMessageId.slice(0, 14)}…` : row.id.slice(0, 8), y);
  y = kvRow(doc, "Status", pdfStatusLabel(row.status), y, statusColor(row.status));
  y = kvRow(doc, "Promoter", row.promoterPhone || "—", y);
  if (row.locationId) y = kvRow(doc, "Location", row.locationLabel || row.locationId.slice(0, 8), y);

  // ── Transcript ──
  if (row.transcript) {
    y = addPageIfNeeded(doc, y);
    doc.setFont(MONO, BOLD); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text("SITE UPDATE", MARGIN, y);
    y += 4;
    doc.setFont(MONO, NORMAL); doc.setFontSize(9); doc.setTextColor(...DARK);
    for (const line of wrapText(row.transcript, CONTENT_W, doc)) {
      doc.text(line, MARGIN, y);
      y += 4.5;
    }
    y += 2;
  }

  // ── Photo & geotag ──
  if (row.photoUrl || row.lat != null || row.photoAccuracyMetres != null || row.photoTakenAt) {
    y = addPageIfNeeded(doc, y);
    y = sectionTitle(doc, "PHOTO & GEOTAG", y);
    const pairs = rowPairs({
      "Photo attached": row.photoUrl ? "Yes" : "No",
      "Coordinates": row.lat != null && row.lon != null ? `${row.lat.toFixed(6)}, ${row.lon.toFixed(6)}` : "—",
      "Accuracy": row.photoAccuracyMetres != null ? `±${row.photoAccuracyMetres} m` : "—",
      "Taken at": row.photoTakenAt ? dprDateLabel(row.photoTakenAt) : "—",
    });
    for (const [k, v] of pairs) { y = kvRow(doc, k, v, y); y = addPageIfNeeded(doc, y); }
  }

  // ── Media & BuildNow anchor ──
  if (row.voiceSha256 || row.buildnowAnchorHash || row.buildnowAnchorUrl) {
    y = addPageIfNeeded(doc, y);
    y = sectionTitle(doc, "MEDIA & ANCHOR", y);
    if (row.voiceSha256) y = kvRow(doc, "Voice (sha256)", shortHash(row.voiceSha256), y);
    if (row.buildnowAnchorHash) y = kvRow(doc, "BuildNow hash", shortHash(row.buildnowAnchorHash), y);
    if (row.buildnowAnchorUrl) {
      for (const l of wrapText(row.buildnowAnchorUrl, CONTENT_W - 36, doc)) y = kvRow(doc, "BuildNow URL", l, y);
    }
  }

  // ── Footer ──
  doc.setFont(MONO, NORMAL); doc.setFontSize(7); doc.setTextColor(...GRAY);
  const gen = `Generated ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  doc.text(gen, MARGIN, PAGE_H - 14);
  doc.text(`${orgName} — SiteTrack Pro`, PAGE_W - MARGIN, PAGE_H - 14, { align: "right" });

  doc.save(`dpr-${row.id.slice(0, 8)}.pdf`);
}
