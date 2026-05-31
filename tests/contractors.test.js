import { describe, it, expect } from "vitest";
import {
  INIT_SUB_CONTRACTORS, INIT_CONTRACTOR_VENDOR_LINKS,
  INIT_CONTRACTOR_PAST_CONTRACTS, CLOSEOUT_STATUSES,
  listSubContractors, addSubContractor, deactivateSubContractor, removeSubContractor,
  vendorsForContractor, contractorsForVendor, linkVendor, unlinkVendor,
  archivePastContract, pastContractsForContractor, contractorReputation,
} from "../src/lib/contractors.js";

describe("contractors — initial seeds + vocab", () => {
  it("CLOSEOUT_STATUSES has the 4 known values", () => {
    expect(CLOSEOUT_STATUSES.sort()).toEqual(["completed", "disputed", "expired", "terminated"]);
  });
  it("INIT_* shapes are empty", () => {
    expect(INIT_SUB_CONTRACTORS).toEqual({});
    expect(INIT_CONTRACTOR_VENDOR_LINKS).toEqual([]);
    expect(INIT_CONTRACTOR_PAST_CONTRACTS).toEqual([]);
  });
});

describe("contractors — sub-contractor CRUD", () => {
  it("listSubContractors returns empty for unknown parent", () => {
    expect(listSubContractors({}, "p1")).toEqual([]);
    expect(listSubContractors({}, "")).toEqual([]);
  });
  it("addSubContractor appends a row immutably", () => {
    const before = {};
    const after = addSubContractor(before, "c1", { name: "ABC Steel Works" });
    expect(after.c1.length).toBe(1);
    expect(after.c1[0].name).toBe("ABC Steel Works");
    expect(after.c1[0].active).toBe(true);
    expect(after.c1[0].id).toMatch(/^sc_/);
    expect(before.c1).toBeUndefined();
  });
  it("addSubContractor ignores rows with no name", () => {
    expect(addSubContractor({}, "c1", {})).toEqual({});
    expect(addSubContractor({}, "c1", { name: "   " })).toEqual({});
  });
  it("addSubContractor ignores when no parentId", () => {
    expect(addSubContractor({}, "", { name: "X" })).toEqual({});
  });
  it("deactivateSubContractor marks inactive but keeps the row", () => {
    let state = addSubContractor({}, "c1", { name: "Sub A" });
    const id = state.c1[0].id;
    state = deactivateSubContractor(state, "c1", id);
    expect(state.c1.length).toBe(1);
    expect(state.c1[0].active).toBe(false);
    expect(state.c1[0].deactivated_at).toBeTruthy();
  });
  it("removeSubContractor hard-deletes by id", () => {
    let state = addSubContractor({}, "c1", { name: "Sub A" });
    state = addSubContractor(state, "c1", { name: "Sub B" });
    const idA = state.c1[0].id;
    state = removeSubContractor(state, "c1", idA);
    expect(state.c1.length).toBe(1);
    expect(state.c1[0].name).toBe("Sub B");
  });
});

describe("contractors — vendor links", () => {
  it("linkVendor creates a fresh link", () => {
    const links = linkVendor([], "c1", "v1", { contractId: "ct_1" });
    expect(links.length).toBe(1);
    expect(links[0].contractor_id).toBe("c1");
    expect(links[0].vendor_id).toBe("v1");
    expect(links[0].contract_id).toBe("ct_1");
    expect(links[0].active).toBe(true);
  });
  it("linkVendor is idempotent — re-linking updates the existing row, not duplicates", () => {
    let links = linkVendor([], "c1", "v1", { contractId: "ct_1" });
    links = linkVendor(links, "c1", "v1", { contractId: "ct_2" });
    expect(links.length).toBe(1);
    expect(links[0].contract_id).toBe("ct_2");
    expect(links[0].updated_at).toBeTruthy();
  });
  it("linkVendor refuses missing IDs", () => {
    expect(linkVendor([], "", "v1")).toEqual([]);
    expect(linkVendor([], "c1", "")).toEqual([]);
  });
  it("unlinkVendor marks inactive without removing", () => {
    let links = linkVendor([], "c1", "v1");
    links = unlinkVendor(links, "c1", "v1");
    expect(links.length).toBe(1);
    expect(links[0].active).toBe(false);
    expect(links[0].unlinked_at).toBeTruthy();
  });
  it("vendorsForContractor filters out inactive + other contractors", () => {
    let links = linkVendor([], "c1", "v1");
    links = linkVendor(links, "c1", "v2");
    links = linkVendor(links, "c2", "v3");
    links = unlinkVendor(links, "c1", "v2");
    const active = vendorsForContractor(links, "c1");
    expect(active.length).toBe(1);
    expect(active[0].vendor_id).toBe("v1");
  });
  it("contractorsForVendor mirrors the inverse lookup", () => {
    let links = linkVendor([], "c1", "v1");
    links = linkVendor(links, "c2", "v1");
    expect(contractorsForVendor(links, "v1").length).toBe(2);
  });
});

