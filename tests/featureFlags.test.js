// SiteTrack Pro — Sprint 1 (Session 30.2) Feature Freeze tests.
//
// Verifies the freeze gate is bulletproof — non-staff users must not be
// able to see or navigate to any of the 16 frozen views, and the three
// staff-bypass paths (is_staff flag, role==superadmin, VITE_STAFF_EMAILS
// allowlist) all work correctly.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  STUB_VIEWS,
  STUB_TABS,
  PRIMARY_WORKFLOW,
  isStubView,
  isStubTab,
  isStaffUser,
  isViewStubBlocked,
  isTabStubBlocked,
} from "../src/lib/featureFlags.js";

describe("STUB_VIEWS source-of-truth", () => {
  it("is a Set with exactly 16 frozen views", () => {
    expect(STUB_VIEWS).toBeInstanceOf(Set);
    expect(STUB_VIEWS.size).toBe(16);
  });

  it("includes every RERA / GSTN / compliance surface", () => {
    expect(STUB_VIEWS.has("compliance")).toBe(true);
    expect(STUB_VIEWS.has("forecast")).toBe(true);
    expect(STUB_VIEWS.has("material-prices")).toBe(true);
    expect(STUB_VIEWS.has("ar-overlay")).toBe(true);
  });

  it("includes both labour + site wall kiosks", () => {
    expect(STUB_VIEWS.has("kiosk-labour")).toBe(true);
    expect(STUB_VIEWS.has("kiosk-site")).toBe(true);
  });

  it("includes all 10 broken-persistence admin/org surfaces", () => {
    const persistenceBroken = [
      "delegations",
      "snapshot",
      "admin-audit-log",
      "admin-branding",
      "org-templates",
      "org-approvals",
      "org-notifications",
      "org-integrations",
      "org-features",
      "org-onboarding",
    ];
    for (const id of persistenceBroken) {
      expect(STUB_VIEWS.has(id), `${id} should be in STUB_VIEWS`).toBe(true);
    }
  });

  it("does NOT include the dashboard, projects, or DPR placeholder", () => {
    // These are the surfaces non-staff users SHOULD see.
    expect(STUB_VIEWS.has("dashboard")).toBe(false);
    expect(STUB_VIEWS.has("projects")).toBe(false);
    expect(STUB_VIEWS.has("dpr")).toBe(false);
    expect(STUB_VIEWS.has("calendar")).toBe(false);
    expect(STUB_VIEWS.has("vendors")).toBe(false);
    expect(STUB_VIEWS.has("po")).toBe(false);
  });
});

describe("STUB_TABS", () => {
  it("freezes the AI insights tab (needs customer LLM key)", () => {
    expect(STUB_TABS.has("ai")).toBe(true);
  });

  it("does not freeze the everyday tabs", () => {
    for (const id of ["overview", "milestones", "tasks", "updates", "drawings", "rabills"]) {
      expect(STUB_TABS.has(id)).toBe(false);
    }
  });
});

describe("PRIMARY_WORKFLOW", () => {
  it("is the dpr placeholder (the ONE workflow surfaced in Sprint 1)", () => {
    expect(PRIMARY_WORKFLOW).toBe("dpr");
  });
});

describe("isStubView()", () => {
  it("returns true for every frozen view", () => {
    for (const id of STUB_VIEWS) {
      expect(isStubView(id), `${id} should be flagged stub`).toBe(true);
    }
  });

  it("returns false for un-frozen views", () => {
    for (const id of ["dashboard", "projects", "detail", "dpr", "help", "calendar"]) {
      expect(isStubView(id)).toBe(false);
    }
  });

  it("returns false for unknown view ids (defensive)", () => {
    expect(isStubView("nonexistent-view")).toBe(false);
    expect(isStubView("")).toBe(false);
    expect(isStubView(null)).toBe(false);
    expect(isStubView(undefined)).toBe(false);
  });
});

describe("isStubTab()", () => {
  it("returns true for ai tab", () => {
    expect(isStubTab("ai")).toBe(true);
  });
  it("returns false for everyday tabs", () => {
    expect(isStubTab("overview")).toBe(false);
    expect(isStubTab("rabills")).toBe(false);
  });
});

