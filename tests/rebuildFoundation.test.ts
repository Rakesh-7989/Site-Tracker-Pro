// SiteTrack Pro — Phase 0 smoke test.
//
// Proves the TypeScript + path alias + strict-mode pipeline works end-to-end.
// If this test passes:
//   - TypeScript compiler resolves @/* alias
//   - Vitest picks up .ts files
//   - Strict mode catches type errors at build time
//   - JS tests continue to work alongside (no regression)

import { describe, it, expect } from "vitest";

import {
  REBUILD_PHASE,
  REBUILD_PHASE_DESCRIPTION,
  REBUILD_STARTED_AT,
  rebuildBanner,
} from "@/auth/version";

describe("Phase 0 — TypeScript foundation", () => {
  it("path alias '@/auth/*' resolves", () => {
    expect(REBUILD_PHASE).toBe("0");
  });

  it("strict-typed constants exposed", () => {
    expect(REBUILD_PHASE_DESCRIPTION).toBe("TypeScript foundation");
    expect(REBUILD_STARTED_AT).toBe("2026-06-04");
  });

  it("function returns the expected banner", () => {
    const banner = rebuildBanner();
    expect(banner).toMatch(/^SiteTrack Pro v3\.5 rebuild — Phase 0:/);
    expect(banner).toContain("TypeScript foundation");
    expect(banner).toContain("2026-06-04");
  });
});
