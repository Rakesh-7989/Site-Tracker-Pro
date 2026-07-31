// SiteTrack Pro — role display metadata (Phase 4).
//
// Typed against the full 22-role identity catalog. Maps each role to a
// Tailwind chip palette + accent color key (used by Avatar). Labels come
// from @/auth ROLE_LABEL so there's one source for the human-readable
// name; this module only owns the COLOR mapping.

import { ROLE_LABEL, type IdentityRole } from "@/auth";

/** Accent color key — drives Avatar background + chip tint. */
export type AccentColor =
  | "orange" | "amber" | "blue" | "violet" | "emerald" | "teal"
  | "cyan" | "stone" | "rose" | "pink" | "fuchsia" | "purple"
  | "indigo" | "yellow" | "slate";

export interface RoleMeta {
  label: string;
  bg: string;     // Tailwind chip background class
  text: string;   // Tailwind chip text class
  accent: AccentColor;
}

const COLOR: Record<IdentityRole, { bg: string; text: string; accent: AccentColor }> = {
  superadmin:                { bg: "bg-ink",          text: "text-accent-light",   accent: "slate" },
  orgadmin:                  { bg: "bg-accent-tint",  text: "text-warning",        accent: "amber" },
  promoter:                  { bg: "bg-accent-tint",  text: "text-warning",        accent: "amber" },
  project_admin:             { bg: "bg-accent-tint",  text: "text-warning",        accent: "amber" },
  prospector:                { bg: "bg-teal-tint",    text: "text-teal",           accent: "teal" },
  pm:                        { bg: "bg-blue-tint",    text: "text-info",           accent: "blue" },
  architect:                 { bg: "bg-orange-tint", text: "text-warning",     accent: "orange" },
  senior_architect:          { bg: "bg-orange-tint", text: "text-warning",     accent: "orange" },
  junior_architect:          { bg: "bg-accent-tint",  text: "text-warning",        accent: "orange" },
  mep_consultant:            { bg: "bg-cyan-tint",    text: "text-cyan",          accent: "cyan" },
  structural_consultant:     { bg: "bg-elevated",     text: "text-fg-secondary",   accent: "stone" },
  site_engineer:             { bg: "bg-info-tint",    text: "text-info",           accent: "blue" },
  site_inspector:            { bg: "bg-rose-tint",    text: "text-rose",           accent: "rose" },
  design_architect_interior: { bg: "bg-fuchsia-tint", text: "text-fuchsia",        accent: "fuchsia" },
  design_head:               { bg: "bg-fuchsia-tint", text: "text-fuchsia",        accent: "fuchsia" },
  designer:                  { bg: "bg-purple-tint",  text: "text-purple",         accent: "purple" },
  consultant_head:           { bg: "bg-indigo-tint",  text: "text-info",           accent: "indigo" },
  consultant:                { bg: "bg-indigo-tint",  text: "text-info",           accent: "indigo" },
  contractor:                { bg: "bg-violet-tint-100", text: "text-violet",     accent: "violet" },
  sub_contractor:            { bg: "bg-violet-tint",  text: "text-violet",         accent: "violet" },
  vendor:                    { bg: "bg-yellow-tint",  text: "text-yellow",         accent: "yellow" },
  client:                    { bg: "bg-emerald-tint", text: "text-success",        accent: "emerald" },
};

const FALLBACK: RoleMeta = Object.freeze({
  label: "Member", bg: "bg-elevated", text: "text-fg-secondary", accent: "stone",
});

/**
 * Safe role-meta lookup. Returns a sensible fallback for unknown / null
 * roles so a fresh user with no profile row never crashes the UI.
 */
export function roleMeta(role: string | null | undefined): RoleMeta {
  if (role && role in COLOR) {
    const r = role as IdentityRole;
    return { label: ROLE_LABEL[r], ...COLOR[r] };
  }
  return FALLBACK;
}

/** Full meta map for the design-system gallery + tests. */
export function allRoleMeta(): Array<{ role: IdentityRole } & RoleMeta> {
  return (Object.keys(COLOR) as IdentityRole[]).map(role => ({
    role,
    label: ROLE_LABEL[role],
    ...COLOR[role],
  }));
}
