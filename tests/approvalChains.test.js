import { describe, it, expect } from "vitest";
import {
  defaultChain, getChain, resolveRung, resolveApprovers,
  upsertChain, removeChain, validateChain,
  APPROVAL_RESOURCES, APPROVAL_ROLES, INIT_APPROVAL_CHAINS,
} from "../src/lib/approvalChains.js";

describe("approvalChains — defaults", () => {
  it("provides a default chain for every supported resource", () => {
    for (const r of APPROVAL_RESOURCES) {
      const ch = defaultChain(r.id);
      expect(ch.resource).toBe(r.id);
      expect(ch.rungs.length).toBeGreaterThanOrEqual(1);
    }
  });
  it("falls back to defaults via getChain when nothing is configured", () => {
    const ch = getChain({}, "org1", "expense");
    expect(ch.resource).toBe("expense");
    expect(ch.id).toBe("default_expense");
  });
  it("prefers configured chain over defaults", () => {
    const custom = { id: "c1", name: "Custom", resource: "expense", rungs: [{ threshold: 1000, role: "pm" }] };
    const chains = { org1: { expense: custom } };
    expect(getChain(chains, "org1", "expense").id).toBe("c1");
  });
});

describe("approvalChains — resolveRung", () => {
  it("returns the lowest matching rung for the amount", () => {
    const ch = defaultChain("expense");
    const rung = resolveRung(ch, 25000);
    expect(rung.role).toBe("pm"); // ₹25k fits in the PM-up-to-₹50k tier
  });
  it("escalates past PM at ₹100k expense", () => {
    const ch = defaultChain("expense");
    const rung = resolveRung(ch, 100000);
    expect(rung.role).toBe("architect");
  });
  it("escalates to orgadmin past ₹500k expense", () => {
    const ch = defaultChain("expense");
    const rung = resolveRung(ch, 5000000);
    expect(rung.role).toBe("orgadmin");
  });
  it("returns null for empty chain", () => {
    expect(resolveRung({ rungs: [] }, 100)).toBeNull();
  });
  it("returns null for null chain", () => {
    expect(resolveRung(null, 100)).toBeNull();
  });
});

describe("approvalChains — resolveApprovers (multi-sig)", () => {
  it("includes every rung up to and including the covering rung", () => {
    const ch = defaultChain("expense");
    const approvers = resolveApprovers(ch, 100000); // needs pm + architect
    expect(approvers.length).toBe(2);
    expect(approvers[0].role).toBe("pm");
    expect(approvers[1].role).toBe("architect");
  });
  it("returns single rung when amount fits the first tier", () => {
    const ch = defaultChain("expense");
    expect(resolveApprovers(ch, 1000).length).toBe(1);
  });
  it("returns empty array for null chain", () => {
    expect(resolveApprovers(null, 100)).toEqual([]);
  });
});

describe("approvalChains — CRUD", () => {
  it("upserts a chain immutably", () => {
    const chains = { ...INIT_APPROVAL_CHAINS };
    const next = upsertChain(chains, "org1", { id: "c1", name: "X", resource: "po", rungs: [{ threshold: 1000, role: "pm" }] });
    expect(next.org1.po.id).toBe("c1");
    expect(chains.org1).toBeUndefined(); // original untouched
  });
  it("removes a chain", () => {
    const chains = { org1: { po: { id: "c1", resource: "po", rungs: [] }, expense: { id: "c2", resource: "expense", rungs: [] } } };
    const next = removeChain(chains, "org1", "po");
    expect(next.org1.po).toBeUndefined();
    expect(next.org1.expense).toBeDefined();
  });
  it("ignores invalid upsert", () => {
    expect(upsertChain({}, "", null)).toEqual({});
  });
});

describe("approvalChains — validation", () => {
  it("rejects chains missing a name", () => {
    const v = validateChain({ resource: "po", rungs: [{ threshold: 1, role: "pm" }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/name/i);
  });
  it("rejects duplicate thresholds", () => {
    const v = validateChain({ name: "X", resource: "po", rungs: [{ threshold: 1, role: "pm" }, { threshold: 1, role: "architect" }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/duplicate/i);
  });
  it("rejects unsupported resource type", () => {
    const v = validateChain({ name: "X", resource: "bogus", rungs: [{ threshold: 1, role: "pm" }] });
    expect(v.ok).toBe(false);
  });
  it("rejects roles outside APPROVAL_ROLES", () => {
    const v = validateChain({ name: "X", resource: "po", rungs: [{ threshold: 1, role: "guest" }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/role/i);
  });
  it("accepts a valid chain", () => {
    const v = validateChain({ name: "X", resource: "po", rungs: [{ threshold: 1000, role: "pm" }] });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });
});

describe("approvalChains — vocab consistency", () => {
  it("APPROVAL_ROLES covers everything the default chains use", () => {
    for (const r of APPROVAL_RESOURCES) {
      const ch = defaultChain(r.id);
      for (const rung of ch.rungs) {
        expect(APPROVAL_ROLES).toContain(rung.role);
      }
    }
  });
});
