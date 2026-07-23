// SiteTrack Pro — Sprint 4 (Session 30.10) handover packet tests.

import { describe, it, expect } from "vitest";

import {
  HANDOVER_SECTIONS,
  EMPTY_MERKLE_ROOT,
  hashHandoverItem,
  buildHandoverManifest,
  verifyUrl,
  summarizeHandover,
  serializeManifest,
} from "../src/lib/handoverPacket";

const baseInput = {
  project: {
    id: "p-1",
    name: "Vasavi Vista Phase 2",
    slug: "vasavi-vista-2",
    started_at: "2024-01-15",
    completed_at: "2026-05-30",
    address: "Banjara Hills, Hyderabad",
  },
  org: { id: "o-1", name: "Vasavi Group" },
  drawings: [
    { id: "d1", title: "GA-01", drawing_no: "GA-01", revision: "C", released_at: "2024-06-01", sha256: "abc123" },
    { id: "d2", title: "STR-01", drawing_no: "STR-01", revision: "B", released_at: "2024-07-15", sha256: "def456" },
  ],
  photos: [
    { id: "ph1", sha256: "11" + "1".repeat(62), taken_at: "2026-04-10T07:00:00Z", lat: 17.412, lon: 78.43, site_label: "Tower B" },
  ],
  payments: [
    { id: "py1", amount_inr: 5_00_00_000, paid_at: "2025-12-01", method: "RTGS", ra_bill_id: "ra1" },
    { id: "py2", amount_inr: 3_00_00_000, paid_at: "2026-02-15", method: "UPI", ra_bill_id: "ra2" },
  ],
  ra_bills: [
    { id: "ra1", bill_no: "RA-01", amount_inr: 5_00_00_000, approved_at: "2025-11-20", retention_inr: 50_00_000 },
  ],
  compliance: [
    { id: "c1", kind: "RERA-TG", ack_no: "TG-12345", state: "TG", filed_at: "2025-03-31" },
  ],
  generated_at_unix: 1717228800,
};

describe("HANDOVER_SECTIONS", () => {
  it("exposes the 5 canonical sections", () => {
    expect(HANDOVER_SECTIONS).toEqual(["drawings", "photos", "payments", "ra_bills", "compliance"]);
  });
});

