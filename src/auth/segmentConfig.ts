// SiteTrack Pro — company segment config (v4 Phase C0).
//
// A SEGMENT is what an ORGANIZATION is (what kind of company), distinct from
// a PROJECT TYPE (what kind of project a row in `projects` is). The org's
// segment drives:
//   - which project types the org may create
//   - the default project type stamped on new projects / first onboarding
//     project
//   - segment-scoped nav + tab visibility (gates consumed by buildNav /
//     visibleTabs — see Task 4)
//   - per-segment plan contents (later phases)
//
// Values MUST match organizations.segment CHECK (migration 134).
// DB source of truth: scripts/supabase/134_org_segment.sql

import type { ProjectType } from "./roles";

export const SEGMENTS = [
  "construction",
  "architecture",
  "interior",
  "consultancy",
  "multiple",
] as const;
export type CompanySegment = (typeof SEGMENTS)[number];

export interface SegmentConfig {
  /** Display label (UI pickers / onboarding). */
  label: string;
  /** One-line positioning copy. */
  tagline: string;
  /** Project types an org in this segment may create. */
  projectTypes: ReadonlyArray<ProjectType>;
  /** Default type stamped on new projects / first onboarding project. */
  defaultProjectType: ProjectType;
}

export const SEGMENT_CONFIG: Record<CompanySegment, SegmentConfig> = {
  construction: {
    label: "Construction Company",
    tagline: "Builders, contractors & developers",
    projectTypes: ["construction", "interior"],
    defaultProjectType: "construction",
  },
  architecture: {
    label: "Architecture Firm",
    tagline: "Architectural design practices",
    projectTypes: ["design", "consultant"],
    defaultProjectType: "design",
  },
  interior: {
    label: "Interior Design",
    tagline: "Interior design & fit-out firms",
    projectTypes: ["interior", "design"],
    defaultProjectType: "interior",
  },
  consultancy: {
    label: "Consultancy",
    tagline: "Structural / MEP / specialist consultants",
    projectTypes: ["consultant", "design"],
    defaultProjectType: "consultant",
  },
  multiple: {
    label: "Multiple Segments",
    tagline: "Firms spanning several segments",
    projectTypes: ["construction", "interior", "design", "consultant"],
    defaultProjectType: "construction",
  },
};

/** Type guard. */
export function isCompanySegment(value: unknown): value is CompanySegment {
  return typeof value === "string" && (SEGMENTS as readonly string[]).includes(value);
}

/**
 * Default project type to stamp for a segment. Null/unknown segment → the
 * back-compat default ('construction', matching projects.type's column default).
 */
export function defaultProjectTypeFor(segment: CompanySegment | null | undefined): ProjectType {
  if (segment && isCompanySegment(segment)) return SEGMENT_CONFIG[segment].defaultProjectType;
  return "construction";
}

/**
 * Project types an org in this segment may create. Null/unknown segment → all
 * types (back-compat with pre-segment orgs).
 */
export function segmentProjectTypes(segment: CompanySegment | null | undefined): ReadonlyArray<ProjectType> {
  if (segment && isCompanySegment(segment)) return SEGMENT_CONFIG[segment].projectTypes;
  return SEGMENT_CONFIG.multiple.projectTypes;
}

// ── Multi-segment orgs (v5 Growth, migration 228) ───────────────────────────

/** The segments a user can PICK (everything except the derived 'multiple'). */
export const CORE_SEGMENTS: ReadonlyArray<Exclude<CompanySegment, "multiple">> =
  SEGMENTS.filter((s): s is Exclude<CompanySegment, "multiple"> => s !== "multiple");

/** The derived catch-all value (legacy column only — not storable in segments[]). */
export const MULTIPLE_SEGMENT: CompanySegment = "multiple";

/** All four core segments — what legacy `segment = 'multiple'` expands to. */
export const ALL_CORE_SEGMENTS: ReadonlyArray<Exclude<CompanySegment, "multiple">> = CORE_SEGMENTS;

/** Type guard for a raw text[] from the DB: dedupe + drop unknowns. */
export function isCompanySegmentArray(raw: unknown): CompanySegment[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CompanySegment[] = [];
  for (const v of raw) {
    if (isCompanySegment(v) && v !== MULTIPLE_SEGMENT && !out.includes(v)) out.push(v);
  }
  return out.length ? out : null;
}

/**
 * Resolve an org's effective segment set (concrete picks only):
 *   segments array → as-is; legacy 'multiple' → all four; single → [that];
 *   null/unknown → null (legacy unconfigured — gated items hidden).
 */
export function resolveOrgSegments(
  segmentsRaw: unknown,
  segment: CompanySegment | null | undefined,
): CompanySegment[] | null {
  const arr = isCompanySegmentArray(segmentsRaw);
  if (arr) return arr;
  if (segment === MULTIPLE_SEGMENT) return [...ALL_CORE_SEGMENTS];
  if (segment && isCompanySegment(segment)) return [segment];
  return null;
}

/**
 * The legacy single-value column to persist alongside an array:
 * 1 pick → that pick; 2+ → 'multiple'; none → null.
 */
export function legacySegmentFor(segments: ReadonlyArray<CompanySegment>): CompanySegment | null {
  if (segments.length === 1) return segments[0];
  if (segments.length > 1) return MULTIPLE_SEGMENT;
  return null;
}

/** Union of project types across picked segments (empty → all, back-compat). */
export function projectTypesForSegments(segments: ReadonlyArray<CompanySegment>): ProjectType[] {
  const out: ProjectType[] = [];
  for (const s of segments) {
    for (const pt of SEGMENT_CONFIG[s]?.projectTypes ?? []) {
      if (!out.includes(pt)) out.push(pt);
    }
  }
  return out.length ? out : [...SEGMENT_CONFIG.multiple.projectTypes];
}
