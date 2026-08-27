import { describe, it, expect } from "vitest";
import { fmtDate, fmtTime, fmtCur, fileKind, fmtSize } from "../src/lib/utils/format";

describe("fmtDate", () => {
  it("returns em-dash for empty input", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate("")).toBe("—");
  });

  it("formats a valid ISO date", () => {
    const result = fmtDate("2025-04-20");
    // Locale-dependent but always includes the year
    expect(result).toMatch(/2025/);
  });

  it("returns em-dash on invalid input", () => {
    expect(fmtDate("not a date")).toBe("—");
  });
});

describe("fmtTime", () => {
  it("returns empty string for falsy input", () => {
    expect(fmtTime(null)).toBe("");
    expect(fmtTime(undefined)).toBe("");
    expect(fmtTime("")).toBe("");
  });

  it("formats an ISO timestamp", () => {
    const result = fmtTime("2025-04-20T10:30:00Z");
    expect(result).toMatch(/\d/); // has at least one digit
  });
});

describe("fmtCur", () => {
  it("returns em-dash for empty/null/undefined", () => {
    expect(fmtCur(null)).toBe("—");
    expect(fmtCur(undefined)).toBe("—");
    expect(fmtCur("")).toBe("—");
  });

  it("formats positive integers with ? + en-IN grouping", () => {
    const result = fmtCur(123456);
    expect(result.startsWith("?")).toBe(true);
    expect(result).toContain("1,23,456");
  });

  it("formats zero correctly", () => {
    expect(fmtCur(0)).toBe("?0");
  });

  it("returns em-dash for non-finite values", () => {
    expect(fmtCur(NaN)).toBe("—");
    expect(fmtCur(Infinity)).toBe("—");
    expect(fmtCur("not a number")).toBe("—");
  });
});

describe("fileKind", () => {
  it("recognizes image extensions", () => {
    ["png", "jpg", "jpeg", "webp", "gif", "svg"].forEach(ext => {
      expect(fileKind(`photo.${ext}`)).toBe("image");
    });
  });

  it("recognizes PDF", () => {
    expect(fileKind("invoice.pdf")).toBe("pdf");
  });

  it("recognizes CAD formats", () => {
    ["dwg", "dxf", "rvt", "ifc"].forEach(ext => {
      expect(fileKind(`floor.${ext}`)).toBe("cad");
    });
  });

  it("falls back to 'file' for unknown ext", () => {
    expect(fileKind("data.xyz")).toBe("file");
    expect(fileKind("no-extension")).toBe("file");
  });

  it("returns 'file' for empty / null input", () => {
    expect(fileKind(null)).toBe("file");
    expect(fileKind("")).toBe("file");
  });
});

describe("fmtSize", () => {
  it("returns '0 KB' for zero/null", () => {
    expect(fmtSize(0)).toBe("0 KB");
    expect(fmtSize(null)).toBe("0 KB");
    expect(fmtSize(undefined)).toBe("0 KB");
  });

  it("formats kilobytes with the KB suffix", () => {
    expect(fmtSize(1024)).toBe("1 KB");
    expect(fmtSize(50 * 1024)).toBe("50 KB");
  });

  it("formats megabytes with one decimal place", () => {
    expect(fmtSize(2 * 1024 * 1024)).toBe("2.0 MB");
    expect(fmtSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});
