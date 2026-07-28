// SiteTrack Pro — org People module queries (migration 71) tests.

import { describe, it, expect } from "vitest";
import {
  listOrgMembers, lookupUserForInvite, addOrgMember,
  deactivateMember, assignCustomRole, unassignCustomRole, inviteNewOrgMember,
} from "@/app/orgMemberQueries";

// Minimal chainable mock: every builder method returns the same thenable that
// resolves to `result`; .rpc() returns from the rpc map.
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ["update", "delete", "eq", "insert", "select", "is"]) chain[m] = () => chain;
  chain.upsert = () => Promise.resolve(result);
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}
function mockClient(opts: { rpc?: Record<string, { data?: unknown; error?: unknown }>; table?: { data?: unknown; error?: unknown }; invoke?: { data?: unknown; error?: unknown } }) {
  return {
    rpc: async (name: string) => opts.rpc?.[name] ?? { data: [], error: null },
    from: () => makeChain(opts.table ?? { error: null }),
    functions: { invoke: async () => opts.invoke ?? { data: { ok: true }, error: null } },
  };
}

describe("listOrgMembers", () => {
  it("maps RPC rows to member rows (active flag + custom-role labels)", async () => {
    const c = mockClient({ rpc: { list_org_members: { data: [
      { profile_id: "p1", name: "Ramesh", identity_role: "site_engineer", org_role: "architect", joined_at: "2026-06-01", removed_at: null, custom_roles: ["Site Lead"] },
      { profile_id: "p2", name: "Old Guy", identity_role: "pm", org_role: "pm", joined_at: "2026-01-01", removed_at: "2026-05-01", custom_roles: [] },
    ], error: null } } });
    const r = await listOrgMembers(c, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data[0]).toMatchObject({ profileId: "p1", name: "Ramesh", active: true, customRoles: ["Site Lead"] });
      expect(r.data[1].active).toBe(false);
    }
  });

  it("surfaces an RPC error", async () => {
    const c = mockClient({ rpc: { list_org_members: { data: null, error: { message: "denied" } } } });
    const r = await listOrgMembers(c, "o-1");
    expect(r).toEqual({ ok: false, error: "denied" });
  });
});

describe("lookupUserForInvite", () => {
  it("returns a candidate when found", async () => {
    const c = mockClient({ rpc: { lookup_user_for_invite: { data: [{ profile_id: "p9", name: "Anita", identity_role: "architect" }], error: null } } });
    const r = await lookupUserForInvite(c, "anita@x.com");
    expect(r.ok && r.data).toMatchObject({ profileId: "p9", name: "Anita" });
  });
  it("returns null when no account", async () => {
    const c = mockClient({ rpc: { lookup_user_for_invite: { data: [], error: null } } });
    const r = await lookupUserForInvite(c, "nobody@x.com");
    expect(r).toEqual({ ok: true, data: null });
  });
});

describe("mutations return ok on success", () => {
  it("addOrgMember upserts", async () => {
    const r = await addOrgMember(mockClient({ table: { error: null } }), { orgId: "o", profileId: "p" });
    expect(r.ok).toBe(true);
  });
  it("deactivateMember updates", async () => {
    const r = await deactivateMember(mockClient({ table: { error: null } }), "o", "p");
    expect(r.ok).toBe(true);
  });
  it("assign / unassign custom role", async () => {
    const a = await assignCustomRole(mockClient({ table: { error: null } }), { orgId: "o", profileId: "p", orgRoleId: "r", assignedBy: "admin" });
    const u = await unassignCustomRole(mockClient({ table: { error: null } }), { orgId: "o", profileId: "p", orgRoleId: "r" });
    expect(a.ok && u.ok).toBe(true);
  });
  it("surfaces a write error", async () => {
    const r = await deactivateMember(mockClient({ table: { error: { message: "rls" } } }), "o", "p");
    expect(r).toEqual({ ok: false, error: "rls" });
  });
});

describe("inviteNewOrgMember (Edge Function)", () => {
  it("ok when the function succeeds", async () => {
    const r = await inviteNewOrgMember(mockClient({ invoke: { data: { ok: true, invited: true }, error: null } }), { orgId: "o", email: "new@x.com", identityRole: "architect" });
    expect(r.ok).toBe(true);
  });
  it("surfaces the function's structured failure", async () => {
    const r = await inviteNewOrgMember(mockClient({ invoke: { data: { ok: false, message: "This email already has an account — use Find to add them." }, error: null } }), { orgId: "o", email: "x@x.com", identityRole: "pm" });
    expect(r).toEqual({ ok: false, error: "This email already has an account — use Find to add them." });
  });
});
