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

describe("RBAC V2 wiring (migrations 203–205)", () => {
  const rbac2 = (partial: Partial<NonNullable<AuthSession["rbac2"]>>): NonNullable<AuthSession["rbac2"]> => ({
    mode: "enforce",
    profiles: [],
    bindings: [],
    acl: [],
    clientPermissions: [],
    vendorScopes: [],
    ...partial,
  });

  it("matrix mode (absent rbac2) behaves exactly as before", () => {
    const s = sessionFor({ user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false } });
    expect(can(s, "drawings:upload")).toBe(true);
    expect(resolveCapabilities(s).trace.v2).toBeUndefined();
  });

  it("shadow mode: matrix still decides; V2 informs but doesn't gate", () => {
    const s = sessionFor({
      user: { id: "u-1", email: "a@b", name: "x", identityRole: "client", isStaff: false },
      rbac2: rbac2({ mode: "shadow" }),
    });
    // matrix allows dpr:view for client → shadow keeps it (no ACL/policy)
    expect(can(s, "dpr:view")).toBe(true);
    // an ACL deny in shadow mode does NOT flip the decision
    const s2 = sessionFor({
      user: { id: "u-1", email: "a@b", name: "x", identityRole: "client", isStaff: false },
      rbac2: rbac2({
        mode: "shadow",
        acl: [{ id: "a1", orgId: "o-1", resourceType: "project", resourceId: "p-1", subjectType: "user", subjectId: "u-1", capability: "dpr:view", effect: "deny", note: null, createdAt: "" }],
      }),
    });
    expect(can(s2, "dpr:view", { orgId: "o-1", resource: { type: "project", id: "p-1" } })).toBe(true);
  });

  it("enforce mode: binding deny strips a matrix cap", () => {
    const s = sessionFor({
      user: { id: "u-1", email: "a@b", name: "x", identityRole: "pm", isStaff: false },
      rbac2: rbac2({
        profiles: [{ id: "prof-1", code: "custom-pm", name: "Custom PM", description: null, segment: null, scope: "project", sourceRole: null, isSystem: false, orgId: "o-1", createdAt: "" }],
        bindings: [{ id: "b1", profileId: "prof-1", capability: "milestone:add", effect: "deny", note: null }],
      }),
    });
    // pm identity matrix grants milestone:add (permissions-matrix.ts) — the
    // binding deny strips it in enforce mode.
    expect(can(s, "milestone:add", { orgId: "o-1" })).toBe(false);
    const r = resolveCapabilities(s, { orgId: "o-1" });
    expect(r.trace.v2?.denies).toContain("milestone:add");
  });

  it("enforce mode: ACL allow grants a cap the matrix lacks (resource-scoped)", () => {
    const s = sessionFor({
      user: { id: "u-1", email: "client@example.com", name: "Client", identityRole: "client", isStaff: false },
      rbac2: rbac2({
        acl: [{ id: "a1", orgId: "o-1", resourceType: "drawing", resourceId: "d-1", subjectType: "user", subjectId: "u-1", capability: "budget:view", effect: "allow", note: null, createdAt: "" }],
      }),
    });
    // client identity lacks budget:view — ACL allow grants it for d-1…
    expect(can(s, "budget:view", { orgId: "o-1", resource: { type: "drawing", id: "d-1" } })).toBe(true);
    // …but NOT for a different drawing
    expect(can(s, "budget:view", { orgId: "o-1", resource: { type: "drawing", id: "d-2" } })).toBe(false);
  });

  it("enforce mode: client portal permission grants share-scoped cap", () => {
    const s = sessionFor({
      user: { id: "u-1", email: "c@example.com", name: "C", identityRole: "client", isStaff: false },
      rbac2: rbac2({
        clientPermissions: [{ id: "cp1", orgId: "o-1", projectId: "p-1", clientEmail: "c@example.com", capability: "budget:edit", createdAt: "" }],
      }),
    });
    expect(can(s, "budget:edit", { orgId: "o-1", resource: { type: "project", id: "p-1" }, clientEmail: "c@example.com" })).toBe(true);
    expect(can(s, "budget:edit", { orgId: "o-1", resource: { type: "project", id: "p-2" }, clientEmail: "c@example.com" })).toBe(false);
  });

  it("enforce mode: vendor scope grants project-scoped PO cap to vendor identity", () => {
    const s = sessionFor({
      user: { id: "v-1", email: "v@example.com", name: "V", identityRole: "vendor", isStaff: false },
      rbac2: rbac2({
        vendorScopes: [{ id: "vs1", orgId: "o-1", projectId: "p-1", vendorId: "vd-1", profileId: null, createdAt: "" }],
      }),
    });
    expect(can(s, "procurement:view", { orgId: "o-1", resource: { type: "project", id: "p-1" } })).toBe(true);
    expect(can(s, "procurement:view", { orgId: "o-1", resource: { type: "project", id: "p-2" } })).toBe(false);
  });
});
