import { describe, it, expect } from "vitest";
import {
  MH_QUARTERLY_PERIODS, MH_STAGE_KEYS, validateMaharera,
  inferMhQuarter, buildMhFilingPayload, mockMhAdapter, mhReraAdapter,
} from "../src/lib/reraMaharashtra.js";

describe("reraMaharashtra — constants", () => {
  it("exposes 4 quarterly periods", () => {
    expect(MH_QUARTERLY_PERIODS.length).toBe(4);
  });

  it("exposes 7 mandatory sections", () => {
    expect(MH_STAGE_KEYS.length).toBe(7);
  });
});

describe("reraMaharashtra — validateMaharera", () => {
  it("accepts canonical Pddddddddddd format", () => {
    expect(validateMaharera("P12345678901").ok).toBe(true);
  });

  it("rejects short id", () => {
    expect(validateMaharera("P12345").ok).toBe(false);
  });

  it("rejects empty", () => {
    expect(validateMaharera("").ok).toBe(false);
    expect(validateMaharera(null).ok).toBe(false);
  });
});

describe("reraMaharashtra — inferMhQuarter", () => {
  it("maps April → Q1", () => {
    expect(inferMhQuarter(new Date("2026-04-15"))).toBe("Q1-Apr-Jun");
  });

  it("maps January → Q4", () => {
    expect(inferMhQuarter(new Date("2026-01-20"))).toBe("Q4-Jan-Mar");
  });

  it("accepts ISO string", () => {
    expect(inferMhQuarter("2026-07-04")).toBe("Q2-Jul-Sep");
  });
});

describe("reraMaharashtra — buildMhFilingPayload", () => {
  const project = { rera_no: "P12345678901", name: "Coastal Towers" };

  it("populates all 7 sections", () => {
    const p = buildMhFilingPayload(project, "Q1-Apr-Jun", { land_status: "owned" });
    expect(p.state).toBe("MH");
    expect(p.period).toBe("Q1-Apr-Jun");
    expect(p.sections.land_status).toBe("owned");
    expect(Object.keys(p.sections).length).toBe(7);
  });

  it("throws on bad period", () => {
    expect(() => buildMhFilingPayload(project, "Q99")).toThrow();
  });

  it("throws on missing project", () => {
    expect(() => buildMhFilingPayload(null, "Q1-Apr-Jun")).toThrow();
  });
});

describe("reraMaharashtra — mockMhAdapter", () => {
  it("returns ack on submit", async () => {
    const r = await mockMhAdapter.submit({ rera_no: "P12345678901", period: "Q1-Apr-Jun" });
    expect(r.ok).toBe(true);
    expect(r.ack_no.startsWith("MH-")).toBe(true);
  });

  it("rejects missing period", async () => {
    const r = await mockMhAdapter.submit({ rera_no: "P12345678901" });
    expect(r.ok).toBe(false);
  });
});

describe("reraMaharashtra — mhReraAdapter", () => {
  it("returns endpoint-missing without config", async () => {
    const r = await mhReraAdapter.submit({});
    expect(r.ok).toBe(false);
  });
});
