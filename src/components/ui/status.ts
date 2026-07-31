// SiteTrack Pro — status color helper (Phase 4).
//
// Typed port of the legacy sCol() lookup. Drives the StatusBadge atom +
// any view that color-codes a status. `bar` is the leading colour-bar
// CSS var used by the flat-banner shadow trick.

export interface StatusColors {
  bg: string;
  text: string;
  border: string;
  dot: string;   // CSS var for the dot background
  bar: string;   // CSS var for the inset box-shadow bar
}

const MAP: Record<string, StatusColors> = {
  active:      { bg: "bg-success-tint", text: "text-success", border: "border-success",     dot: "var(--st-success)", bar: "var(--st-success)" },
  completed:   { bg: "bg-info-tint",    text: "text-info",    border: "border-info",        dot: "var(--st-indigo)",  bar: "var(--st-indigo)" },
  on_hold:     { bg: "bg-accent-tint",  text: "text-warning", border: "border-warning",     dot: "var(--st-warning)", bar: "var(--st-warning)" },
  in_progress: { bg: "bg-[var(--st-violet-tint)]",  text: "text-[var(--st-violet)]",  border: "border-violet",     dot: "var(--st-violet)", bar: "var(--st-violet)" },
  pending:     { bg: "bg-elevated",     text: "text-fg-secondary", border: "border-default", dot: "var(--st-text-tertiary)", bar: "var(--st-text-tertiary)" },
  current:     { bg: "bg-success-tint", text: "text-success", border: "border-success",     dot: "var(--st-success)", bar: "var(--st-success)" },
  superseded:  { bg: "bg-elevated",     text: "text-fg-tertiary", border: "border-default", dot: "var(--st-text-tertiary)", bar: "var(--st-text-tertiary)" },
};

const DEFAULT: StatusColors = { bg: "bg-elevated", text: "text-fg-secondary", border: "border-default", dot: "var(--st-text-tertiary)", bar: "var(--st-text-tertiary)" };

export function statusColors(status: string | null | undefined): StatusColors {
  if (status && status in MAP) return MAP[status]!;
  return DEFAULT;
}

export const KNOWN_STATUSES = Object.keys(MAP);
