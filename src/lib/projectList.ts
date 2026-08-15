// SiteTrack Pro — pure helpers for the projects list view (P-C).
//
// No client, no React. The rollup / filter / sort logic is extracted here so
// the ProjectsListView stays thin and the behavior is unit-testable.

import type { ProjectSummary } from "@/app/queries";
import { isProjectLifecycleStatus } from "@/lib/projectLifecycle";

/** Counts across lifecycle states for the stat strip. `total` = live (non-archived). */
export interface ProjectRollup {
  total: number;
  active: number;
  paused: number;
  onHold: number;
  deactivated: number;
  completed: number;
  cancelled: number;
  archived: number;
  /** Sum of `budget` across live (non-archived) projects. */
  totalBudget: number;
}

const ZERO_ROLLUP: ProjectRollup = {
  total: 0,
  active: 0,
  paused: 0,
  onHold: 0,
  deactivated: 0,
  completed: 0,
  cancelled: 0,
  archived: 0,
  totalBudget: 0,
};

/** Aggregate a project list into lifecycle buckets + live budget total. */
export function projectRollup(projects: ProjectSummary[]): ProjectRollup {
  const r: ProjectRollup = { ...ZERO_ROLLUP };
  for (const p of projects) {
    if (p.archivedAt != null) {
      r.archived += 1;
      continue;
    }
    r.total += 1;
    if (typeof p.budget === "number" && Number.isFinite(p.budget)) r.totalBudget += p.budget;
    const status = p.status;
    if (!isProjectLifecycleStatus(status)) continue;
    if (status === "active") r.active += 1;
    else if (status === "paused") r.paused += 1;
    else if (status === "on_hold") r.onHold += 1;
    else if (status === "deactivated") r.deactivated += 1;
    else if (status === "completed") r.completed += 1;
    else if (status === "cancelled") r.cancelled += 1;
  }
  return r;
}

/**
 * Case-insensitive substring match against name, location, client name and
 * description. Empty/whitespace query returns the input unchanged.
 */
export function filterProjects(projects: ProjectSummary[], query: string): ProjectSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => {
    const hay = [
      p.name,
      p.location,
      p.clientName,
      p.description,
    ].filter((s): s is string => typeof s === "string" && s.length > 0);
    return hay.some((s) => s.toLowerCase().includes(q));
  });
}

export type ProjectSortKey = "name" | "status" | "location" | "progress" | "budget" | "startDate";
export type SortDirection = "asc" | "desc";

export const PROJECT_SORT_KEYS: Array<{ key: ProjectSortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "progress", label: "Progress" },
  { key: "budget", label: "Budget" },
  { key: "startDate", label: "Start date" },
];

function dirValue<T>(a: T, b: T, dir: SortDirection): number {
  const cmp = a < b ? -1 : a > b ? 1 : 0;
  return dir === "desc" ? -cmp : cmp;
}

/** Stable-ish sort on the given key. Returns a new array (input untouched). */
export function sortProjects(
  projects: ProjectSummary[],
  key: ProjectSortKey,
  dir: SortDirection = "asc",
): ProjectSummary[] {
  const copy = [...projects];
  switch (key) {
    case "name":
      return copy.sort((a, b) => dirValue(a.name.toLowerCase(), b.name.toLowerCase(), dir));
    case "status":
      return copy.sort((a, b) => dirValue(projStatusKey(a.status), projStatusKey(b.status), dir));
    case "location":
      return copy.sort((a, b) => dirValue(a.location ?? "", b.location ?? "", dir));
    case "progress":
      return copy.sort((a, b) => dirValue(a.progress || 0, b.progress || 0, dir));
    case "budget":
      return copy.sort((a, b) => dirValue(a.budget ?? 0, b.budget ?? 0, dir));
    case "startDate":
      return copy.sort((a, b) => dirValue(a.startDate ?? "", b.startDate ?? "", dir));
    default:
      return copy;
  }
}

/** Map a raw status string to a sortable key: null/unknown sorts first. */
function projStatusKey(status: string | null): string {
  return status ?? "\u0000";
}
