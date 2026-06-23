// SiteTrack Pro — delegation queries tests (v3 shell).

import { describe, it, expect } from "vitest";
import {
  listDelegations, listOrgMembers, createDelegation, revokeDelegation,
} from "@/app/delegationQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resp(data: unknown, error: unknown): any {
  return new Proxy(() => {}, {
    get: (_t: unknown, prop: string | symbol) => {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve({ data, error });
      return () => resp(data, error);
    },
    apply: () => resp(data, error),
  });
}

function clientFor(data: unknown, error: unknown) {
  return { from: () => resp(data, error) };
}

describe("listDelegations", () => {
  it("maps delegation rows with joined profile names", async () => {
    const client = clientFor([{
      id: "d-1", from_user: "u1", to_user: "u2",
      resource: "ra_bill", start_at: "2026-01-01", end_at: "2026-03-01",
      reason: "On leave", active: true, created_at: "2026-01-01T00:00:00Z", revoked_at: null,
      from_profile: { name: "Alice" },
      to_profile: { name: "Bob" },
    }], null);
    const r = await listDelegations(client, "u1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.fromUserName).toBe("Alice");
      expect(r.data[0]!.toUserName).toBe("Bob");
      expect(r.data[0]!.scope).toBe("ra_bills");
      expect(r.data[0]!.active).toBe(true);
    }
  });

  it("handles empty results", async () => {
    const r = await listDelegations(clientFor([], null), "u1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });
});

describe("listOrgMembers", () => {
  it("maps member rows with profile name", async () => {
    const client = clientFor([{
      profile_id: "u1", role: "admin", status: "active",
      profiles: { name: "Alice" },
    }], null);
    const r = await listOrgMembers(client, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0]!.id).toBe("u1");
      expect(r.data[0]!.name).toBe("Alice");
      expect(r.data[0]!.role).toBe("admin");
    }
  });
});

describe("createDelegation", () => {
  it("returns the new id", async () => {
    const client = clientFor({ id: "d-new" }, null);
    const r = await createDelegation(client, {
      orgId: "o-1", fromUserId: "u1", toUserId: "u2",
      scope: "all", start: "2026-01-01", end: "2026-03-01",
      reason: "Vacation", createdBy: "u1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("d-new");
  });

  it("surfaces insert errors", async () => {
    const client = clientFor(null, { message: "RLS" });
    const r = await createDelegation(client, {
      orgId: "o-1", fromUserId: "u1", toUserId: "u2",
      scope: "ra_bills", start: "2026-01-01", end: "2026-03-01",
      reason: "", createdBy: "u1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/RLS/);
  });
});

describe("revokeDelegation", () => {
  it("returns ok on success", async () => {
    const r = await revokeDelegation(clientFor(null, null), "d-1", "u1");
    expect(r.ok).toBe(true);
  });
});
