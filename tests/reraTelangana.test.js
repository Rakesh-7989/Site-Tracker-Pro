import { describe, it, expect } from "vitest";
import {
  SUPPORTED_STATES, STAGE_CODES,
  inferReraStage, buildFilingPayload, validateFilingPayload,
  mockAdapter, tgReraAdapter, pickAdapter,
} from "../src/lib/reraTelangana";

describe("reraTelangana — vocab", () => {
  it("SUPPORTED_STATES has TG + KA + MH", () => {
    expect(SUPPORTED_STATES).toContain("telangana");
    expect(SUPPORTED_STATES).toContain("karnataka");
    expect(SUPPORTED_STATES).toContain("maharashtra");
  });
  it("STAGE_CODES has 10 stages", () => {
    expect(Object.keys(STAGE_CODES).length).toBe(10);
    expect(STAGE_CODES.FOU).toBe("Foundation");
    expect(STAGE_CODES.HND).toBe("Handover");
  });
});

describe("reraTelangana — inferReraStage", () => {
  it("maps very low progress to excavation", () => {
    expect(inferReraStage(0)).toBe("EXC");
    expect(inferReraStage(3)).toBe("EXC");
  });
  it("maps mid progress to superstructure or brickwork", () => {
    expect(inferReraStage(30)).toBe("SUP");
    expect(inferReraStage(50)).toBe("BWK");
  });
  it("maps near-complete to handover or finishing", () => {
    expect(inferReraStage(99)).toBe("HND");
    expect(inferReraStage(90)).toBe("FIN");
  });
  it("monotonic increase — higher pct never returns earlier stage", () => {
    const order = ["EXC", "FOU", "PLI", "GFL", "SUP", "BWK", "PLA", "FLO", "FIN", "HND"];
    let lastIdx = -1;
    for (let p = 0; p <= 100; p += 5) {
      const idx = order.indexOf(inferReraStage(p));
      expect(idx).toBeGreaterThanOrEqual(lastIdx);
      lastIdx = idx;
    }
  });
});

describe("reraTelangana — buildFilingPayload", () => {
  const project = { id: "p1", rera_number: "TS/RERA/PROJECT/12345", budget: 50000000, progress: 45 };
  it("returns a fully-shaped filing payload", () => {
    const p = buildFilingPayload(project, { month: "2026-05", spent: 22000000, workersOnSite: 67 });
    expect(p.project_id).toBe("p1");
    expect(p.rera_number).toBe("TS/RERA/PROJECT/12345");
    expect(p.month).toBe("2026-05");
    expect(p.physical_progress_pct).toBe(45);
    expect(p.primary_stage).toBe("BWK"); // 45 → brickwork
    expect(p.financial.spent_inr).toBe(22000000);
    expect(p.workforce).toBe(67);
  });
  it("defaults month to current YYYY-MM", () => {
    const p = buildFilingPayload(project);
    expect(p.month).toMatch(/^\d{4}-\d{2}$/);
  });
  it("uses progressOverride when supplied", () => {
    const p = buildFilingPayload(project, { progressOverride: 80 });
    expect(p.physical_progress_pct).toBe(80);
    expect(p.primary_stage).toBe("FLO");
  });
  it("throws on missing project id", () => {
    expect(() => buildFilingPayload({})).toThrow();
  });
});

describe("reraTelangana — validateFilingPayload", () => {
  const valid = {
    project_id: "p1",
    rera_number: "TS/RERA/PROJECT/12345",
    month: "2026-05",
    physical_progress_pct: 45,
    primary_stage: "BWK",
    financial: { budgeted_inr: 1000000, spent_inr: 400000 },
  };
  it("accepts a clean payload", () => {
    const v = validateFilingPayload(valid);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });
  it("rejects missing project_id", () => {
    const v = validateFilingPayload({ ...valid, project_id: undefined });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/project_id/);
  });
  it("rejects invalid rera_number format", () => {
    const v = validateFilingPayload({ ...valid, rera_number: "garbage" });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/rera_number/);
  });
  it("rejects bad month format", () => {
    expect(validateFilingPayload({ ...valid, month: "May 2026" }).ok).toBe(false);
    expect(validateFilingPayload({ ...valid, month: "2026-13" }).ok).toBe(false);
    expect(validateFilingPayload({ ...valid, month: "2026-00" }).ok).toBe(false);
  });
  it("rejects out-of-range progress", () => {
    expect(validateFilingPayload({ ...valid, physical_progress_pct: -1 }).ok).toBe(false);
    expect(validateFilingPayload({ ...valid, physical_progress_pct: 101 }).ok).toBe(false);
  });
  it("rejects unknown stage code", () => {
    expect(validateFilingPayload({ ...valid, primary_stage: "ZZZ" }).ok).toBe(false);
  });
  it("rejects spent > budgeted (sanity check)", () => {
    const v = validateFilingPayload({ ...valid, financial: { budgeted_inr: 100, spent_inr: 200 } });
    expect(v.ok).toBe(false);
  });
});

describe("reraTelangana — mockAdapter", () => {
  it("checkStatus returns active for valid format", async () => {
    const a = mockAdapter();
    const r = await a.checkStatus("TS/RERA/PROJECT/12345");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("active");
  });
  it("checkStatus rejects bad format", async () => {
    const r = await mockAdapter().checkStatus("garbage");
    expect(r.ok).toBe(false);
  });
  it("submitFiling records the submission", async () => {
    const a = mockAdapter();
    const r = await a.submitFiling({
      project_id: "p1", rera_number: "TS/RERA/PROJECT/12345",
      month: "2026-05", physical_progress_pct: 45, primary_stage: "BWK",
      financial: { budgeted_inr: 100, spent_inr: 50 },
    });
    expect(r.ok).toBe(true);
    expect(r.ack).toMatch(/^MOCK-/);
    expect(a._submissions.length).toBe(1);
  });
  it("submitFiling refuses invalid payload", async () => {
    const r = await mockAdapter().submitFiling({ project_id: "p1" }); // missing fields
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("reraTelangana — tgReraAdapter", () => {
  it("rejects construction without edge_function_url", () => {
    expect(() => tgReraAdapter({})).toThrow(/edge_function_url/);
  });
  it("submitFiling refuses when portal creds missing", async () => {
    const a = tgReraAdapter({ edge_function_url: "https://x.test" });
    const r = await a.submitFiling({
      project_id: "p1", rera_number: "TS/RERA/PROJECT/12345",
      month: "2026-05", physical_progress_pct: 45, primary_stage: "BWK",
      financial: { budgeted_inr: 100, spent_inr: 50 },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/credentials/i);
  });
});

describe("reraTelangana — pickAdapter", () => {
  it("returns tgReraAdapter when TG + edge function URL set", () => {
    const a = pickAdapter("telangana", { edge_function_url: "https://x.test" });
    expect(a.state).toBe("telangana");
  });
  it("falls back to mock when TG config missing url", () => {
    const a = pickAdapter("telangana", {});
    expect(a.state).toBe("mock");
  });
  it("falls back to mock for unsupported states", () => {
    const a = pickAdapter("kerala", {});
    expect(a.state).toBe("mock");
  });
});