describe("isStaffUser() — three bypass paths", () => {
  // Vitest doesn't inherit import.meta.env from the host process; the
  // featureFlags.js module reads `import.meta.env.VITE_STAFF_EMAILS`
  // lazily inside the function, so we can set it via the test env.
  const originalEnv = { ...(import.meta.env || {}) };
  beforeEach(() => {
    // Clean slate per test
    if (typeof import.meta.env !== "undefined") {
      delete import.meta.env.VITE_STAFF_EMAILS;
    }
  });
  afterEach(() => {
    if (typeof import.meta.env !== "undefined") {
      Object.assign(import.meta.env, originalEnv);
    }
  });

  it("returns false for null / undefined / non-object user", () => {
    expect(isStaffUser(null)).toBe(false);
    expect(isStaffUser(undefined)).toBe(false);
    expect(isStaffUser("string")).toBe(false);
    expect(isStaffUser(123)).toBe(false);
  });

  it("returns false for a regular client user", () => {
    expect(isStaffUser({ id: "u1", role: "client", email: "rita@firm.in" })).toBe(false);
  });

  it("returns false for an orgadmin who is not flagged is_staff", () => {
    expect(isStaffUser({ id: "u2", role: "orgadmin", email: "mb@firm.in" })).toBe(false);
  });

  it("path 1 — returns true when user.is_staff === true", () => {
    expect(isStaffUser({ id: "u3", role: "client", email: "x@y.com", is_staff: true })).toBe(true);
  });

  it("path 1 — does NOT trigger when is_staff is a truthy non-boolean", () => {
    expect(isStaffUser({ id: "u4", role: "client", email: "x@y.com", is_staff: "yes" })).toBe(false);
    expect(isStaffUser({ id: "u5", role: "client", email: "x@y.com", is_staff: 1 })).toBe(false);
  });

  it("path 2 — returns true when role === 'superadmin'", () => {
    expect(isStaffUser({ id: "u6", role: "superadmin", email: "ops@sitetrack.in" })).toBe(true);
  });

  it("path 3 — returns true when email is in VITE_STAFF_EMAILS allowlist (case-insensitive)", () => {
    if (typeof import.meta.env === "undefined") return;
    import.meta.env.VITE_STAFF_EMAILS = "founder@sitetrack.in, ops@sitetrack.in";
    expect(isStaffUser({ id: "u7", role: "client", email: "founder@sitetrack.in" })).toBe(true);
    expect(isStaffUser({ id: "u8", role: "client", email: "FOUNDER@SITETRACK.IN" })).toBe(true);
    expect(isStaffUser({ id: "u9", role: "client", email: "  ops@sitetrack.in  " })).toBe(true);
  });

  it("path 3 — does NOT trigger for non-allowlisted email", () => {
    if (typeof import.meta.env === "undefined") return;
    import.meta.env.VITE_STAFF_EMAILS = "founder@sitetrack.in";
    expect(isStaffUser({ id: "u10", role: "client", email: "rando@firm.in" })).toBe(false);
  });

  it("path 3 — handles empty VITE_STAFF_EMAILS gracefully", () => {
    if (typeof import.meta.env === "undefined") return;
    import.meta.env.VITE_STAFF_EMAILS = "";
    expect(isStaffUser({ id: "u11", role: "client", email: "anyone@firm.in" })).toBe(false);
  });
});

describe("isViewStubBlocked() — the actual gate", () => {
  const regularUser = { id: "u1", role: "client", email: "rita@firm.in" };
  const staffUser = { id: "u2", role: "client", email: "x@y.com", is_staff: true };
  const superadmin = { id: "u3", role: "superadmin", email: "ops@sitetrack.in" };

  it("blocks every frozen view for a regular client user", () => {
    for (const id of STUB_VIEWS) {
      expect(isViewStubBlocked(regularUser, id), `${id} should block client`).toBe(true);
    }
  });

  it("blocks every frozen view for an orgadmin who is not staff", () => {
    const orgadmin = { id: "u4", role: "orgadmin", email: "ma@firm.in" };
    for (const id of STUB_VIEWS) {
      expect(isViewStubBlocked(orgadmin, id), `${id} should block orgadmin`).toBe(true);
    }
  });

  it("never blocks a frozen view for is_staff user", () => {
    for (const id of STUB_VIEWS) {
      expect(isViewStubBlocked(staffUser, id), `${id} should pass for staff`).toBe(false);
    }
  });

  it("never blocks a frozen view for superadmin", () => {
    for (const id of STUB_VIEWS) {
      expect(isViewStubBlocked(superadmin, id), `${id} should pass for superadmin`).toBe(false);
    }
  });

  it("never blocks an un-frozen view (dashboard, projects, dpr)", () => {
    for (const id of ["dashboard", "projects", "dpr", "help", "calendar"]) {
      expect(isViewStubBlocked(regularUser, id), `${id} must be reachable`).toBe(false);
    }
  });

  it("blocks frozen views even with null user (defensive — no staff bypass)", () => {
    expect(isViewStubBlocked(null, "compliance")).toBe(true);
    expect(isViewStubBlocked(undefined, "forecast")).toBe(true);
  });
});

describe("isTabStubBlocked()", () => {
  const regularUser = { id: "u1", role: "client", email: "rita@firm.in" };
  const staffUser = { id: "u2", role: "client", email: "x@y.com", is_staff: true };

  it("blocks the ai tab for non-staff", () => {
    expect(isTabStubBlocked(regularUser, "ai")).toBe(true);
  });

  it("passes the ai tab for staff", () => {
    expect(isTabStubBlocked(staffUser, "ai")).toBe(false);
  });

  it("never blocks a non-stub tab", () => {
    expect(isTabStubBlocked(regularUser, "overview")).toBe(false);
    expect(isTabStubBlocked(regularUser, "rabills")).toBe(false);
  });
});

describe("Sprint 1 contract — never-block list", () => {
  // These are the views the founder is actively SELLING in Sprint 1.
  // If a future refactor accidentally adds them to STUB_VIEWS, this
  // test will fire loudly so we catch the regression before deploy.
  const SPRINT_1_SOLD_VIEWS = [
    "dashboard",
    "projects",
    "detail",
    "create",
    "dpr",
    "help",
    "calendar",
    "vendors",
    "po",
    "analytics",
    "activity",
    "messages",
    "notifications",
  ];

  it("none of the Sprint 1 sold views are frozen", () => {
    for (const id of SPRINT_1_SOLD_VIEWS) {
      expect(isStubView(id), `${id} must remain visible to non-staff`).toBe(false);
    }
  });
});
