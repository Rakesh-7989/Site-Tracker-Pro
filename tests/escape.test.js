import { describe, it, expect } from "vitest";
import { escapeHtml, h, escapeCsv, csvRow } from "../src/lib/escape.js";

describe("escapeHtml / h", () => {
  it("escapes the 5 HTML-significant characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("escapes a script tag injection attempt", () => {
    const evil = `<script>alert('xss')</script>`;
    const safe = escapeHtml(evil);
    expect(safe).not.toContain("<script>");
    expect(safe).toContain("&lt;script&gt;");
  });

  it("escapes an attribute-breakout attempt", () => {
    const evil = `" onerror="alert(1)`;
    const safe = escapeHtml(evil);
    expect(safe).not.toContain('"');
    expect(safe).toContain("&quot;");
  });

  it("returns empty string for null / undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("coerces non-strings to safely-escaped strings", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(true)).toBe("true");
  });

  it("h is the same function as escapeHtml (alias)", () => {
    expect(h).toBe(escapeHtml);
  });

  it("escapes a realistic project name attack vector", () => {
    const proj = { name: "Project <img src=x onerror=alert(1)>" };
    const out = `<title>${h(proj.name)}</title>`;
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});

describe("escapeCsv", () => {
  it("returns plain text when no special characters", () => {
    expect(escapeCsv("Foundation")).toBe("Foundation");
    expect(escapeCsv(42)).toBe("42");
  });

  it("wraps in quotes and doubles internal quotes", () => {
    expect(escapeCsv(`He said "yes"`)).toBe(`"He said ""yes"""`);
  });

  it("wraps when there is a comma", () => {
    expect(escapeCsv("Concrete, Steel")).toBe(`"Concrete, Steel"`);
  });

  it("wraps when there is a newline", () => {
    expect(escapeCsv("Line1\nLine2")).toBe(`"Line1\nLine2"`);
  });

  it("defuses formula injection on = + - @ tab CR", () => {
    expect(escapeCsv("=1+1")).toBe("'=1+1");
    expect(escapeCsv("+evil")).toBe("'+evil");
    expect(escapeCsv("-attack")).toBe("'-attack");
    expect(escapeCsv("@cmd")).toBe("'@cmd");
    expect(escapeCsv("\tstart")).toBe("'\tstart");
  });

  it("returns empty string for null / undefined", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });
});

describe("csvRow", () => {
  it("joins cells with commas and escapes each", () => {
    const row = csvRow(["2025-05-01", "Materials", `Steel, 5 tons`, 850000]);
    expect(row).toBe(`2025-05-01,Materials,"Steel, 5 tons",850000`);
  });

  it("handles empty array", () => {
    expect(csvRow([])).toBe("");
  });

  it("handles formula-injection inside a row", () => {
    const row = csvRow(["safe", "=SUM(A1:A10)", "ok"]);
    expect(row).toBe(`safe,'=SUM(A1:A10),ok`);
  });
});
