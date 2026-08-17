// RBAC V2 pure decision-logic tests (src/auth/rbac2/resolver.ts + queries.ts).

import { describe, expect, it } from "vitest";
import type { Capability } from "@/auth/capabilities";
import {
  aclDecision,
  assignedProfileCapabilities,
  assignedProfileDenies,
  composeV2Caps,
  decideV2,
  profileCapabilities,
} from "@/auth/rbac2/resolver";
import {
  auditSummary,
  normalizeAclEntry,
  normalizeCatalogEntry,
  normalizeRoleProfile,
  normalizeProfileBinding,
} from "@/auth/rbac2/queries";
import type {
  ProfileBinding,
  Rbac2Context,
  ResourceAclEntry,
  RoleProfile,
} from "@/auth/rbac2/types";

const p = (id: string, code: string, sourceRole?: string, isSystem = true): RoleProfile => ({
  id,
  code,
  name: code,
  description: null,
  segment: "construction",
  scope: "project",
  sourceRole: (sourceRole as any) ?? null,
  isSystem,
  orgId: null,
  createdAt: "",
});

const b = (profileId: string, capability: Capability, effect: "allow" | "deny" = "allow"): ProfileBinding => ({
  id: `${profileId}-${capability}`,
  profileId,
  capability,
  effect,
  note: null,
});

const acl = (partial: Partial<ResourceAclEntry>): ResourceAclEntry => ({
  id: partial.id ?? "acl-1",
  orgId: partial.orgId ?? "org-1",
  resourceType: partial.resourceType ?? "project",
  resourceId: partial.resourceId ?? "proj-1",
  subjectType: partial.subjectType ?? "user",
  subjectId: partial.subjectId ?? "user-1",
  capability: partial.capability ?? "drawing:approve",
  effect: partial.effect ?? "allow",
  note: null,
  createdAt: "",
});

const ctx = (partial: Partial<Rbac2Context> = {}): Rbac2Context => ({
  mode: "enforce",
  profiles: [],
  bindings: [],
  acl: [],
  clientPermissions: [],
  vendorScopes: [],
  ...partial,
});

describe("profileCapabilities", () => {
  it("seeds from source_role identity caps + applies allow/deny bindings", () => {
    const caps = profileCapabilities(p("p1", "drafter", "junior_architect"), [
      b("p1", "drawings:upload"),
      b("p1", "drawings:release", "deny"),
    ]);
    expect(caps.has("drawings:upload")).toBe(true);
    expect(caps.has("drawings:release")).toBe(false);
  });

  it("org-created profile (no source_role) starts empty and only binds add", () => {
    const caps = profileCapabilities(p("p2", "custom", undefined, false), [b("p2", "material:add")]);
    expect(caps.size).toBe(1);
    expect(caps.has("material:add")).toBe(true);
  });

  it("deny strips a matrix base cap", () => {
    const caps = profileCapabilities(p("p3", "pm", "pm"), [b("p3", "time:approve", "deny")]);
    expect(caps.has("time:approve")).toBe(false);
  });
});

describe("assignedProfileCapabilities / assignedProfileDenies", () => {
  it("unions multiple profiles and honors deny precedence", () => {
    const profiles = [p("p1", "a", "architect"), p("p2", "b", "designer")];
    const bindings = [
      b("p1", "drawings:upload", "deny"),
      b("p2", "drawings:upload", "allow"),
      b("p2", "export:pdf", "allow"),
    ];
    const caps = assignedProfileCapabilities(profiles, bindings);
    // deny wins in the deny set; the union still adds via the allow binding
    const denies = assignedProfileDenies(profiles, bindings);
    expect(denies.has("drawings:upload")).toBe(true);
    expect(caps.has("export:pdf")).toBe(true);
    // p1's base has drawings:upload but binding denies it; p2 re-allows it
    expect(caps.has("drawings:upload")).toBe(true);
  });
});

