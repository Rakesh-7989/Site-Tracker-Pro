/**
 * SiteTrack Pro — organization FIRM TYPE (migration 240).
 *
 * `segments` (mig 228) = which INDUSTRY modules an org sees.
 * `org_type`           = what KIND of business it is — drives ROLE TEMPLATES,
 *                        dashboards and per-firm AI agents (Role Intelligence
 *                        Study, Aug-2026). NULL = legacy/unclassified.
 *
 * Pure + testable; DB source of truth: scripts/supabase/240_org_types.sql.
 */

export const ORG_TYPES = [
  "developer",
  "builder",
  "architecture_firm",
  "interior_firm",
  "contractor",
  "consultant",
  "pmc",
  "vendor",
] as const;

export type OrgType = (typeof ORG_TYPES)[number];

export function isOrgType(v: unknown): v is OrgType {
  return typeof v === "string" && (ORG_TYPES as readonly string[]).includes(v);
}

/** Minimal org shape this module needs (fits the hydrated session). */
export interface OrgTypeSource {
  orgType?: unknown;
  segments?: string[] | null;
}

const VALID_SEGMENTS = new Set(["construction", "architecture", "interior", "consultancy", "multiple"]);

/**
 * Resolve a firm type: explicit org_type wins; otherwise derive from
 * UNAMBIGUOUS single-segment orgs (same rules as the migration backfill).
 */
export function resolveOrgType(org: OrgTypeSource | null | undefined): OrgType | null {
  if (!org) return null;
  if (isOrgType(org.orgType)) return org.orgType;

  const segs = Array.isArray(org.segments)
    ? org.segments.filter((s): s is string => typeof s === "string" && VALID_SEGMENTS.has(s))
    : [];
  if (segs.length !== 1) return null; // multiple/empty → cannot guess

  switch (segs[0]) {
    case "architecture": return "architecture_firm";
    case "interior": return "interior_firm";
    case "consultancy": return "consultant";
    default: return null; // construction alone ≠ developer/builder guess
  }
}

/** Convenience: does this org belong to the DESIGN-side firm family? */
export function isDesignFirm(t: OrgType | null): boolean {
  return t === "architecture_firm" || t === "interior_firm";
}

/** Convenience: execution-side (builds things on site). */
export function isExecutionFirm(t: OrgType | null): boolean {
  return t === "developer" || t === "builder" || t === "contractor";
}
