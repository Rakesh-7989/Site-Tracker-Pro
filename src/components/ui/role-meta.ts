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
  superadmin:                { bg: "bg-ink-900",     text: "text-amber-400",   accent: "slate" },
  orgadmin:                  { bg: "bg-amber-100",   text: "text-amber-800",   accent: "amber" },
  promoter:                  { bg: "bg-amber-100",   text: "text-amber-800",   accent: "amber" },
  project_admin:             { bg: "bg-amber-50",    text: "text-amber-700",   accent: "amber" },
  prospector:                { bg: "bg-teal-100",    text: "text-teal-700",    accent: "teal" },
  pm:                        { bg: "bg-blue-100",    text: "text-blue-700",    accent: "blue" },
  architect:                 { bg: "bg-orange-100",  text: "text-orange-700",  accent: "orange" },
  senior_architect:          { bg: "bg-orange-100",  text: "text-orange-800",  accent: "orange" },
  junior_architect:          { bg: "bg-orange-50",   text: "text-orange-700",  accent: "orange" },
  mep_consultant:            { bg: "bg-cyan-100",    text: "text-cyan-700",    accent: "cyan" },
  structural_consultant:     { bg: "bg-stone-200",   text: "text-stone-700",   accent: "stone" },
  site_engineer:             { bg: "bg-blue-50",     text: "text-blue-800",    accent: "blue" },
  site_inspector:            { bg: "bg-rose-100",    text: "text-rose-700",    accent: "rose" },
  design_architect_interior: { bg: "bg-fuchsia-100", text: "text-fuchsia-700", accent: "fuchsia" },
  design_head:               { bg: "bg-fuchsia-100", text: "text-fuchsia-800", accent: "fuchsia" },
  designer:                  { bg: "bg-purple-100",  text: "text-purple-700",  accent: "purple" },
  consultant_head:           { bg: "bg-indigo-100",  text: "text-indigo-800",  accent: "indigo" },
  consultant:                { bg: "bg-indigo-100",  text: "text-indigo-700",  accent: "indigo" },
  contractor:                { bg: "bg-violet-100",  text: "text-violet-700",  accent: "violet" },
  sub_contractor:            { bg: "bg-violet-50",   text: "text-violet-800",  accent: "violet" },
  vendor:                    { bg: "bg-yellow-100",  text: "text-yellow-800",  accent: "yellow" },
  client:                    { bg: "bg-emerald-100", text: "text-emerald-700", accent: "emerald" },
};

const FALLBACK: RoleMeta = Object.freeze({
  label: "Member", bg: "bg-stone-100", text: "text-stone-700", accent: "stone",
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
