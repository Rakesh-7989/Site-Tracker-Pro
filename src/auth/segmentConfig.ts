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
