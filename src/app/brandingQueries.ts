// SiteTrack Pro — branding queries for the v3 shell + B6 white-label presets.
// Schema: scripts/supabase/23_branding.sql

import type { QueryResult } from "@/app/queries";

export interface BrandingRow {
  id: string;
  orgId: string;
  projectId: string | null;
  logoUrl: string | null;
  tagline: string | null;
  accent: string | null;
  theme: string | null;
}

const DEFAULT_BRANDING_COLS = "id, org_id, project_id, logo_url, tagline, accent, theme";

function mapBrandingRow(r: Record<string, unknown>): BrandingRow {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    projectId: r.project_id == null ? null : String(r.project_id),
    logoUrl: r.logo_url == null ? null : String(r.logo_url),
    tagline: r.tagline == null ? null : String(r.tagline),
    accent: r.accent == null ? null : String(r.accent),
    theme: r.theme == null ? null : String(r.theme),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgBranding(client: any, orgId: string): Promise<QueryResult<BrandingRow | null>> {
  try {
    const { data, error } = await client
      .from("branding")
      .select(DEFAULT_BRANDING_COLS)
      .eq("org_id", orgId)
      .is("project_id", null)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    return { ok: true, data: mapBrandingRow(data as Record<string, unknown>) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProjectBranding(client: any, orgId: string, projectId: string): Promise<QueryResult<BrandingRow | null>> {
  try {
    const { data, error } = await client
      .from("branding")
      .select(DEFAULT_BRANDING_COLS)
      .eq("org_id", orgId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    return { ok: true, data: mapBrandingRow(data as Record<string, unknown>) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectBrandings(client: any, orgId: string): Promise<QueryResult<BrandingRow[]>> {
  try {
    const { data, error } = await client
      .from("branding")
      .select(DEFAULT_BRANDING_COLS)
      .eq("org_id", orgId)
      .not("project_id", "is", null);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return { ok: true, data: rows.map(mapBrandingRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertOrgBranding(
  client: any,
  orgId: string,
  patch: { logoUrl?: string | null; tagline?: string | null; accent?: string | null; theme?: string | null },
): Promise<QueryResult<{ id: string }>> {
  try {
    const row: Record<string, unknown> = { org_id: orgId, project_id: null };
    if ("logoUrl" in patch) row.logo_url = patch.logoUrl;
    if ("tagline" in patch) row.tagline = patch.tagline;
    if ("accent" in patch) row.accent = patch.accent;
    if ("theme" in patch) row.theme = patch.theme;
    const { data, error } = await client
      .from("branding")
      .upsert(row, { onConflict: "org_id", ignoreDuplicates: false })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertProjectBranding(
  client: any,
  orgId: string,
  projectId: string,
  patch: { logoUrl?: string | null; tagline?: string | null; accent?: string | null; theme?: string | null },
): Promise<QueryResult<{ id: string }>> {
  try {
    const row: Record<string, unknown> = { org_id: orgId, project_id: projectId };
    if ("logoUrl" in patch) row.logo_url = patch.logoUrl;
    if ("tagline" in patch) row.tagline = patch.tagline;
    if ("accent" in patch) row.accent = patch.accent;
    if ("theme" in patch) row.theme = patch.theme;
    const { data, error } = await client
      .from("branding")
      .upsert(row, { onConflict: "org_id, project_id", ignoreDuplicates: false })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteProjectBranding(client: any, orgId: string, projectId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client
      .from("branding")
      .delete()
      .eq("org_id", orgId)
      .eq("project_id", projectId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── B6 white-label presets (additive, non-breaking) ──────────────────────────

export type BrandingAccent = "amber" | "blue" | "emerald" | "violet" | "rose";

export type BrandingPreset = {
  id: "default" | "construction" | "architecture" | "interior" | "consultancy";
  label: string;
  accent: BrandingAccent;
  tagline: string;
};

export const BRANDING_PRESETS: BrandingPreset[] = [
  { id: "default", label: "SiteTrack Pro", accent: "blue", tagline: "Construction Management" },
  { id: "construction", label: "Construction", accent: "emerald", tagline: "Build Together" },
  { id: "architecture", label: "Architecture", accent: "violet", tagline: "Design & Construct" },
  { id: "interior", label: "Interior", accent: "amber", tagline: "Space & Interiors" },
  { id: "consultancy", label: "Consultancy", accent: "rose", tagline: "Fixed-Fee Engagements" },
];

export type OrgBrandingForm = {
  logoUrl: string;
  tagline: string;
  accent: BrandingAccent;
};

export const brandingPresetToForm = (preset: BrandingPreset): OrgBrandingForm => ({
  logoUrl: "",
  tagline: preset.tagline,
  accent: preset.accent,
});

export const brandingFormToPreset = (form: OrgBrandingForm): BrandingPreset | null => {
  const preset = BRANDING_PRESETS.find((p) => p.accent === form.accent && p.tagline === form.tagline);
  return preset || null;
};

export const DEFAULT_BRANDING: OrgBrandingForm = {
  logoUrl: "",
  tagline: "Construction Suite",
  accent: "blue",
};
