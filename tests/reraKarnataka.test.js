import { describe, it, expect } from "vitest";
import {
  KA_STAGE_CODES, inferKaReraStage, validateKaRera,
  buildKaFilingPayload, mockKaAdapter, kaReraAdapter,
} from "../src/lib/reraKarnataka";

describe("reraKarnataka — stage codes", () => {
  it("exposes 9 KA stages", () => {
    expect(Object.keys(KA_STAGE_CODES).length).toBe(9);
  });

  it("infers commencement from 'start'", () => {
    expect(inferKaReraStage("start")).toBe("commencement");
  });

  it("infers occupancy from 'OC'", () => {
    expect(inferKaReraStage("OC")).toBe("occupancy");
  });

  it("returns null for unknown", () => {
    expect(inferKaReraStage("zzz")).toBe(null);
    expect(inferKaReraStage(null)).toBe(null);
  });
});

describe("reraKarnataka — validateKaRera", () => {
  it("accepts canonical format", () => {
    const r = validateKaRera("PRM/KA/RERA/1234/5678/000001");
    expect(r.ok).toBe(true);
    expect(r.canonical).toBe("PRM/KA/RERA/1234/5678/000001");
  });

  it("rejects bad format", () => {
    expect(validateKaRera("RANDOMSTRING").ok).toBe(false);
  });

  it("rejects empty", () => {
    expect(validateKaRera("").ok).toBe(false);
    expect(validateKaRera(null).ok).toBe(false);
  });
});

describe("reraKarnataka — buildKaFilingPayload", () => {
  const project = { rera_no: "PRM/KA/RERA/1234/5678/000001", name: "Maple Heights" };

  it("builds canonical payload", () => {
    const p = buildKaFilingPayload(project, "foundation", { progress_pct: 12.5 });
    expect(p.state).toBe("KA");
    expect(p.stage_code).toBe("F1");
    expect(p.progress_pct).toBe(12.5);
  });

  it("throws on unknown stage", () => {
    expect(() => buildKaFilingPayload(project, "zzz")).toThrow();
  });
});

describe("reraKarnataka — mockKaAdapter", () => {
  it("returns ack_no on submit", async () => {
    const r = await mockKaAdapter.submit({ rera_no: "PRM/KA/RERA/1234/5678/000001" });
    expect(r.ok).toBe(true);
    expect(r.ack_no.startsWith("KA-")).toBe(true);
  });

  it("rejects missing rera_no", async () => {
    const r = await mockKaAdapter.submit({});
    expect(r.ok).toBe(false);
  });

  it("checkStatus returns accepted", async () => {
    expect((await mockKaAdapter.checkStatus("KA-1")).status).toBe("accepted");
  });
});

describe("reraKarnataka — kaReraAdapter", () => {
  it("returns endpoint-missing without config", async () => {
    const r = await kaReraAdapter.submit({});
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("endpoint-missing");
  });
});
