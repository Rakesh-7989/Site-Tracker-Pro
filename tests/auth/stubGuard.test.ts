import { describe, it, expect } from "vitest";
import {
  STUB_VIEWS,
  isStubView,
  isStaffUser,
  isViewStubBlocked,
} from "@/lib/featureFlags";

describe("STUB_VIEWS catalog", () => {
  it("contains the 6 remaining stub view IDs (staff-only features)", () => {
    expect(STUB_VIEWS.size).toBe(6);
  });

  it("includes kiosk features (physical device access)", () => {
    expect(STUB_VIEWS.has("kiosk-labour")).toBe(true);
    expect(STUB_VIEWS.has("kiosk-site")).toBe(true);
    expect(STUB_VIEWS.has("ar-overlay")).toBe(true);
    expect(STUB_VIEWS.has("snapshot")).toBe(true);
  });

  it("includes staff-only admin features", () => {
    expect(STUB_VIEWS.has("admin-audit-log")).toBe(true);
    expect(STUB_VIEWS.has("admin-branding")).toBe(true);
  });

  it("does NOT include org admin features (now accessible via capability gate)", () => {
    expect(STUB_VIEWS.has("compliance")).toBe(false);
    expect(STUB_VIEWS.has("forecast")).toBe(false);
    expect(STUB_VIEWS.has("material-prices")).toBe(false);
    expect(STUB_VIEWS.has("delegations")).toBe(false);
    expect(STUB_VIEWS.has("org-templates")).toBe(false);
    expect(STUB_VIEWS.has("org-approvals")).toBe(false);
    expect(STUB_VIEWS.has("org-notifications")).toBe(false);
    expect(STUB_VIEWS.has("org-integrations")).toBe(false);
    expect(STUB_VIEWS.has("org-features")).toBe(false);
    expect(STUB_VIEWS.has("org-onboarding")).toBe(false);
  });

  it("does NOT include user-facing features (now publicly accessible to capable users)", () => {
    expect(STUB_VIEWS.has("compliance")).toBe(false);
  });
});

describe("isStubView", () => {
  it("returns true for remaining staff-only stub IDs", () => {
    expect(isStubView("kiosk-labour")).toBe(true);
    expect(isStubView("admin-audit-log")).toBe(true);
  });

  it("returns false for previously-stubbed features now activated", () => {
    expect(isStubView("forecast")).toBe(false);
    expect(isStubView("compliance")).toBe(false);
    expect(isStubView("delegations")).toBe(false);
  });

  it("returns false for non-stub IDs", () => {
    expect(isStubView("dashboard")).toBe(false);
    expect(isStubView("projects")).toBe(false);
    expect(isStubView("unknown")).toBe(false);
  });
});

describe("isStaffUser", () => {
  it("returns true for is_staff flag", () => {
    expect(isStaffUser({ is_staff: true })).toBe(true);
  });

  it("returns true for superadmin role", () => {
    expect(isStaffUser({ role: "superadmin", is_staff: false })).toBe(true);
  });

  it("returns false for regular users", () => {
    expect(isStaffUser({ is_staff: false, role: "orgadmin" })).toBe(false);
  });

  it("returns false for empty objects", () => {
    expect(isStaffUser({})).toBe(false);
  });

  it("returns false for null user input", () => {
    expect(isStaffUser(null as any)).toBe(false);
  });

  it("returns false for non-object user input", () => {
    expect(isStaffUser(undefined as any)).toBe(false);
  });
});

describe("isViewStubBlocked", () => {
  it("returns true for non-staff users on staff-only stub views", () => {
    const user = { is_staff: false, role: "orgadmin", email: "user@org.com" };
    expect(isViewStubBlocked(user, "kiosk-labour")).toBe(true);
    expect(isViewStubBlocked(user, "admin-audit-log")).toBe(true);
  });

  it("returns true for non-staff users on ar-overlay and snapshot", () => {
    const user = { is_staff: false, role: "orgadmin", email: "user@org.com" };
    expect(isViewStubBlocked(user, "ar-overlay")).toBe(true);
    expect(isViewStubBlocked(user, "snapshot")).toBe(true);
  });

  it("returns false for staff users on staff-only stub views", () => {
    const user = { is_staff: true, role: "orgadmin", email: "staff@org.com" };
    expect(isViewStubBlocked(user, "kiosk-labour")).toBe(false);
    expect(isViewStubBlocked(user, "admin-audit-log")).toBe(false);
  });

  it("returns false for non-staff on non-stub views", () => {
    const user = { is_staff: false, role: "orgadmin", email: "user@org.com" };
    expect(isViewStubBlocked(user, "dashboard")).toBe(false);
    expect(isViewStubBlocked(user, "forecast")).toBe(false);
    expect(isViewStubBlocked(user, "compliance")).toBe(false);
    expect(isViewStubBlocked(user, "delegations")).toBe(false);
  });

  it("returns false for all users on non-stub views", () => {
    expect(isViewStubBlocked({ is_staff: false, role: "client" }, "dashboard")).toBe(false);
  });
});