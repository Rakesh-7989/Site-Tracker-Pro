// v5 Phase G5 — generic CSV export helpers (src/lib/genericCsv.ts).
// Pure builders are tested; the DOM download helper is exercised only
// via a light JSDOM-ish check (mock blob/URL/document where available).

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildCsv, buildCsvRows, csvCell, csvDateStamp, CSV_BOM, downloadCsv, type CsvColumn } from "@/lib/genericCsv";

afterEach(() => { vi.restoreAllMocks(); });

describe("csvCell", () => {
  it("reads a key or falls back to empty string", () => {
    expect(csvCell({ a: "x" }, "a")).toBe("x");
    expect(csvCell({ a: "x" }, "missing")).toBe("");
    expect(csvCell(null as unknown as Record<string, unknown>, "a")).toBe("");
  });
});

describe("buildCsv", () => {
  it("emits BOM + header + rows, CRLF separated", () => {
    const cols: CsvColumn<string>[] = [
      { key: "name", label: "Project" },
      { key: "count" },
    ];
    const csv = buildCsv([{ name: "Alpha", count: 3 }, { name: "Beta", count: 1 }], cols);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const body = csv.slice(1);
    expect(body).toBe("Project,count\r\nAlpha,3\r\nBeta,1");
  });

  it("escapes commas, quotes, newlines and defuses formula prefixes", () => {
    const csv = buildCsv([{ a: "hi, there", b: 'say "hi"', c: "=SUM(A1)", d: "line\nbreak" }], [{ key: "a" }, { key: "b" }, { key: "c" }, { key: "d" }]);
    const body = csv.slice(1);
    // header (4 cols) + 1 row
    const lines = body.split("\r\n");
    expect(lines[0]).toBe("a,b,c,d");
    expect(lines[1]).toBe('"hi, there","say ""hi""",\'=SUM(A1),"line\nbreak"');
  });

  it("returns empty string for no rows or no columns", () => {
    expect(buildCsv([], [{ key: "a" }])).toBe("");
    expect(buildCsv([{ a: 1 }], [])).toBe("");
  });
});

describe("buildCsvRows", () => {
  it("handles plain cell arrays with BOM", () => {
    const csv = buildCsvRows([["Metric", "Count"], ["Labour", 3]]);
    expect(csv.slice(1)).toBe("Metric,Count\r\nLabour,3");
  });
  it("returns empty for empty input", () => {
    expect(buildCsvRows([])).toBe("");
  });
});

describe("csvDateStamp", () => {
  it("formats YYYY-MM-DD with zero padding", () => {
    expect(csvDateStamp(new Date(2026, 7, 7))).toBe("2026-08-07");
    expect(csvDateStamp(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("downloadCsv", () => {
  it("triggers an anchor click download and revokes the URL", () => {
    const click = vi.fn();
    const revoke = vi.fn();
    const createObjectURL = vi.fn(() => "blob:fake");
    const appendChild = vi.fn();
    const remove = vi.fn();

    const origBlob = globalThis.Blob;
    globalThis.Blob = class { constructor(parts: BlobPart[], opts?: BlobPropertyBag) { void parts; void opts; } } as unknown as typeof Blob;
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: revoke });
    vi.stubGlobal("document", {
      createElement: () => ({ href: "", download: "", click, remove }),
      body: { appendChild },
    });

    downloadCsv("x.csv", "a,b");

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    globalThis.Blob = origBlob;
    vi.unstubAllGlobals();
  });
});