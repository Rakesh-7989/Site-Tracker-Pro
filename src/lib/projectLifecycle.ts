// SiteTrack Pro — project lifecycle model (P-B).
//
// Pure helpers over the projects.status + archived_at lifecycle:
//   * Reversible states: active ⇄ paused / on_hold / deactivated
//     (reactivate → active).
//   * Terminal states: completed / cancelled (no forward move except archive
//     or reactivate).
//   * archived_at = soft-delete tombstone (hard-hide + quota freed).
// No DOM / client imports — unit-testable.

export type ProjectLifecycleStatus =
  | "active"
  | "paused"
  | "on_hold"
  | "deactivated"
  | "completed"
  | "cancelled";

export const PROJECT_LIFECYCLE_STATUSES: ProjectLifecycleStatus[] = [
  "active",
  "paused",
  "on_hold",
  "deactivated",
  "completed",
  "cancelled",
];

const TERMINAL = new Set<ProjectLifecycleStatus>(["completed", "cancelled"]);

const PAUSE_STATES: ProjectLifecycleStatus[] = ["paused", "on_hold", "deactivated"];

export const PROJECT_STATUS_LABEL: Record<ProjectLifecycleStatus, string> = {
  active: "Active",
  paused: "Paused",
  on_hold: "On hold",
  deactivated: "Deactivated",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type StatusTone = "success" | "info" | "warning" | "neutral" | "error";

export const PROJECT_STATUS_TONE: Record<ProjectLifecycleStatus, StatusTone> = {
  active: "success",
  paused: "warning",
  on_hold: "warning",
  deactivated: "neutral",
  completed: "info",
  cancelled: "error",
};

export function isProjectLifecycleStatus(s: unknown): s is ProjectLifecycleStatus {
  return typeof s === "string" && (PROJECT_LIFECYCLE_STATUSES as string[]).includes(s);
}

export function asProjectLifecycleStatus(s: unknown): ProjectLifecycleStatus {
  return isProjectLifecycleStatus(s) ? s : "active";
}

export function isTerminalStatus(s: ProjectLifecycleStatus): boolean {
  return TERMINAL.has(s);
}

/** States that are "not actively worked" but still reversible. */
export function isPauseState(s: ProjectLifecycleStatus): boolean {
  return PAUSE_STATES.includes(s);
}

/** A project is "live" (counts toward quota) unless it is archived. */
export function isLiveProject(project: { status?: unknown; archived_at?: unknown }): boolean {
  return project.archived_at == null;
}

/** Allowed lifecycle transitions from a given status (action → next status). */
export function nextLifecycleOptions(s: ProjectLifecycleStatus): ProjectLifecycleStatus[] {
  switch (s) {
    case "active":
      return ["paused", "on_hold", "deactivated", "completed", "cancelled"];
    case "paused":
    case "on_hold":
    case "deactivated":
      return ["active", "completed", "cancelled"];
    case "completed":
    case "cancelled":
      return ["active"]; // reactivate
  }
}

export interface LifecycleAction {
  key: string;
  label: string;
  to: ProjectLifecycleStatus;
  tone: StatusTone;
}

/** Human-facing action list for the current status (archive/delete handled separately). */
export function lifecycleActions(status: ProjectLifecycleStatus): LifecycleAction[] {
  return nextLifecycleOptions(status).map((to) => ({
    key: `to-${to}`,
    label: PROJECT_STATUS_LABEL[to],
    to,
    tone: PROJECT_STATUS_TONE[to],
  }));
}

export function reactivateStatus(): ProjectLifecycleStatus {
  return "active";
}
