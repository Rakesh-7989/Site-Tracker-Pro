import { describe, it, expect } from "vitest";
import {
  detectSeparator, splitLine, looksLikeHeader, buildColumnMap,
  parseBoq, applyBoqImport,
} from "../src/lib/boqImport.js";

describe("boqImport — separator detection", () => {
  it("prefers TAB when more tabs than commas", () => {
    expect(detectSeparator("a\tb\tc\nd\te\tf")).toBe("\t");
  });
  it("prefers COMMA when more commas than tabs", () => {
    expect(detectSeparator("a,b,c\nd,e,f")).toBe(",");
  });
  it("defaults to comma on empty input", () => {
    expect(detectSeparator("")).toBe(",");
    expect(detectSeparator(null)).toBe(",");
  });
});

describe("boqImport — splitLine RFC-4180-ish", () => {
  it("splits simple comma values", () => {
    expect(splitLine("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("splits TSV values", () => {
    expect(splitLine("a\tb\tc", "\t")).toEqual(["a", "b", "c"]);
  });
  it("respects quoted fields with commas inside", () => {
    expect(splitLine('"Brick, 4 in",100,500')).toEqual(["Brick, 4 in", "100", "500"]);
  });
  it("handles escaped double-quotes inside a quoted field", () => {
    expect(splitLine('"He said ""ok""",1')).toEqual(['He said "ok"', "1"]);
  });
  it("trims surrounding whitespace per cell", () => {
    expect(splitLine(" code ,  desc ")).toEqual(["code", "desc"]);
  });
  it("returns empty array on empty line", () => {
    expect(splitLine("")).toEqual([]);
  });
});

describe("boqImport — header detection", () => {
  it("detects header when 'description' keyword present", () => {
    expect(looksLikeHeader(["Sl", "Description", "Qty", "Rate"])).toBe(true);
  });
  it("detects header when 'code' + 'qty' present", () => {
    expect(looksLikeHeader(["Code", "Item", "Unit", "Quantity"])).toBe(true);
  });
  it("returns false for a pure data row", () => {
    expect(looksLikeHeader(["1.1", "Excavation", "cum", "100", "240"])).toBe(false);
  });
  it("returns false for empty cells", () => {
    expect(looksLikeHeader([])).toBe(false);
    expect(looksLikeHeader(null)).toBe(false);
  });
});

describe("boqImport — buildColumnMap", () => {
  it("maps all 6 standard columns", () => {
    const m = buildColumnMap(["Code", "Description", "Category", "Unit", "Qty", "Rate"]);
    expect(m).toEqual({ code: 0, description: 1, category: 2, unit: 3, qty: 4, rate: 5 });
  });
  it("handles synonym headers (Particulars instead of Description)", () => {
    const m = buildColumnMap(["S.No", "Particulars", "UOM", "Nos", "Unit Rate"]);
    expect(m.code).toBe(0);
    expect(m.description).toBe(1);
    expect(m.unit).toBe(2);
    expect(m.qty).toBe(3);
    expect(m.rate).toBe(4);
  });
  it("returns empty map on no headers", () => {
    expect(buildColumnMap([])).toEqual({});
  });
});

describe("boqImport — parseBoq end-to-end (TSV from Excel paste)", () => {
  const sample =
    "Code\tDescription\tCategory\tUnit\tQty\tRate\n" +
    "1.1\tEarthwork excavation\tCivil\tcum\t100\t240\n" +
    "1.2\tPCC 1:4:8\tCivil\tcum\t20\t5400\n" +
    "2.1\tRCC M25\tCivil\tcum\t50\t8200";

  it("parses 3 valid rows", () => {
    const out = parseBoq(sample);
    expect(out.rows.length).toBe(3);
    expect(out.errors).toEqual([]);
  });
  it("computes correct amounts + total", () => {
    const out = parseBoq(sample);
    expect(out.rows[0].amount).toBe(24000);   // 100 * 240
    expect(out.rows[1].amount).toBe(108000);  // 20 * 5400
    expect(out.rows[2].amount).toBe(410000);  // 50 * 8200
    expect(out.summary.total).toBe(542000);
  });
  it("detects TAB separator + header presence", () => {
    const out = parseBoq(sample);
    expect(out.summary.detected.separator).toBe("TAB");
    expect(out.summary.detected.hasHeader).toBe(true);
  });
  it("assigns sequential sort order", () => {
    const out = parseBoq(sample);
    expect(out.rows.map(r => r.sort)).toEqual([1, 2, 3]);
  });
});

describe("boqImport — CSV with quoted commas + ₹ symbols", () => {
  const csv =
    'Code,Description,Unit,Qty,Rate\n' +
    '1.1,"Brick, 4 in",nos,1000,"₹8.50"\n' +
    '1.2,Cement OPC 53,bag,200,"₹420"';

  it("handles quoted commas in description", () => {
    const out = parseBoq(csv);
    expect(out.rows[0].description).toBe("Brick, 4 in");
  });
  it("strips ₹ + commas from rate", () => {
    const out = parseBoq(csv);
    expect(out.rows[0].rate).toBe(8.5);
    expect(out.rows[1].rate).toBe(420);
  });
});

describe("boqImport — error collection (won't lose valid rows)", () => {
  const bad =
    "Description,Unit,Qty,Rate\n" +
    "Good row,cum,10,100\n" +
    ",cum,5,200\n" +              // missing description
    "Bad qty,cum,abc,300\n" +     // qty NaN
    "Bad rate,cum,10,xyz\n" +     // rate NaN
    "Another good,cum,2,1000";

  it("collects errors per offending row + keeps valid rows", () => {
    const out = parseBoq(bad);
    expect(out.rows.length).toBe(2);
    expect(out.errors.length).toBe(3);
    expect(out.summary.validRows).toBe(2);
    expect(out.summary.invalidRows).toBe(3);
  });
  it("reports rowNo aligned with original file lines", () => {
    const out = parseBoq(bad);
    expect(out.errors[0].rowNo).toBe(3); // line 3 (header is line 1, good row is 2)
    expect(out.errors[0].message).toMatch(/description/i);
  });
});

describe("boqImport — headerless input + positional fallback", () => {
  const noHeader =
    "1.1\tExcavation\tCivil\tcum\t100\t240\n" +
    "1.2\tPCC\tCivil\tcum\t20\t5400";

  it("uses default positional columns when no header detected", () => {
    const out = parseBoq(noHeader);
    expect(out.summary.detected.hasHeader).toBe(false);
    expect(out.rows.length).toBe(2);
    expect(out.rows[0].code).toBe("1.1");
    expect(out.rows[0].description).toBe("Excavation");
  });
  it("4-column layout falls back to desc/unit/qty/rate", () => {
    const out = parseBoq("Excavation\tcum\t100\t240");
    expect(out.rows[0].description).toBe("Excavation");
    expect(out.rows[0].unit).toBe("cum");
    expect(out.rows[0].qty).toBe(100);
    expect(out.rows[0].rate).toBe(240);
  });
});

describe("boqImport — category + unit normalisation", () => {
  it("matches known category case-insensitively", () => {
    const out = parseBoq("Description,Category,Qty,Rate\nX,civil,1,100");
    expect(out.rows[0].category).toBe("Civil");
  });
  it("unknown category falls back to Other", () => {
    const out = parseBoq("Description,Category,Qty,Rate\nX,plumbing,1,100");
    expect(out.rows[0].category).toBe("Other");
  });
  it("preserves user unit when not in BOQ_UNITS allow-list", () => {
    const out = parseBoq("Description,Unit,Qty,Rate\nX,boxes,1,100");
    expect(out.rows[0].unit).toBe("boxes");
  });
});

describe("boqImport — applyBoqImport (state mutation, immutable)", () => {
  const rows = [
    { code: "1.1", description: "X", category: "Civil", unit: "cum", qty: 10, rate: 100 },
    { code: "1.2", description: "Y", category: "MEP", unit: "rmt", qty: 5, rate: 50 },
  ];
  it("appends to existing rows by default", () => {
    const before = { p1: [{ id: "bq_old", description: "old", qty: 1, rate: 1, sort: 1 }] };
    const after = applyBoqImport(before, "p1", rows);
    expect(after.p1.length).toBe(3);
    expect(after.p1[0].description).toBe("old");
    expect(after.p1[1].description).toBe("X");
    expect(before.p1.length).toBe(1); // untouched
  });
  it("replace mode drops existing rows first", () => {
    const before = { p1: [{ id: "bq_old", description: "old", qty: 1, rate: 1 }] };
    const after = applyBoqImport(before, "p1", rows, { mode: "replace" });
    expect(after.p1.length).toBe(2);
    expect(after.p1.find(r => r.id === "bq_old")).toBeUndefined();
  });
  it("ignores empty input", () => {
    expect(applyBoqImport({}, "p1", [])).toEqual({});
    expect(applyBoqImport({}, "", rows)).toEqual({});
  });
  it("assigns sequential sort order continuing from existing max", () => {
    const before = { p1: [{ id: "bq_old", sort: 7 }] };
    const after = applyBoqImport(before, "p1", rows);
    expect(after.p1[1].sort).toBe(8);
    expect(after.p1[2].sort).toBe(9);
  });
});
