// SiteTrack Pro — White-label branding cascade.
//
// Inspired by TripGZio's `Branding.uiTheme` cascade (Org → Property → defaults).
// In construction:
//   Org-level brand     — Builder/Architect firm's identity (used on most projects)
//   Project-level brand — Joint-venture or co-branded project may override
//   System default      — Editorial cream + amber gradient
//
// Resolution order is: project override → org default → system default.
// Any field can be null at any level — falls through transparently.
//
// Branding shape:
//   { logoUrl?, tagline?, accent?, theme?, primary_color?, dark? }
//
// `accent` values: "amber" (default) | "blue" | "emerald" | "violet" | "rose"
// `theme`  values: "editorial" (Fraunces + cream) | "operational" (Inter + slate)

export const DEFAULT_BRAND = {
  logoUrl: null,
  tagline: "Construction Suite",
  accent: "amber",
  theme: "editorial",
  primary_color: "#d97706", // amber-600
  dark: false,
};

/** Resolve effective brand for a (org, project) pair. */
export function resolveBranding(branding, orgId, projectId) {
  const out = { ...DEFAULT_BRAND };
  const orgB = branding?.org?.[orgId];
  if (orgB) Object.assign(out, stripNulls(orgB));
  const projB = branding?.project?.[projectId];
  if (projB) Object.assign(out, stripNulls(projB));
  return out;
}

/** Set / update org-level branding (returns new branding object). */
export function setOrgBrand(branding, orgId, patch) {
  return {
    ...branding,
    org: { ...(branding?.org || {}), [orgId]: { ...(branding?.org?.[orgId] || {}), ...patch } },
  };
}

/** Set / update project-level branding. */
export function setProjectBrand(branding, projectId, patch) {
  return {
    ...branding,
    project: { ...(branding?.project || {}), [projectId]: { ...(branding?.project?.[projectId] || {}), ...patch } },
  };
}

/** Clear project-level override (cascade falls back to org). */
export function clearProjectBrand(branding, projectId) {
  const next = { ...(branding?.project || {}) };
  delete next[projectId];
  return { ...branding, project: next };
}

/** CSS variables string for inline injection — usable in <style> or style="". */
export function brandToCssVars(brand) {
  return [
    `--brand-primary: ${brand.primary_color || "#d97706"}`,
    `--brand-accent: ${accentToHex(brand.accent)}`,
  ].join("; ");
}

/** Map accent name to a hex color used across UI. */
export function accentToHex(accent) {
  switch (accent) {
    case "blue":    return "#2563eb";
    case "emerald": return "#059669";
    case "violet":  return "#7c3aed";
    case "rose":    return "#e11d48";
    case "amber":
    default:        return "#d97706";
  }
}

/** Strip null/undefined keys from an object so the cascade merges cleanly. */
function stripNulls(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    if (obj[k] !== null && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}
