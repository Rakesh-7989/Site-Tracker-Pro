// SiteTrack Pro — monthly statement PDF export pure-helper tests.
// Tests the formatting helpers (all side-effect-free). The jsPDF save() call
// is not exercised (browser-only); the document-build is covered loosely by a
// happy-path smoke that constructs without throwing.

import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import { pdfRupees, pdfType, pdfMonthLabel } from "@/app/monthlyStatementPdf";

describe("pdfRupees", () => {
  it("formats whole rupees in en-IN grouping with a ₹ symbol", () => {
    expect(pdfRupees(0)).toBe("₹0");
    expect(pdfRupees(1234.7)).toBe("₹1,235");
    expect(pdfRupees(123456789)).toBe("₹12,34,56,789");
  });

  it("handles negatives and non-finite", () => {
    expect(pdfRupees(-500)).toBe("-₹500");
    expect(pdfRupees(NaN)).toBe("₹0");
    expect(pdfRupees(Infinity)).toBe("₹0");
  });
});

describe("pdfType", () => {
  it("capitalizes and replaces underscores", () => {
    expect(pdfType("consultant")).toBe("Consultant");
    expect(pdfType("interior")).toBe("Interior");
    expect(pdfType("project_admin")).toBe("Project admin");
  });

  it("falls back on null / empty", () => {
    expect(pdfType(null)).toBe("—");
    expect(pdfType("")).toBe("—");
  });
});

describe("pdfMonthLabel", () => {
  it("formats YYYY-MM to a full month-year label", () => {
    expect(pdfMonthLabel("2026-08")).toBe("August 2026");
    expect(pdfMonthLabel("2026-01")).toBe("January 2026");
  });

  it("passes through malformed input", () => {
    expect(pdfMonthLabel("nope")).toBe("nope");
    expect(pdfMonthLabel("")).toBe("");
  });
});

describe("monthly statement PDF document build (smoke)", () => {
  it("constructs an A4 jsPDF document without throwing", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    expect(doc).toBeDefined();
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297);
    doc.text("MONTHLY STATEMENT", 14, 22);
    expect(doc.getNumberOfPages()).toBe(1);
  });
});