// SiteTrack Pro — capabilities.ts integrity.

import { describe, it, expect } from "vitest";
import { CAPABILITIES, isCapability, capabilityDomain } from "@/auth/capabilities";

describe("CAPABILITIES catalog", () => {
  it("has no duplicates", () => {
    expect(new Set(CAPABILITIES).size).toBe(CAPABILITIES.length);
  });

  it("every capability has a domain (colon-separated id)", () => {
    for (const c of CAPABILITIES) {
      expect(c).toMatch(/^[a-z]+:[a-z][a-z0-9-]+(?::[a-z][a-z0-9-]+)*$/);
    }
  });

  it("includes the Sprint 2 + Sprint 4 critical capabilities", () => {
    expect(CAPABILITIES).toContain("dpr:submit" as never);
    expect(CAPABILITIES).toContain("voice:record" as never);
    expect(CAPABILITIES).toContain("photo:upload" as never);
    expect(CAPABILITIES).toContain("digest:receive" as never);
    expect(CAPABILITIES).toContain("handover:generate" as never);
    expect(CAPABILITIES).toContain("handover:sign" as never);
  });
});

describe("isCapability", () => {
  it("accepts valid values", () => {
    expect(isCapability("dpr:submit")).toBe(true);
  });
  it("rejects invalid + non-string", () => {
    expect(isCapability("not:real")).toBe(false);
    expect(isCapability(null)).toBe(false);
    expect(isCapability(42)).toBe(false);
  });
});

describe("capabilityDomain", () => {
  it("extracts the first segment", () => {
    expect(capabilityDomain("dpr:submit")).toBe("dpr");
    expect(capabilityDomain("org:members:manage")).toBe("org");
  });
});
