// SiteTrack Pro — per-org accent → design-token CSS var applier (v4 Phase F).
// Maps the org's `accent` swatch (amber/blue/emerald/violet/rose) onto the
// --st-accent token family so the entire shell re-themes without a reload.
// Mirrors index.css token names. Pure + testable.

export type AccentName = "amber" | "blue" | "emerald" | "violet" | "rose";

/** Full accent token family per swatch (accent/2/light/tint). */
export const ACCENT_THEMES: Record<AccentName, { accent: string; accent2: string; light: string; tint: string }> = {
  amber:    { accent: "#FF6B1A", accent2: "#E55A0E", light: "#FF8A3D", tint: "#FFF1E6" },
  blue:     { accent: "#2563EB", accent2: "#1D4ED8", light: "#3B82F6", tint: "#EFF6FF" },
  emerald:  { accent: "#059669", accent2: "#047857", light: "#10B981", tint: "#ECFDF5" },
  violet:   { accent: "#7C3AED", accent2: "#6D28D9", light: "#8B5CF6", tint: "#F5F3FF" },
  rose:     { accent: "#E11D48", accent2: "#BE123C", light: "#F43F5E", tint: "#FFF1F2" },
};

/** Parse any stored accent string into a valid AccentName (unknown → amber). */
export function normalizeAccent(v: unknown): AccentName {
  return v === "blue" || v === "emerald" || v === "violet" || v === "rose" || v === "amber"
    ? v
    : "amber";
}

/** Return a CSS custom-property declaration string for a swatch (used on :root). */
export function accentToCssVars(accent: AccentName): string {
  const t = ACCENT_THEMES[accent];
  return [
    "--st-accent:" + t.accent,
    "--st-accent-rgb:" + rgbOf(t.accent),
    "--st-accent-2:" + t.accent2,
    "--st-accent-light:" + t.light,
    "--st-accent-tint:" + t.tint,
  ].join("; ");
}

function rgbOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}