describe("aclDecision", () => {
  const entries = [
    acl({ capability: "drawing:approve", subjectType: "user", subjectId: "user-1", effect: "allow" }),
    acl({ capability: "drawing:approve", subjectType: "user", subjectId: "user-1", effect: "deny", resourceId: "proj-9" }),
  ];
  it("allow matches this user on this resource", () => {
    const d = aclDecision(entries, "drawing:approve", { userId: "user-1", identityRole: "client" }, { type: "project", id: "proj-1" });
    expect(d.allowed).toBe(true);
    expect(d.denied).toBe(false);
  });
  it("deny wins over allow for a matching resource", () => {
    const d = aclDecision(entries, "drawing:approve", { userId: "user-1", identityRole: "client" }, { type: "project", id: "proj-9" });
    expect(d.denied).toBe(true);
    expect(d.allowed).toBe(false); // the proj-1 allow entry doesn't apply here
  });
  it("resource-scoped entries are ignored for non-matching resources", () => {
    const d = aclDecision(entries, "drawing:approve", { userId: "user-2", identityRole: "client" }, { type: "project", id: "proj-1" });
    expect(d.allowed).toBe(false);
  });
  it("identity_role + org_tier subject matching", () => {
    const e = [
      acl({ capability: "budget:edit", resourceType: "org", resourceId: "org-1", subjectType: "identity_role", subjectId: "orgadmin", effect: "allow" }),
      acl({ capability: "budget:edit", resourceType: "org", resourceId: "org-1", subjectType: "org_tier", subjectId: "admin", effect: "allow" }),
    ];
    const d = aclDecision(e, "budget:edit", { userId: "u", identityRole: "orgadmin", orgTier: "admin" }, { type: "org", id: "org-1" });
    expect(d.allowed).toBe(true);
  });
});

describe("decideV2 layered order", () => {
  const base = { capability: "drawing:approve" as Capability, isSuperadmin: false, userId: "user-1", identityRole: "client" };

  it("superadmin always allows", () => {
    const d = decideV2({ ...base, matrixAllowed: false, isSuperadmin: true, ctx: ctx() });
    expect(d).toEqual({ allowed: true, reason: "superadmin", capability: base.capability });
  });

  it("binding deny beats matrix allow", () => {
    const profiles = [p("p1", "drafter", "architect")];
    const d = decideV2({
      ...base,
      matrixAllowed: true,
      ctx: ctx({ profiles, bindings: [b("p1", "drawing:approve", "deny")] }),
    });
    expect(d.reason).toBe("binding-deny");
    expect(d.allowed).toBe(false);
  });

  it("acl deny beats everything (SoD)", () => {
    const d = decideV2({
      ...base,
      matrixAllowed: true,
      ctx: ctx({ acl: [acl({ capability: "drawing:approve", effect: "deny", subjectId: "user-1" })] }),
      resource: { type: "project", id: "proj-1" },
    });
    expect(d.reason).toBe("acl-deny");
    expect(d.allowed).toBe(false);
  });

  it("acl allow grants a cap the matrix lacks", () => {
    const d = decideV2({
      ...base,
      matrixAllowed: false,
      ctx: ctx({ acl: [acl({ capability: "drawing:approve", effect: "allow", subjectId: "user-1" })] }),
      resource: { type: "project", id: "proj-1" },
    });
    expect(d.reason).toBe("acl-allow");
    expect(d.allowed).toBe(true);
  });

  it("binding allow grants a cap the matrix lacks", () => {
    const profiles = [p("p1", "custom", undefined, false)];
    const d = decideV2({
      ...base,
      matrixAllowed: false,
      ctx: ctx({ profiles, bindings: [b("p1", "drawing:approve")] }),
    });
    expect(d.reason).toBe("binding-allow");
    expect(d.allowed).toBe(true);
  });

  it("client permission grants a share-scoped cap", () => {
    const d = decideV2({
      ...base,
      matrixAllowed: false,
      ctx: ctx({ clientPermissions: [{ id: "cp1", orgId: "org-1", projectId: "proj-1", clientEmail: "c@x.com", capability: "drawing:approve", createdAt: "" }] }),
      resource: { type: "project", id: "proj-1" },
      clientEmail: "c@x.com",
    });
    expect(d.reason).toBe("client");
    expect(d.allowed).toBe(true);
  });

  it("vendor scope grants project-scoped vendor caps only", () => {
    const d = decideV2({
      capability: "po:create",
      matrixAllowed: false,
      isSuperadmin: false,
      userId: "v-1",
      identityRole: "vendor",
      ctx: ctx({ vendorScopes: [{ id: "vs1", orgId: "org-1", projectId: "proj-1", vendorId: "vd-1", profileId: null, createdAt: "" }] }),
      resource: { type: "project", id: "proj-1" },
    });
    expect(d.reason).toBe("vendor");
    expect(d.allowed).toBe(true);
  });

  it("matrix fallback when nothing else matches", () => {
    const d = decideV2({ ...base, matrixAllowed: true, ctx: ctx() });
    expect(d.reason).toBe("matrix");
    expect(d.allowed).toBe(true);
  });
});