describe("contractors — past contract archive", () => {
  const valid = {
    contractor_id: "c1", project_id: "p1", scope: "RCC work",
    value_inr: 5000000, start_date: "2024-01-01", end_date: "2024-12-31",
    closeout_status: "completed",
  };
  it("archivePastContract appends a row", () => {
    const arch = archivePastContract([], valid);
    expect(arch.length).toBe(1);
    expect(arch[0].id).toMatch(/^pc_/);
    expect(arch[0].contractor_id).toBe("c1");
  });
  it("archivePastContract refuses unknown closeout status", () => {
    expect(archivePastContract([], { ...valid, closeout_status: "weird" })).toEqual([]);
  });
  it("archivePastContract refuses missing contractor_id", () => {
    expect(archivePastContract([], { ...valid, contractor_id: undefined })).toEqual([]);
  });
  it("pastContractsForContractor sorts newest-first", () => {
    const arch = [
      { contractor_id: "c1", end_date: "2024-01-01", closeout_status: "completed" },
      { contractor_id: "c1", end_date: "2025-01-01", closeout_status: "completed" },
      { contractor_id: "c1", end_date: "2023-01-01", closeout_status: "disputed" },
    ];
    const sorted = pastContractsForContractor(arch, "c1");
    expect(sorted[0].end_date).toBe("2025-01-01");
    expect(sorted[2].end_date).toBe("2023-01-01");
  });
});

describe("contractors — reputation score", () => {
  it("returns score 50 + zero counts for new contractor", () => {
    const rep = contractorReputation([], "c1");
    expect(rep.total).toBe(0);
    expect(rep.score).toBe(50);
  });
  it("score boosts when all completed", () => {
    let arch = archivePastContract([], { contractor_id: "c1", value_inr: 100000, closeout_status: "completed" });
    arch = archivePastContract(arch, { contractor_id: "c1", value_inr: 200000, closeout_status: "completed" });
    arch = archivePastContract(arch, { contractor_id: "c1", value_inr: 300000, closeout_status: "completed" });
    const rep = contractorReputation(arch, "c1");
    expect(rep.score).toBe(100);
    expect(rep.totalValue).toBe(600000);
    expect(rep.counts.completed).toBe(3);
  });
  it("score plunges with disputes (weighted 2x)", () => {
    let arch = archivePastContract([], { contractor_id: "c1", value_inr: 100, closeout_status: "completed" });
    arch = archivePastContract(arch, { contractor_id: "c1", value_inr: 100, closeout_status: "disputed" });
    arch = archivePastContract(arch, { contractor_id: "c1", value_inr: 100, closeout_status: "disputed" });
    const rep = contractorReputation(arch, "c1");
    expect(rep.score).toBeLessThan(50);
  });
  it("score floor 0 + ceiling 100 (clamped)", () => {
    let arch = [];
    for (let i = 0; i < 5; i++) {
      arch = archivePastContract(arch, { contractor_id: "c1", value_inr: 1, closeout_status: "terminated" });
    }
    expect(contractorReputation(arch, "c1").score).toBe(0);
  });
});
