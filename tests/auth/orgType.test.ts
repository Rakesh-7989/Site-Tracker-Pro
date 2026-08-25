// Unit tests for organization firm-type resolution (migration 240).

import { describe, expect, it } from "vitest";
import {
  isDesignFirm,
  isExecutionFirm,
  isOrgType,
  ORG_TYPES,
  resolveOrgType,
} from "@/auth/orgType";

describe("resolveOrgType", () => {
  it("exposes the eight firm types from the research taxonomy", () => {
    expect(ORG_TYPES).toEqual([
      "developer",
      "builder",
      "architecture_firm",
      "interior_firm",
      "contractor",
      "consultant",
      "pmc",
      "vendor",
    ]);
  });

  it("prefers the explicit org_type when valid", () => {
    expect(resolveOrgType({ orgType: "builder", segments: ["architecture"] })).toBe("builder");
    expect(resolveOrgType({ orgType: "pmc", segments: ["consultancy"] })).toBe("pmc");
  });

  it("ignores invalid org_type values", () => {
    expect(resolveOrgType({ orgType: "influencer", segments: ["interior"] })).toBe("interior_firm");
    expect(resolveOrgType({ orgType: 42, segments: [] })).toBeNull();
  });

  it("derives unambiguous single-segment fallbacks (migration backfill rules)", () => {
    expect(resolveOrgType({ segments: ["architecture"] })).toBe("architecture_firm");
    expect(resolveOrgType({ segments: ["interior"] })).toBe("interior_firm");
    expect(resolveOrgType({ segments: ["consultancy"] })).toBe("consultant");
  });

  it("refuses to guess for construction/multi/empty orgs", () => {
    // developer vs builder vs contractor needs an answer, not a guess.
    expect(resolveOrgType({ segments: ["construction"] })).toBeNull();
    expect(resolveOrgType({ segments: ["construction", "architecture"] })).toBeNull();
    expect(resolveOrgType({ segments: ["multiple"] })).toBeNull();
    expect(resolveOrgType({ segments: [] })).toBeNull();
    expect(resolveOrgType(null)).toBeNull();
    expect(resolveOrgType(undefined)).toBeNull();
  });
});

describe("isOrgType + firm-family helpers", () => {
  it("validates against the canonical list", () => {
    expect(isOrgType("vendor")).toBe(true);
    expect(isOrgType("Developer")).toBe(false); // case-sensitive ids
    expect(isOrgType(null)).toBe(false);
  });

  it("groups design vs execution firms", () => {
    expect(isDesignFirm("architecture_firm")).toBe(true);
    expect(isDesignFirm("interior_firm")).toBe(true);
    expect(isDesignFirm("developer")).toBe(false);
    expect(isExecutionFirm("developer")).toBe(true);
    expect(isExecutionFirm("builder")).toBe(true);
    expect(isExecutionFirm("contractor")).toBe(true);
    expect(isExecutionFirm("architecture_firm")).toBe(false);
    expect(isExecutionFirm(null)).toBe(false);
  });
});
