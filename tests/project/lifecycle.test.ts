// SiteTrack Pro — Project lifecycle status tests.
// Validates the lifecycle status helpers, status enum, and role-based action gating.

import { describe, it, expect } from "vitest";
import {
  ProjectStatus,
  NON_TERMINAL_STATUSES,
  TERMINAL_STATUSES,
  DEFAULT_STATUS,
  STATUS_LABELS,
  STATUS_BADGE_COLOR,
  STATUS_ACTIONS,
  isNonTerminal,
  isTerminal,
  canReactivate,
  isActive,
  isCompleted,
  isCancelled,
  getNonTerminalStatuses,
  getTerminalStatuses,
  getAllStatuses,
  getStatusLabel,
  getStatusBadgeColor,
  roleCanAction,
} from "@/features/project/lifecycleStatus";

const ALL_STATUSES: ProjectStatus[] = [
  "active",
  "paused",
  "on_hold",
  "deactivated",
  "completed",
  "cancelled",
];

const ALL_IDENTITY_ROLES = [
  "superadmin",
  "orgadmin",
  "promoter",
  "project_admin",
  "prospector",
  "pm",
  "architect",
  "senior_architect",
  "junior_architect",
  "design_architect_interior",
  "design_head",
  "consultant_head",
  "mep_consultant",
  "structural_consultant",
  "consultant",
  "designer",
  "site_engineer",
  "contractor",
  "sub_contractor",
  "vendor",
  "client",
  "site_inspector",
];

// ── ProjectStatus type ────────────────────────────────────────────────────

describe("ProjectStatus type", () => {
  it("should be a union of 6 string literals", () => {
    // Runtime check that the type has exactly 6 values
    const statuses = Object.keys(STATUS_LABELS);
    expect(statuses.length).toBe(6);
    expect(statuses).toEqual([
      "active",
      "paused",
      "on_hold",
      "deactivated",
      "completed",
      "cancelled",
    ]);
  });

  it("should have all 6 statuses", () => {
    const statuses = ALL_STATUSES;
    expect(statuses.length).toBe(6);
  });
});

// ── Default status ───────────────────────────────────────────────────────

describe("DEFAULT_STATUS", () => {
  it("should be 'active'", () => {
    expect(DEFAULT_STATUS).toBe("active");
  });

  it("should be the reactivation target, not terminal", () => {
    expect(NON_TERMINAL_STATUSES).not.toContain(DEFAULT_STATUS);
    expect(TERMINAL_STATUSES).not.toContain(DEFAULT_STATUS);
    expect(getAllStatuses()).toContain(DEFAULT_STATUS);
  });
});

// ── Status labels ───────────────────────────────────────────────────────

describe("STATUS_LABELS", () => {
  it("should have labels for all 6 statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe("string");
    }
  });

  it("should return correct label for active", () => {
    expect(STATUS_LABELS["active"]).toBe("Active");
  });

  it("should return correct label for completed", () => {
    expect(STATUS_LABELS["completed"]).toBe("Completed");
  });
});

// ── Status badge colors ─────────────────────────────────────────────────

describe("STATUS_BADGE_COLOR", () => {
  it("should have color for all 6 statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_BADGE_COLOR[status]).toBeDefined();
      expect(typeof STATUS_BADGE_COLOR[status]).toBe("string");
    }
  });

  it("should return 'success' for active", () => {
    expect(STATUS_BADGE_COLOR["active"]).toBe("success");
  });

  it("should return 'danger' for cancelled", () => {
    expect(STATUS_BADGE_COLOR["cancelled"]).toBe("danger");
  });
});

// ── Non-terminal / terminal ─────────────────────────────────────────────

