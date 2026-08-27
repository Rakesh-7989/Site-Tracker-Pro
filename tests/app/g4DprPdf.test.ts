// v5 Phase G4 — DPR PDF export helpers + WhatsApp share gating. Pure parts
// of src/app/dprPdf.ts (jsPDF rendering is exercised only as a smoke via the
// monthly-statement precedent — heavy DOM canvas libs are mocked out).

import { describe, it, expect } from "vitest";
import {
  dprDateLabel, pdfStatusLabel, statusColor, shortHash, rowPairs,
  dprWhatsAppShareEnabled, waShareLink,
} from "@/app/services/dprPdf";

describe("dprDateLabel", () => {
  it("formats an ISO timestamp into en-IN style", () => {
    const s = dprDateLabel("2026-08-01T10:30:00Z");
    expect(s).not.toBe("2026-08-01T10:30:00Z");
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/Aug/);
  });
  it("returns the raw string for empty/invalid input", () => {
    expect(dprDateLabel("")).toBe("—");
    expect(dprDateLabel("garbage")).toBe("garbage");
  });
});

describe("pdfStatusLabel + statusColor", () => {
  it("labels every known status", () => {
    expect(pdfStatusLabel("queued")).toBe("Queued");
    expect(pdfStatusLabel("sending")).toBe("Sending");
    expect(pdfStatusLabel("sent")).toBe("Sent");
    expect(pdfStatusLabel("delivered")).toBe("Delivered");
    expect(pdfStatusLabel("read")).toBe("Read");
    expect(pdfStatusLabel("failed")).toBe("Failed");
    expect(pdfStatusLabel("bogus")).toBe("bogus");
  });
  it("colors terminal green, failed red, in-flight amber, other gray", () => {
    expect(statusColor("sent")).toEqual([22, 163, 74]);
    expect(statusColor("failed")).toEqual([220, 38, 38]);
    expect(statusColor("queued")).toEqual([180, 83, 9]);
    expect(statusColor("weird")).toEqual([107, 114, 128]);
  });
});

describe("shortHash", () => {
  it("strips non-hex and truncates to 10 chars + ellipsis", () => {
    expect(shortHash("abc123def4567890")).toBe("abc123def4…");
    expect(shortHash(null)).toBe("");
    expect(shortHash("")).toBe("");
    expect(shortHash("!!zz!!")).toBe("");
  });
});

describe("rowPairs", () => {
  it("keeps only present non-empty rows", () => {
    const pairs = rowPairs({ a: "x", b: "", c: " " });
    expect(pairs).toEqual([["a", "x"]]);
  });
});

describe("dprWhatsAppShareEnabled", () => {
  it("honors explicit 1 / 0 overrides", () => {
    expect(dprWhatsAppShareEnabled({ VITE_DPR_PDF_WHATSAPP: "1" })).toBe(true);
    expect(dprWhatsAppShareEnabled({ VITE_DPR_PDF_WHATSAPP: "0", DEV: true })).toBe(false);
  });
  it("defaults on in dev, off in prod", () => {
    expect(dprWhatsAppShareEnabled({ DEV: true })).toBe(true);
    expect(dprWhatsAppShareEnabled({ DEV: false })).toBe(false);
    expect(dprWhatsAppShareEnabled({})).toBe(false);
  });
});

describe("waShareLink", () => {
  it("builds a wa.me deep link with the digits only + encoded text", () => {
    expect(waShareLink("+91 98765 43210", "hi there & ok")).toBe("https://wa.me/919876543210?text=hi%20there%20%26%20ok");
  });
});
