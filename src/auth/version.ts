// SiteTrack Pro — TS rebuild marker.
//
// This file exists to prove the TypeScript pipeline + path aliases are
// wired correctly. Imported by tests/rebuildFoundation.test.ts via
// '@/auth/version' so a passing test = aliases + strict TS = working.
//
// Remove this file when Phase 1 lands (it gets replaced by real auth code).

export const REBUILD_PHASE = "0" as const;
export const REBUILD_PHASE_DESCRIPTION = "TypeScript foundation" as const;
export const REBUILD_STARTED_AT = "2026-06-04" as const;

/** Returns a banner string used by smoke tests to confirm the phase. */
export function rebuildBanner(): string {
  return `SiteTrack Pro v3.5 rebuild — Phase ${REBUILD_PHASE}: ${REBUILD_PHASE_DESCRIPTION} (started ${REBUILD_STARTED_AT})`;
}
