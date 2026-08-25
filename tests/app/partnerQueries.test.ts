// SiteTrack Pro - cross-org partner queries (C1) tests.

import { describe, it, expect } from "vitest";
import {
  listProjectPartners,
  invitePartnerOrg,
  revokePartnerOrg,
  acceptProjectPartnerInvite,
  listSharedPartnerProjects,
  newInviteCode,
  PARTNER_SCOPE_LABEL,
  PARTNER_STATUS_LABEL,
} from "@/app/partnerQueries";
import type { TypedSupabaseClient } from "@/lib/db";

const asTyped = (c: unknown): TypedSupabaseClient => c as unknown as TypedSupabaseClient;

type RecordedCall = [string, ...unknown[]];
type Recorder = { calls: RecordedCall[] };

function chain(result: { data?: unknown; error?: unknown; rpc?: unknown }, recorder?: { calls: RecordedCall[] }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in", "insert", "update", "delete", "single"]) {
    c[m] = (...args: unknown[]) => {
      recorder?.calls.push([m, ...args]);
      return c;
    };
  }
  if (result.rpc !== undefined) c.rpc = (_name: unknown, _args: unknown) => Promise.resolve({ data: result.rpc, error: null });
  else c.rpc = (_name: unknown, _args: unknown) => Promise.resolve({ data: null, error: null });
  c.then = (resolve: (v: unknown) => unknown) => resolve(Promise.resolve(result));
  return c;
}

const mockClient = (
  tableResults: Record<string, { data?: unknown; error?: unknown; rpc?: unknown }>,
  recorder?: { calls: RecordedCall[] },
) => ({
  from: (table: string) => chain(tableResults[table] ?? {}, recorder),
  rpc: (name: string, args: unknown) => {
    const r = Object.values(tableResults).find(t => t.rpc !== undefined);
    void name;
    void args;
    return Promise.resolve({ data: r?.rpc ?? null, error: r?.error ?? null }) as never;
  },
});

describe("newInviteCode", () => {
  it("produces the st- prefixed 20-char shape and strips dashes", () => {
    const code = newInviteCode(() => "abcd-1234-efgh-5678-ijkl");
    expect(code).toBe("st-abcd1234efgh5678ijkl");
    expect(code.startsWith("st-")).toBe(true);
  });
});

describe("label maps", () => {
  it("covers every scope/status", () => {
    expect(Object.keys(PARTNER_SCOPE_LABEL)).toEqual(["viewer", "contributor", "manager"]);
    expect(Object.keys(PARTNER_STATUS_LABEL)).toEqual(["invited", "active", "revoked"]);
  });
});

describe("listProjectPartners", () => {
  it("maps rows incl. unbound invites (null org)", async () => {
    const c = mockClient({
      project_partner_orgs: {
        data: [
          { id: "l1", project_id: "p1", org_id: "o1", org_name_snapshot: "Acme Architects", scope: "manager", status: "active", invite_code: null, invited_at: "2026-08-25T00:00:00Z", accepted_at: "2026-08-26T00:00:00Z" },
          { id: "l2", project_id: "p1", org_id: null, org_name_snapshot: null, scope: "viewer", status: "invited", invite_code: "st-x", invited_at: "2026-08-25T01:00:00Z", accepted_at: null },
        ],
      },
    });
    const rows = await listProjectPartners(asTyped(c), "p1");
    expect(rows[0]).toMatchObject({ orgName: "Acme Architects", scope: "manager", status: "active" });
    expect(rows[1]).toMatchObject({ orgId: null, orgName: null, status: "invited", inviteCode: "st-x" });
  });

  it("throws surfaced errors", async () => {
    const c = mockClient({ project_partner_orgs: { data: null, error: { message: "denied" } } });
    await expect(listProjectPartners(asTyped(c), "p1")).rejects.toThrow("denied");
  });
});