describe("composeV2Caps enforce mode", () => {
  it("strips binding/ACL denies and adds profile/ACL allows", () => {
    const profiles = [p("p1", "drafter", "junior_architect")];
    const out = composeV2Caps({
      matrix: new Set<Capability>(["drawing:approve", "budget:view"]),
      ctx: ctx({
        profiles,
        bindings: [b("p1", "drawings:release", "deny"), b("p1", "export:pdf")],
        acl: [acl({ capability: "material:add", effect: "allow", subjectId: "user-1" })],
      }),
      userId: "user-1",
      identityRole: "client",
      resource: { type: "project", id: "proj-1" },
    });
    expect(out.has("budget:view")).toBe(true); // untouched matrix cap
    expect(out.has("export:pdf")).toBe(true);  // binding-allow add
    expect(out.has("material:add")).toBe(true); // acl-allow add
    expect(out.has("drawing:approve")).toBe(true); // not denied → kept
  });
});

describe("query normalizers", () => {
  it("normalizeCatalogEntry", () => {
    expect(normalizeCatalogEntry({ id: "project:create", domain: "project", label: "project:create" })).toEqual({
      id: "project:create",
      domain: "project",
      label: "project:create",
      description: null,
      isActive: true,
    });
    expect(normalizeCatalogEntry({ id: "bogus:cap" })).toBeNull();
  });

  it("normalizeRoleProfile coerces source_role + system flags", () => {
    const rp = normalizeRoleProfile({ id: "1", code: "drafter", name: "Drafter", is_system: true, source_role: "junior_architect", scope: "project", org_id: null, created_at: "x" });
    expect(rp?.sourceRole).toBe("junior_architect");
    expect(rp?.isSystem).toBe(true);
    const bad = normalizeRoleProfile({ id: "2", code: "x", source_role: "bogus" });
    expect(bad?.sourceRole).toBeNull();
  });

  it("normalizeProfileBinding drops unknown capabilities", () => {
    expect(normalizeProfileBinding({ id: "1", profile_id: "p", capability: "nope:thing" })).toBeNull();
    expect(normalizeProfileBinding({ id: "1", profile_id: "p", capability: "material:add", effect: "deny" })?.effect).toBe("deny");
  });

  it("normalizeAclEntry", () => {
    const e = normalizeAclEntry({ id: "1", org_id: "o", resource_type: "project", resource_id: "p", subject_type: "org_tier", subject_id: "admin", capability: "budget:edit", effect: "allow", created_at: "" });
    expect(e?.subjectType).toBe("org_tier");
    expect(e?.capability).toBe("budget:edit");
  });
});

describe("auditSummary", () => {
  it("rolls up totals / allow-denies / byReason / byMode", () => {
    const events = [
      { id: "1", actorId: null, orgId: "o", projectId: null, resourceType: null, resourceId: null, capability: "po:create" as Capability, effect: "allow" as const, mode: "enforce", reason: "matrix", createdAt: "" },
      { id: "2", actorId: null, orgId: "o", projectId: null, resourceType: null, resourceId: null, capability: "po:create" as Capability, effect: "deny" as const, mode: "shadow", reason: "acl-deny", createdAt: "" },
    ];
    const s = auditSummary(events);
    expect(s.total).toBe(2);
    expect(s.allows).toBe(1);
    expect(s.denies).toBe(1);
    expect(s.byReason).toEqual({ matrix: 1, "acl-deny": 1 });
    expect(s.byMode).toEqual({ enforce: 1, shadow: 1 });
  });
});