export interface BrandRow {
  logoUrl?: string | null;
  tagline?: string;
  accent?: "amber" | "blue" | "emerald" | "violet" | "rose";
  theme?: "editorial" | "operational";
  primary_color?: string;
  dark?: boolean;
  [key: string]: unknown;
}

export interface BrandingStore {
  org?: Record<string, BrandRow>;
  project?: Record<string, BrandRow>;
}

export const DEFAULT_BRAND: BrandRow = {
  logoUrl: null,
  tagline: "Construction Suite",
  accent: "amber",
  theme: "editorial",
  primary_color: "#d97706",
  dark: false,
};

function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj || {})) {
    if (obj[k] !== null && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function resolveBranding(
  branding: BrandingStore | undefined,
  orgId: string,
  projectId: string,
): BrandRow {
  const out = { ...DEFAULT_BRAND };
  const orgB = branding?.org?.[orgId];
  if (orgB) Object.assign(out, stripNulls(orgB));
  const projB = branding?.project?.[projectId];
  if (projB) Object.assign(out, stripNulls(projB));
  return out;
}

export function setOrgBrand(
  branding: BrandingStore,
  orgId: string,
  patch: Partial<BrandRow>,
): BrandingStore {
  return {
    ...branding,
    org: { ...(branding?.org || {}), [orgId]: { ...(branding?.org?.[orgId] || {}), ...patch } },
  };
}

export function setProjectBrand(
  branding: BrandingStore,
  projectId: string,
  patch: Partial<BrandRow>,
): BrandingStore {
  return {
    ...branding,
    project: { ...(branding?.project || {}), [projectId]: { ...(branding?.project?.[projectId] || {}), ...patch } },
  };
}

export function clearProjectBrand(branding: BrandingStore, projectId: string): BrandingStore {
  const next = { ...(branding?.project || {}) };
  delete next[projectId];
  return { ...branding, project: next };
}

export function brandToCssVars(brand: BrandRow): string {
  return [
    `--brand-primary: ${brand.primary_color || "#d97706"}`,
    `--brand-accent: ${accentToHex(brand.accent)}`,
  ].join("; ");
}

export function accentToHex(accent?: string): string {
  switch (accent) {
    case "blue":    return "#2563eb";
    case "emerald": return "#059669";
    case "violet":  return "#7c3aed";
    case "rose":    return "#e11d48";
    case "amber":
    default:        return "#d97706";
  }
}