describe("invitePartnerOrg", () => {
  it("inserts an UNBOUND pending link carrying the generated code", async () => {
    const rec: Recorder = { calls: [] };
    const c = mockClient(
      { project_partner_orgs: { data: { id: "l1", project_id: "p1", org_id: null, org_name_snapshot: null, scope: "viewer", status: "invited", invite_code: "st-code1", invited_at: "now", accepted_at: null } } },
      rec,
    );
    const res = await invitePartnerOrg(asTyped(c), { projectId: "p1", scope: "viewer" });
    expect(res.ok).toBe(true);
    const insertCall = rec.calls.find(x => x[0] === "insert");
    const body = insertCall?.[1] as Record<string, unknown>;
    expect(body.project_id).toBe("p1");
    expect(body.org_id).toBeNull();
    expect(body.status).toBe("invited");
    expect(String(body.invite_code)).toMatch(/^st-/);
  });

  it("surfaces insert errors", async () => {
    const c = mockClient({ project_partner_orgs: { data: null, error: { message: "dup scope" } } });
    const res = await invitePartnerOrg(asTyped(c), { projectId: "p1", scope: "viewer" });
    expect(res).toEqual({ ok: false, error: "dup scope" });
  });
});

describe("revokePartnerOrg", () => {
  it("deletes by id and surfaces errors", async () => {
    const okC = mockClient({ project_partner_orgs: { data: null, error: null } });
    await expect(revokePartnerOrg(asTyped(okC), "l1")).resolves.toEqual({ ok: true });
    const badC = mockClient({ project_partner_orgs: { data: null, error: { message: "nope" } } });
    await expect(revokePartnerOrg(asTyped(badC), "l1")).resolves.toEqual({ ok: false, error: "nope" });
  });
});

describe("acceptProjectPartnerInvite", () => {
  it("passes p_code and omits p_org_id when not given", async () => {
    let captured: unknown;
    const client = {
      rpc: (name: string, args: unknown) => {
        captured = { name, args };
        return Promise.resolve({ data: [{ project_id: "p1", org_id: "o9", project_name: "Tower A" }], error: null });
      },
    };
    const res = await acceptProjectPartnerInvite(asTyped(client), "st-code");
    expect(res).toEqual({ ok: true, projectId: "p1", orgId: "o9", projectName: "Tower A" });
    expect((captured as { name: string }).name).toBe("accept_project_partner_invite");
    expect((captured as { args: Record<string, unknown> }).args).toEqual({ p_code: "st-code" });
  });

  it("forwards p_org_id for multi-org admins and maps RPC errors", async () => {
    let captured: { args?: Record<string, unknown> } | undefined;
    const client = {
      rpc: (_n: string, args: unknown) => {
        captured = { args: args as Record<string, unknown> };
        return Promise.resolve({ data: null, error: { message: "invalid-or-used-invite-code" } });
      },
    };
    const res = await acceptProjectPartnerInvite(asTyped(client), "st-x", "o-multi");
    expect(res.ok).toBe(false);
    expect(captured?.args).toMatchObject({ p_code: "st-x", p_org_id: "o-multi" });
  });
});

describe("listSharedPartnerProjects", () => {
  it("joins names via a second projects query and maps scopes", async () => {
    const tables: Record<string, { data?: unknown; error?: unknown }> = {
      project_partner_orgs: {
        data: [
          { project_id: "pa", scope: "viewer", status: "active", accepted_at: "2026-08-26", org_name_snapshot: "Host Co" },
          { project_id: "pb", scope: "manager", status: "active", accepted_at: null, org_name_snapshot: null },
        ],
      },
      projects: { data: [{ id: "pa", name: "Tower A" }] },
    };
    const c = mockClient(tables);
    const rows = await listSharedPartnerProjects(asTyped(c));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ projectId: "pa", projectName: "Tower A", hostOrgName: "Host Co", scope: "viewer" });
    expect(rows[1].projectName).toBe("Shared project"); // missing name fallback
    expect(rows[1].hostOrgName).toBeNull();
  });

  it("returns [] when nothing is shared", async () => {
    const c = mockClient({ project_partner_orgs: { data: [] } });
    await expect(listSharedPartnerProjects(asTyped(c))).resolves.toEqual([]);
  });

  it("propagates query errors", async () => {
    const c = mockClient({ project_partner_orgs: { data: null, error: { message: "rls denied" } } });
    await expect(listSharedPartnerProjects(asTyped(c))).rejects.toThrow("rls denied");
  });
});