describe("hashHandoverItem()", () => {
  it("returns deterministic hex sha256", async () => {
    const a = await hashHandoverItem("drawings", baseInput.drawings[0]);
    const b = await hashHandoverItem("drawings", baseInput.drawings[0]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores fields not in the canonical KEEP list", async () => {
    const withJunk = { ...baseInput.drawings[0], _internal: "drop me", updated_at: 12345 };
    const a = await hashHandoverItem("drawings", baseInput.drawings[0]);
    const b = await hashHandoverItem("drawings", withJunk);
    expect(a).toBe(b);
  });

  it("differs when canonical fields change", async () => {
    const a = await hashHandoverItem("drawings", baseInput.drawings[0]);
    const b = await hashHandoverItem("drawings", { ...baseInput.drawings[0], revision: "Z" });
    expect(a).not.toBe(b);
  });

  it("returns empty hash for unknown section", async () => {
    const h = await hashHandoverItem("unknown_section", { id: "x" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildHandoverManifest()", () => {
  it("returns a structured manifest with sections, totals, merkle root", async () => {
    const m = await buildHandoverManifest(baseInput);
    expect(m.schema_version).toBe("1.0");
    expect(m.project_id).toBe("p-1");
    expect(m.project_name).toBe("Vasavi Vista Phase 2");
    expect(m.org_name).toBe("Vasavi Group");
    expect(m.address).toBe("Banjara Hills, Hyderabad");
    expect(m.sections.drawings).toHaveLength(2);
    expect(m.sections.photos).toHaveLength(1);
    expect(m.sections.payments).toHaveLength(2);
    expect(m.sections.ra_bills).toHaveLength(1);
    expect(m.sections.compliance).toHaveLength(1);
    expect(m.merkle_root).toMatch(/^[0-9a-fx]+$/);
    expect(m.generated_at_unix).toBe(1717228800);
  });

  it("computes totals correctly", async () => {
    const m = await buildHandoverManifest(baseInput);
    expect(m.totals.drawings).toBe(2);
    expect(m.totals.photos).toBe(1);
    expect(m.totals.payments_inr).toBe(8_00_00_000);   // 5cr + 3cr in paise
    expect(m.totals.ra_bills_inr).toBe(5_00_00_000);
  });

  it("returns the EMPTY_MERKLE_ROOT when no items provided", async () => {
    const m = await buildHandoverManifest({
      project: baseInput.project,
      org: baseInput.org,
      generated_at_unix: 1717228800,
    });
    expect(m.merkle_root).toBe(EMPTY_MERKLE_ROOT);
    expect(m.totals.drawings).toBe(0);
    expect(m.totals.photos).toBe(0);
  });

  it("is deterministic across runs", async () => {
    const a = await buildHandoverManifest(baseInput);
    const b = await buildHandoverManifest(baseInput);
    expect(a.merkle_root).toBe(b.merkle_root);
    expect(serializeManifest(a)).toBe(serializeManifest(b));
  });

  it("throws when project or org missing", async () => {
    await expect(buildHandoverManifest({})).rejects.toThrow();
    await expect(buildHandoverManifest({ project: baseInput.project })).rejects.toThrow();
  });

  it("handles partial input (some sections empty)", async () => {
    const partial = {
      project: baseInput.project,
      org: baseInput.org,
      drawings: baseInput.drawings,
      generated_at_unix: 1717228800,
    };
    const m = await buildHandoverManifest(partial);
    expect(m.sections.drawings).toHaveLength(2);
    expect(m.sections.photos).toHaveLength(0);
    expect(m.sections.payments).toHaveLength(0);
    expect(m.totals.payments_inr).toBe(0);
  });

  it("generates a different merkle root when items differ", async () => {
    const a = await buildHandoverManifest(baseInput);
    const modified = {
      ...baseInput,
      drawings: [...baseInput.drawings, { id: "d3", title: "MEP-01", drawing_no: "MEP-01", revision: "A", released_at: "2024-08-01", sha256: "ghi789" }],
    };
    const b = await buildHandoverManifest(modified);
    expect(a.merkle_root).not.toBe(b.merkle_root);
  });
});

describe("verifyUrl()", () => {
  it("builds the canonical verify URL with root param", () => {
    const url = verifyUrl("0xabc123");
    expect(url).toMatch(/^https:\/\/sitetrack\.in\/handover\/verify\?root=0xabc123/);
  });

  it("includes optional chain + tx params", () => {
    const url = verifyUrl("0xabc", { chain: "polygon", txHash: "0xdef" });
    expect(url).toContain("chain=polygon");
    expect(url).toContain("tx=0xdef");
  });
});

describe("summarizeHandover()", () => {
  it("renders a human-readable summary", async () => {
    const m = await buildHandoverManifest(baseInput);
    const s = summarizeHandover(m);
    expect(s).toContain("Vasavi Vista Phase 2");
    expect(s).toContain("Vasavi Group");
    expect(s).toContain("Banjara Hills");
    expect(s).toContain("Drawings released: 2");
    expect(s).toContain("Site photos: 1");
    expect(s).toContain("Payments total: ₹8,00,000");
    expect(s).toContain("Merkle root:");
    expect(s).toContain("https://sitetrack.in/handover/verify?root=");
  });
});

describe("serializeManifest()", () => {
  it("returns canonical JSON with sorted keys", async () => {
    const m = await buildHandoverManifest(baseInput);
    const s = serializeManifest(m);
    expect(typeof s).toBe("string");
    expect(() => JSON.parse(s)).not.toThrow();
    const parsed = JSON.parse(s);
    // Top-level keys should be in sorted order
    const keys = Object.keys(parsed);
    expect([...keys].sort()).toEqual(keys);
  });

  it("is identical for two calls with the same input", async () => {
    const a = await buildHandoverManifest(baseInput);
    const b = await buildHandoverManifest(baseInput);
    expect(serializeManifest(a)).toBe(serializeManifest(b));
  });
});
