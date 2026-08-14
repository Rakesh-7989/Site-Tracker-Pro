// SiteTrack Pro — branding queries (B6 white-label).
// CRUD + helpers for org-level branding: logo, tagline, accent.

import type { BrandingRow } from '@/features/shell/useOrgBranding';

export type BrandingPreset = {
  id: 'default' | 'construction' | 'architecture' | 'interior' | 'consultancy';
  label: string;
  accent: 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';
  tagline: string;
};

export const BRANDING_PRESETS: BrandingPreset[] = [
  { id: 'default', label: 'SiteTrack Pro', accent: 'blue', tagline: 'Construction Management' },
  { id: 'construction', label: 'Construction', accent: 'emerald', tagline: 'Build Together' },
  { id: 'architecture', label: 'Architecture', accent: 'violet', tagline: 'Design & Construct' },
  { id: 'interior', label: 'Interior', accent: 'amber', tagline: 'Space & Interiors' },
  { id: 'consultancy', label: 'Consultancy', accent: 'rose', tagline: 'Fixed-Fee Engagements' },
];

export type OrgBrandingForm = {
  logoUrl: string;
  tagline: string;
  accent: 'amber' | 'blue' | 'emerald' | 'violet' | 'rose';
};

export const brandingPresetToForm = (preset: BrandingPreset): OrgBrandingForm => ({
  logoUrl: '',
  tagline: preset.tagline,
  accent: preset.accent,
});

export const brandingFormToPreset = (form: OrgBrandingForm): BrandingPreset | null => {
  const preset = BRANDING_PRESETS.find((p) => p.accent === form.accent && p.tagline === form.tagline);
  return preset || null;
};

export const DEFAULT_BRANDING: BrandingRow = {
  id: '',
  orgId: '',
  logoUrl: '',
  tagline: 'Construction Suite',
  accent: 'blue',
};