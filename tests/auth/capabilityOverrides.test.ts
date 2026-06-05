// SiteTrack Pro — capability override engine (migration 69) tests.

import { describe, it, expect } from "vitest";
import {
  applyOverrides, normalizeOverride, baseCapabilitiesFor,
  resolveCapabilities, can,
  type Capability, type CapabilityOverride, type AuthSession,
} from "@/auth";

const ov = (role: string, capability: string, mode: "grant" | "revoke", orgId: string | null = null): CapabilityOverride =>
  ({ role: role as never, capability: capability as never, mode, orgId });

describe("applyOverrides", () => {
  it("grant adds a capability not in the base set", () => {
    const base = new Set<Capability>(["activity:view"]);
    const out = applyOverrides(base, [ov("architect", "expense:approve", "grant")], "architect");
    expect(out.has("expense:approve")).toBe(true);
    expect(out.has("activity:view")).toBe(true);
  });

  it("revoke removes a capability from the base set", () => {
    const base = new Set<Capability>(["activity:view", "drawings:upload"]);
    const out = applyOverrides(base, [ov("architect", "drawings:upload", "revoke")], "architect");
    expect(out.has("drawings:upload")).toBe(false);
  });

  it("only applies overrides matching the identity role", () => {
    const base = new Set<Capability>(["activity:view"]);
    const out = applyOverrides(base, [ov("pm", "expense:approve", "grant")], "architect");
    expect(out.has("expense:approve")).toBe(false);
  });

  it("org-specific override wins over a global one for the same cap", () => {
    const base = new Set<Capability>([]);
    // global grants, org revokes → org wins (absent)
    const a = applyOverrides(base, [ov("architect", "po:create", "grant", null), ov("architect", "po:create", "revoke", "o-1")], "architect");
    expect(a.has("po:create")).toBe(false);
    // global revokes, org grants → org wins (present)
    const b = applyOverrides(new Set<Capability>(["po:create"]), [ov("architect", "po:create", "revoke", null), ov("architect", "po:create", "grant", "o-1")], "architect");
    expect(b.has("po:create")).toBe(true);
  });

  it("superadmin is immune — overrides never strip its caps", () => {
    const base = new Set<Capability>(["platform:impersonate", "project:create"]);
    const out = applyOverrides(base, [ov("superadmin", "platform:impersonate", "revoke")], "superadmin");
    expect(out.has("platform:impersonate")).toBe(true);
  });

  it("does not mutate the input set", () => {
    const base = new Set<Capability>(["activity:view"]);
    applyOverrides(base, [ov("architect", "activity:view", "revoke")], "architect");
    expect(base.has("activity:view")).toBe(true);
  });
});

describe("baseCapabilitiesFor", () => {
  it("architect gets identity drawing caps", () => {
    const caps = baseCapabilitiesFor("architect");
    expect(caps.has("drawings:upload")).toBe(true);
    expect(caps.has("project:create")).toBe(false);
  });
  it("site_engineer carries the DPR voice wedge", () => {
    const caps = baseCapabilitiesFor("site_engineer");
    expect(caps.has("dpr:submit")).toBe(true);
    expect(caps.has("voice:record")).toBe(true);
  });
  it("orgadmin gains project:create from the admin org tier", () => {
    expect(baseCapabilitiesFor("orgadmin").has("project:create")).toBe(true);
  });
  it("prospector is minimal (no elevated tier merged)", () => {
    const caps = baseCapabilitiesFor("prospector");
    expect(caps.has("project:create")).toBe(true);   // identity
    expect(caps.has("expense:approve")).toBe(false);
  });
});

describe("normalizeOverride", () => {
  it("normalizes a valid row", () => {
    const o = normalizeOverride({ org_id: "o-1", role: "architect", capability: "expense:approve", mode: "grant" });
    expect(o).toEqual({ orgId: "o-1", role: "architect", capability: "expense:approve", mode: "grant" });
  });
  it("treats null org_id as global", () => {
    expect(normalizeOverride({ org_id: null, role: "pm", capability: "dpr:view", mode: "revoke" })!.orgId).toBeNull();
  });
  it("rejects bad role / capability / mode / null", () => {
    expect(normalizeOverride(null)).toBeNull();
    expect(normalizeOverride({ role: "not-a-role", capability: "dpr:view", mode: "grant" })).toBeNull();
    expect(normalizeOverride({ role: "pm", capability: "not:a:cap", mode: "grant" })).toBeNull();
    expect(normalizeOverride({ role: "pm", capability: "dpr:view", mode: "sideways" })).toBeNull();
  });
});

describe("resolveCapabilities honours session overrides", () => {
  const session = (overrides: CapabilityOverride[]): AuthSession => ({
    user: { id: "u", email: "a@b", name: "x", identityRole: "architect", isStaff: false },
    orgs: [],
    activeOrgId: null,
    projectMemberships: [],
    capabilityOverrides: overrides,
  });

  it("a grant override makes can() true", () => {
    const s = session([ov("architect", "expense:approve", "grant")]);
    expect(can(s, "expense:approve")).toBe(true);
    const r = resolveCapabilities(s);
    expect(r.trace.overrideGrants).toContain("expense:approve");
  });

  it("a revoke override removes a base capability", () => {
    const s = session([ov("architect", "drawings:upload", "revoke")]);
    expect(can(s, "drawings:upload")).toBe(false);
    expect(resolveCapabilities(s).trace.overrideRevokes).toContain("drawings:upload");
  });

  it("no overrides → base behavior unchanged", () => {
    const s = session([]);
    expect(can(s, "drawings:upload")).toBe(true);
    expect(resolveCapabilities(s).trace.overrideGrants).toBeUndefined();
  });
});
