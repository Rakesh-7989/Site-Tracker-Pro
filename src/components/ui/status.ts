// SiteTrack Pro — status color helper (Phase 4).
//
// Typed port of the legacy sCol() lookup. Drives the StatusBadge atom +
// any view that color-codes a status. `bar` is the leading colour-bar
// hex used by the flat-banner shadow trick.

export interface StatusColors {
  bg: string;
  text: string;
  border: string;
  dot: string;
  bar: string;   // hex for the inset box-shadow bar
}

const MAP: Record<string, StatusColors> = {
  active:      { bg: "bg-success-tint", text: "text-success", border: "border-emerald-200", dot: "bg-emerald-500", bar: "#047857" },
  completed:   { bg: "bg-info-tint",    text: "text-info",    border: "border-blue-200",    dot: "bg-blue-500",    bar: "#1E40AF" },
  on_hold:     { bg: "bg-accent-tint",  text: "text-warning", border: "border-amber-200",   dot: "bg-amber-500",   bar: "#B45309" },
  in_progress: { bg: "bg-[var(--st-violet-tint)]",  text: "text-[var(--st-violet)]",  border: "border-violet-200",  dot: "bg-violet-500",  bar: "#7C3AED" },
  pending:     { bg: "bg-elevated",     text: "text-fg-secondary", border: "border-default",   dot: "bg-ink-300",     bar: "#8E887C" },
  current:     { bg: "bg-success-tint", text: "text-success", border: "border-emerald-200", dot: "bg-emerald-500", bar: "#047857" },
  superseded:  { bg: "bg-elevated",     text: "text-fg-tertiary", border: "border-default",   dot: "bg-ink-300",     bar: "#8E887C" },
};

const DEFAULT: StatusColors = { bg: "bg-elevated", text: "text-fg-secondary", border: "border-default", dot: "bg-ink-400", bar: "#8E887C" };

export function statusColors(status: string | null | undefined): StatusColors {
  if (status && status in MAP) return MAP[status]!;
  return DEFAULT;
}

export const KNOWN_STATUSES = Object.keys(MAP);
