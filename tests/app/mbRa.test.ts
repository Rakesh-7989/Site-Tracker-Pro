// SiteTrack Pro — measurement-book backed RA bills tests (ST-019).

import { describe, it, expect } from "vitest";
import { mbSelectionTotal, listUnlinkedMb, listMbForRa, linkMbToRa, unlinkMb } from "@/app/queries/mbRaQueries";

describe("mbSelectionTotal", () => {
  it("sums amounts, ignoring missing", () => {
    expect(mbSelectionTotal([{ amount: 100 }, { amount: null }, { amount: 25 }] as unknown as Parameters<typeof mbSelectionTotal>[0])).toBe(125);
  });
});

describe("listUnlinkedMb (ST-019)", () => {
  it("maps rows to camelCase", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: async () => ({ data: [{ id: "1", mb_no: "MB-1", page_no: 3, description: "RCC slab", unit: "cum", qty: 10, rate: 4500, amount: 45000, status: "verified" }], error: null }) }) }) }) }) }) };
    const r = await listUnlinkedMb(client, "pr");
    expect(r.ok && r.data[0]).toMatchObject({ id: "1", mbNo: "MB-1", pageNo: 3, description: "RCC slab", qty: 10, amount: 45000 });
  });
});

describe("listMbForRa (ST-019)", () => {
  it("returns linked rows", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [{ id: "1", mb_no: "MB-9", description: "Brick", qty: 2, amount: 200, status: "verified" }], error: null }) }) }) }) };
    const r = await listMbForRa(client, "ra1");
    expect(r.ok && r.data[0]).toMatchObject({ mbNo: "MB-9", status: "verified" });
  });
});

describe("link / unlink", () => {
  it("links a batch of MB rows to an RA bill", async () => {
    const client = { from: () => ({ update: () => ({ in: async () => ({ error: null }) }) }) };
    const r = await linkMbToRa(client, ["a", "b"], "ra1");
    expect(r.ok).toBe(true);
  });
  it("unlinks a MB row", async () => {
    const client = { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) };
    const r = await unlinkMb(client, "a");
    expect(r.ok).toBe(true);
  });
});