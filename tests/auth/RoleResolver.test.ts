// SiteTrack Pro — RoleResolver 3-axis composition tests.

import { describe, it, expect } from "vitest";
import { resolveCapabilities, can, decide, capabilitiesAnywhere } from "@/auth/RoleResolver";
import type { AuthSession } from "@/auth/types";

// Builder helpers
const sessionFor = (overrides: Partial<AuthSession>): AuthSession => ({
  user: {
    id: "u-1",
    email: "test@example.com",
    name: "Test User",
    identityRole: "architect",
    isStaff: false,
  },
  orgs: [],
  activeOrgId: null,
  projectMemberships: [],
  ...overrides,
});

describe("resolveCapabilities — identity tier only", () => {
  it("returns identity caps when no context provided", () => {
    const s = sessionFor({ user: { id: "u", email: "a@b", name: "x", identityRole: "client", isStaff: false } });
    const r = resolveCapabilities(s);
    expect(r.capabilities.has("dpr:view")).toBe(true);
    expect(r.capabilities.has("progress:edit")).toBe(false);
    expect(r.trace.fromIdentity).toContain("dpr:view");
    expect(r.trace.fromOrgAdmin).toBeUndefined();
    expect(r.trace.fromProjectTier).toBeUndefined();
  });
});

describe("resolveCapabilities — org tier composition", () => {
  it("adds org-tier caps when orgId matches a membership", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "demo", segment: null, isAdmin: true, joinedAt: "2026-01-01", status: "active" as const }],
    });
    const r = resolveCapabilities(s, { orgId: "o-1" });
    // architect identity does NOT have project:create, but admin org tier does
    expect(r.capabilities.has("project:create")).toBe(true);
    expect(r.trace.fromOrgAdmin).toContain("project:create");
  });

  it("ignores org-tier when orgId does NOT match", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "demo", segment: null, isAdmin: true, joinedAt: "2026-01-01", status: "active" as const }],
    });
    const r = resolveCapabilities(s, { orgId: "o-other" });
    expect(r.capabilities.has("project:create")).toBe(false);
    expect(r.trace.fromOrgAdmin).toBeUndefined();
  });
});

describe("resolveCapabilities — project tier composition", () => {
  it("adds project-tier caps when projectId matches an ACTIVE membership", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      projectMemberships: [{
        projectId: "p-1", projectName: "Vasavi", projectType: "construction",
        role: "site_engineer",
        assignedBy: "u-pm", assignedAt: "2026-01-01", removedAt: null,
      }],
    });
    const r = resolveCapabilities(s, { projectId: "p-1" });
    // architect identity does NOT have dpr:submit, but project tier as
    // site_engineer does.
    expect(r.capabilities.has("dpr:submit")).toBe(true);
    expect(r.capabilities.has("voice:record")).toBe(true);
    expect(r.trace.fromProjectTier).toContain("dpr:submit");
  });

  it("ignores REMOVED project memberships", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      projectMemberships: [{
        projectId: "p-1", projectName: "Old", projectType: "construction",
        role: "site_engineer",
        assignedBy: "u-pm", assignedAt: "2026-01-01", removedAt: "2026-02-01",
      }],
    });
    const r = resolveCapabilities(s, { projectId: "p-1" });
    expect(r.capabilities.has("dpr:submit")).toBe(false);
    expect(r.trace.fromProjectTier).toBeUndefined();
  });

  it("composes ALL three tiers when context includes orgId + projectId", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      orgs: [{ orgId: "o-1", orgName: "Demo", orgSlug: "demo", segment: null, isAdmin: true, joinedAt: "2026-01-01", status: "active" as const }],
      projectMemberships: [{
        projectId: "p-1", projectName: "Vasavi", projectType: "construction",
        role: "site_engineer",
        assignedBy: "u-pm", assignedAt: "2026-01-01", removedAt: null,
      }],
    });
    const r = resolveCapabilities(s, { orgId: "o-1", projectId: "p-1" });
    expect(r.capabilities.has("drawings:upload")).toBe(true);   // from architect identity
    expect(r.capabilities.has("project:create")).toBe(true);    // from admin org tier
    expect(r.capabilities.has("voice:record")).toBe(true);      // from site_engineer project tier
    expect(r.trace.fromIdentity.length).toBeGreaterThan(0);
    expect(r.trace.fromOrgAdmin!.length).toBeGreaterThan(0);
    expect(r.trace.fromProjectTier!.length).toBeGreaterThan(0);
  });
});

describe("Superadmin universal access", () => {
  it("superadmin identity grants every capability without org or project context", () => {
    const s = sessionFor({
      user: { id: "u", email: "rakesh@gigglezen.com", name: "R", identityRole: "superadmin", isStaff: true },
    });
    expect(can(s, "project:create")).toBe(true);
    expect(can(s, "platform:impersonate")).toBe(true);
    expect(can(s, "handover:generate")).toBe(true);
    expect(can(s, "dpr:submit")).toBe(true);
  });
});

describe("can() and decide()", () => {
  it("can() is a thin wrapper around resolveCapabilities", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "site_engineer", isStaff: false },
    });
    expect(can(s, "voice:record")).toBe(true);
    expect(can(s, "platform:impersonate")).toBe(false);
  });

  it("decide() returns reason when projectId missing membership", () => {
    const s = sessionFor({ user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false } });
    const d = decide(s, "voice:record", { projectId: "p-1" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Not assigned/);
  });

  it("decide() returns role-based reason when no membership context", () => {
    const s = sessionFor({ user: { id: "u", email: "a@b", name: "x", identityRole: "client", isStaff: false } });
    const d = decide(s, "progress:edit");
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/role \(client\)/);
  });

  it("decide() returns org-not-member reason", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      orgs: [],
    });
    const d = decide(s, "org:members:manage", { orgId: "o-x" });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Not a member of this organization/);
  });
});

describe("capabilitiesAnywhere", () => {
  it("aggregates every capability across all tiers + memberships", () => {
    const s = sessionFor({
      user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
      orgs: [
        { orgId: "o-1", orgName: "A", orgSlug: "a", segment: null, isAdmin: true, joinedAt: "2026-01-01", status: "active" as const },
        { orgId: "o-2", orgName: "B", orgSlug: "b", segment: null, isAdmin: false, joinedAt: "2026-01-01", status: "active" as const },
      ],
      projectMemberships: [
        { projectId: "p-1", projectName: "X", projectType: "construction", role: "site_engineer", assignedBy: null, assignedAt: "2026-01-01", removedAt: null },
        { projectId: "p-2", projectName: "Y", projectType: "interior", role: "pm", assignedBy: null, assignedAt: "2026-01-01", removedAt: null },
      ],
    });
    const all = capabilitiesAnywhere(s);
    expect(all.has("drawings:upload")).toBe(true);     // from architect identity
    expect(all.has("project:create")).toBe(true);      // from o-1 admin
    expect(all.has("dpr:submit")).toBe(true);          // from p-1 site_engineer
    expect(all.has("milestone:add")).toBe(true);       // from p-2 pm
  });
});
