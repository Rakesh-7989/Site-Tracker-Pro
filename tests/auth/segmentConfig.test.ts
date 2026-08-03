// SiteTrack Pro — company segment config tests (v4 Phase C0).
//
// Verifies the segment → project-type mapping used by onboarding, project
// creation, and (later) nav/tab gating. The mapping MUST stay consistent
// with organizations.segment (migration 134) and projects.type (roles.ts).

import { describe, it, expect } from "vitest";
import {
  SEGMENTS,
  SEGMENT_CONFIG,
  isCompanySegment,
  defaultProjectTypeFor,
  segmentProjectTypes,
} from "@/auth/segmentConfig";
import { PROJECT_TYPES } from "@/auth/roles";

describe("SEGMENT_CONFIG", () => {
  it("defines every segment with a label + tagline", () => {
    for (const s of SEGMENTS) {
      expect(SEGMENT_CONFIG[s].label).toBeTruthy();
      expect(SEGMENT_CONFIG[s].tagline).toBeTruthy();
    }
  });

  it("projectTypes only reference known project types", () => {
    const all = new Set<string>(PROJECT_TYPES);
    for (const s of SEGMENTS) {
      for (const p of SEGMENT_CONFIG[s].projectTypes) {
        expect(all.has(p)).toBe(true);
      }
    }
  });

  it("defaultProjectType is always within projectTypes", () => {
    for (const s of SEGMENTS) {
      expect(SEGMENT_CONFIG[s].projectTypes).toContain(SEGMENT_CONFIG[s].defaultProjectType);
    }
  });

  it("multiple allows every project type and defaults to construction", () => {
    expect(SEGMENT_CONFIG.multiple.projectTypes).toEqual([...PROJECT_TYPES]);
    expect(SEGMENT_CONFIG.multiple.defaultProjectType).toBe("construction");
  });

  it("consultancy maps to consultant + design projects", () => {
    expect(SEGMENT_CONFIG.consultancy.projectTypes).toEqual(["consultant", "design"]);
    expect(SEGMENT_CONFIG.consultancy.defaultProjectType).toBe("consultant");
  });

  it("architecture maps to design + consultant projects", () => {
    expect(SEGMENT_CONFIG.architecture.projectTypes).toEqual(["design", "consultant"]);
    expect(SEGMENT_CONFIG.architecture.defaultProjectType).toBe("design");
  });

  it("interior maps to interior + design projects", () => {
    expect(SEGMENT_CONFIG.interior.projectTypes).toEqual(["interior", "design"]);
    expect(SEGMENT_CONFIG.interior.defaultProjectType).toBe("interior");
  });
});

describe("isCompanySegment", () => {
  it("accepts every valid segment", () => {
    for (const s of SEGMENTS) expect(isCompanySegment(s)).toBe(true);
  });
  it("rejects unknown / malformed values", () => {
    expect(isCompanySegment("realestate")).toBe(false);
    expect(isCompanySegment("consultant")).toBe(false);
    expect(isCompanySegment(undefined)).toBe(false);
    expect(isCompanySegment(null)).toBe(false);
    expect(isCompanySegment("")).toBe(false);
  });
});

describe("defaultProjectTypeFor", () => {
  it("maps each segment to its default project type", () => {
    expect(defaultProjectTypeFor("construction")).toBe("construction");
    expect(defaultProjectTypeFor("architecture")).toBe("design");
    expect(defaultProjectTypeFor("interior")).toBe("interior");
    expect(defaultProjectTypeFor("consultancy")).toBe("consultant");
    expect(defaultProjectTypeFor("multiple")).toBe("construction");
  });
  it("falls back to construction for null / unknown", () => {
    expect(defaultProjectTypeFor(null)).toBe("construction");
    expect(defaultProjectTypeFor(undefined)).toBe("construction");
  });
});

describe("segmentProjectTypes", () => {
  it("returns the allowed types per segment", () => {
    expect(segmentProjectTypes("consultancy")).toEqual(["consultant", "design"]);
    expect(segmentProjectTypes("construction")).toEqual(["construction", "interior"]);
  });
  it("falls back to all types for null / unknown", () => {
    expect(segmentProjectTypes(null)).toEqual([...PROJECT_TYPES]);
    expect(segmentProjectTypes(undefined)).toEqual([...PROJECT_TYPES]);
  });
});