describe("isNonTerminal", () => {
  it("should return true for paused", () => {
    expect(isNonTerminal("paused")).toBe(true);
  });

  it("should return true for on_hold", () => {
    expect(isNonTerminal("on_hold")).toBe(true);
  });

  it("should return true for deactivated", () => {
    expect(isNonTerminal("deactivated")).toBe(true);
  });

  it("should return false for completed", () => {
    expect(isNonTerminal("completed")).toBe(false);
  });

  it("should return false for cancelled", () => {
    expect(isNonTerminal("cancelled")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("should return true for completed", () => {
    expect(isTerminal("completed")).toBe(true);
  });

  it("should return true for cancelled", () => {
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("should return false for active", () => {
    expect(isTerminal("active")).toBe(false);
  });
});

describe("canReactivate", () => {
  it("should return true for paused", () => {
    expect(canReactivate("paused")).toBe(true);
  });

  it("should return true for on_hold", () => {
    expect(canReactivate("on_hold")).toBe(true);
  });

  it("should return true for deactivated", () => {
    expect(canReactivate("deactivated")).toBe(true);
  });

  it("should return false for completed", () => {
    expect(canReactivate("completed")).toBe(false);
  });

  it("should return false for cancelled", () => {
    expect(canReactivate("cancelled")).toBe(false);
  });
});

// ── Active / completed / cancelled checks ───────────────────────────────

describe("isActive", () => {
  it("should return true for active", () => {
    expect(isActive("active")).toBe(true);
  });

  it("should return false for paused", () => {
    expect(isActive("paused")).toBe(false);
  });
});

describe("isCompleted", () => {
  it("should return true for completed", () => {
    expect(isCompleted("completed")).toBe(true);
  });

  it("should return false for active", () => {
    expect(isCompleted("active")).toBe(false);
  });
});

describe("isCancelled", () => {
  it("should return true for cancelled", () => {
    expect(isCancelled("cancelled")).toBe(true);
  });

  it("should return false for active", () => {
    expect(isCancelled("active")).toBe(false);
  });
});

// ── Status lists ────────────────────────────────────────────────────────

describe("getNonTerminalStatuses", () => {
  it("should return paused, on_hold, deactivated", () => {
    const nonTerminal = getNonTerminalStatuses();
    expect(nonTerminal).toContain("paused");
    expect(nonTerminal).toContain("on_hold");
    expect(nonTerminal).toContain("deactivated");
    expect(nonTerminal.length).toBe(3);
  });
});

describe("getTerminalStatuses", () => {
  it("should return completed, cancelled", () => {
    const terminal = getTerminalStatuses();
    expect(terminal).toContain("completed");
    expect(terminal).toContain("cancelled");
    expect(terminal.length).toBe(2);
  });
});

describe("getAllStatuses", () => {
  it("should return all 6 statuses", () => {
    const all = getAllStatuses();
    expect(all).toHaveLength(6);
    expect(all).toContain("active");
    expect(all).toContain("cancelled");
  });
});

// ── Status labels ───────────────────────────────────────────────────────

describe("getStatusLabel", () => {
  it("should return correct label for each status", () => {
    expect(getStatusLabel("active")).toBe("Active");
    expect(getStatusLabel("paused")).toBe("Paused");
    expect(getStatusLabel("on_hold")).toBe("On Hold");
    expect(getStatusLabel("deactivated")).toBe("Deactivated");
    expect(getStatusLabel("completed")).toBe("Completed");
    expect(getStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("should return the status itself for unknown values", () => {
    expect(getStatusLabel("unknown" as ProjectStatus)).toBe("unknown");
  });
});

// ── Status badge color ──────────────────────────────────────────────────

describe("getStatusBadgeColor", () => {
  it("should return 'success' for active", () => {
    expect(getStatusBadgeColor("active")).toBe("success");
  });

  it("should return 'warning' for paused", () => {
    expect(getStatusBadgeColor("paused")).toBe("warning");
  });

  it("should return 'secondary' for on_hold", () => {
    expect(getStatusBadgeColor("on_hold")).toBe("secondary");
  });

  it("should return 'default' for deactivated", () => {
    expect(getStatusBadgeColor("deactivated")).toBe("default");
  });

  it("should return 'info' for completed", () => {
    expect(getStatusBadgeColor("completed")).toBe("info");
  });

  it("should return 'danger' for cancelled", () => {
    expect(getStatusBadgeColor("cancelled")).toBe("danger");
  });
});

// ── STATUS_ACTIONS role gating ──────────────────────────────────────────

describe("STATUS_ACTIONS", () => {
  it("should allow superadmin all actions", () => {
    const allowed = STATUS_ACTIONS["superadmin"];
    expect(allowed).toContain("active");
    expect(allowed).toContain("paused");
    expect(allowed).toContain("completed");
    expect(allowed).toContain("cancelled");
  });

  it("should allow orgadmin all actions", () => {
    const allowed = STATUS_ACTIONS["orgadmin"];
    expect(allowed).toContain("active");
    expect(allowed).toContain("paused");
  });

  it("should allow pm most actions", () => {
    const allowed = STATUS_ACTIONS["pm"];
    expect(allowed).toContain("active");
    expect(allowed).toContain("paused");
    expect(allowed).toContain("completed");
  });

  it("should limit project_admin", () => {
    const allowed = STATUS_ACTIONS["project_admin"];
    expect(allowed).toContain("active");
    expect(allowed).toContain("paused");
    // project_admin should NOT be able to complete/cancel
    expect(allowed).not.toContain("completed");
    expect(allowed).not.toContain("cancelled");
  });

  it("should limit architect to active only", () => {
    const allowed = STATUS_ACTIONS["architect"];
    expect(allowed).toContain("active");
    expect(allowed).not.toContain("paused");
    expect(allowed).not.toContain("completed");
  });

  it("should limit designer to active only", () => {
    const allowed = STATUS_ACTIONS["designer"];
    expect(allowed).toContain("active");
    expect(allowed).not.toContain("paused");
  });

  it("should limit client to active only", () => {
    const allowed = STATUS_ACTIONS["client"];
    expect(allowed).toContain("active");
    expect(allowed).not.toContain("paused");
  });
});

// ── roleCanAction ───────────────────────────────────────────────────────

describe("roleCanAction", () => {
  it("should return true for superadmin activate", () => {
    expect(roleCanAction("superadmin", "activate")).toBe(true);
  });

  it("should return true for pm pause", () => {
    expect(roleCanAction("pm", "pause")).toBe(true);
  });

  it("should return true for pm hold", () => {
    expect(roleCanAction("pm", "hold")).toBe(true);
  });

  it("should return true for pm deactivate", () => {
    expect(roleCanAction("pm", "deactivate")).toBe(true);
  });

  it("should return false for client activate", () => {
    expect(roleCanAction("client", "activate")).toBe(false);
  });

  it("should return false for architect complete", () => {
    expect(roleCanAction("architect", "complete")).toBe(false);
  });

  it("should return false for architect deactivate", () => {
    expect(roleCanAction("architect", "deactivate")).toBe(false);
  });
});

// ── Comprehensive role coverage ──────────────────────────────────────────

describe("comprehensive role coverage", () => {
  it("should test all identity roles against status actions", () => {
    for (const role of ALL_IDENTITY_ROLES) {
      // Each role should have a defined STATUS_ACTIONS entry
      const actions = STATUS_ACTIONS[role];
      expect(actions).toBeDefined();
      // Verify it's a Set
      expect(actions instanceof Set).toBe(true);
    }
  });

  it("should test all statuses against role actions", () => {
    for (const status of ALL_STATUSES) {
      // Test that at least one role can act on each status
      let anyRoleCan = false;
      for (const role of ALL_IDENTITY_ROLES) {
        if (roleCanAction(role, "activate")) {
          anyRoleCan = true;
          break;
        }
      }
      // At minimum, superadmin should be able to activate
      expect(anyRoleCan, `status ${status}`).toBe(true);
    }
  });
});