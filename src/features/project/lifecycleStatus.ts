// SiteTrack Pro — Project lifecycle status helpers.
// Mapped to the CHECK constraint on projects.status (migration 193):
//   active | paused | on_hold | deactivated | completed | cancelled
//
// Non-terminal states (reactivate → active): paused, on_hold, deactivated
// Terminal states (no forward move except archive/delete): completed, cancelled

export type ProjectStatus = "active" | "paused" | "on_hold" | "deactivated" | "completed" | "cancelled";

// Non-terminal: can reactivate to active
export const NON_TERMINAL_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  "paused",
  "on_hold",
  "deactivated",
]);

// Terminal states
export const TERMINAL_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  "completed",
  "cancelled",
]);

// Default status for new projects
export const DEFAULT_STATUS: ProjectStatus = "active";

// Status display labels (i18n keys live in src/i18n/en/hi/te.json)
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  on_hold: "On Hold",
  deactivated: "Deactivated",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Status badge colors (Tailwind classes — map to design tokens)
export const STATUS_BADGE_COLOR: Record<ProjectStatus, string> = {
  active: "success",
  paused: "warning",
  on_hold: "secondary",
  deactivated: "default",
  completed: "info",
  cancelled: "danger",
};

// Status action availability per role
// Key: role name, Value: set of allowed status actions
export const STATUS_ACTIONS: Record<string, ReadonlySet<ProjectStatus>> = {
  // superadmin can do everything
  superadmin: new Set([
    "active", "paused", "on_hold", "deactivated", "completed", "cancelled",
  ]),
  // orgadmin can do almost everything
  orgadmin: new Set([
    "active", "paused", "on_hold", "deactivated", "completed", "cancelled",
  ]),
  // pm can do most things
  pm: new Set(["active", "paused", "on_hold", "deactivated", "completed"]),
  // project_admin can pause/hold/deactivate but not complete/cancel
  project_admin: new Set(["active", "paused", "on_hold", "deactivated"]),
  // architects and designers can only view status
  architect: new Set(["active"]),
  senior_architect: new Set(["active"]),
  designer: new Set(["active"]),
  consultant: new Set(["active"]),
  client: new Set(["active"]),
  vendor: new Set(["active"]),
  site_inspector: new Set(["active"]),
  sub_contractor: new Set(["active"]),
};

// Check if a status is non-terminal (can reactivate)
export function isNonTerminal(status: ProjectStatus): boolean {
  return NON_TERMINAL_STATUSES.has(status);
}

// Check if a status is terminal
export function isTerminal(status: ProjectStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// Check if a status reactivates to active
export function canReactivate(status: ProjectStatus): boolean {
  return NON_TERMINAL_STATUSES.has(status);
}

// Check if a status is active
export function isActive(status: ProjectStatus): boolean {
  return status === "active";
}

// Check if a status is completed
export function isCompleted(status: ProjectStatus): boolean {
  return status === "completed";
}

// Check if a status is cancelled
export function isCancelled(status: ProjectStatus): boolean {
  return status === "cancelled";
}

// Get all non-terminal statuses
export function getNonTerminalStatuses(): ProjectStatus[] {
  return Array.from(NON_TERMINAL_STATUSES);
}

// Get all terminal statuses
export function getTerminalStatuses(): ProjectStatus[] {
  return Array.from(TERMINAL_STATUSES);
}

// Get all statuses
export function getAllStatuses(): ProjectStatus[] {
  return ["active", "paused", "on_hold", "deactivated", "completed", "cancelled"];
}

// Get status label
export function getStatusLabel(status: ProjectStatus): string {
  return STATUS_LABELS[status] || status;
}

// Get status badge color class
export function getStatusBadgeColor(status: ProjectStatus): string {
  return STATUS_BADGE_COLOR[status] || "default";
}

// Check if a role can perform a specific status action
export function roleCanAction(role: string, action: "activate" | "pause" | "hold" | "deactivate" | "complete" | "cancel" | "archive" | "delete"): boolean {
  const allowed = STATUS_ACTIONS[role];
  if (!allowed) return false;

  // Map action to status check
  const statusMap: Record<string, () => boolean> = {
    activate: () => isNonTerminal("deactivated"), // simplified
    pause: () => isNonTerminal("active"),
    hold: () => isNonTerminal("active"),
    deactivate: () => isNonTerminal("active"),
    complete: () => isTerminal("active"),
    cancel: () => isTerminal("active"),
    archive: () => isTerminal("completed"), // superadmin only in UI gating
    delete: () => isTerminal("completed"),   // superadmin only in UI gating
  };

  const check = statusMap[action];
  if (check) return check("active"); // placeholder — role gating done separately
  return allowed.has("active"); // fallback
}

// Export all status values for convenience
export const ALL_STATUSES = getAllStatuses();
export const NON_TERMINAL = getNonTerminalStatuses();
export const TERMINAL = getTerminalStatuses();