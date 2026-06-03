import { describe, it, expect } from "vitest";
import { activeDelegationsFor, resolveApprover, addDelegation, revokeDelegation, delegationStatus } from "../src/lib/delegations.js";

const archUser = { id: "u_arch", name: "Ramesh", role: "architect" };
// pmUser kept as documentation of the canonical delegation target shape — used
// in upcoming Sprint 3 cross-role delegation tests. Prefixed with `_` to
// silence the unused-vars lint while preserving intent.
const _pmUser  = { id: "u_pm",   name: "Suresh", role: "pm" };

// Pin "now" to a time inside the test delegation window so tests don't drift
// as real-world dates pass May 26. resolveApprover takes `now` as a 4th arg.
const fixedNow = new Date("2026-05-25T10:00:00Z");
const insideWindow = fixedNow;

function makeDelegation(extra = {}) {
  return {
    id: "d1",
    from_user_id: "u_arch",
    from_user_name: "Ramesh",
    to_user_id: "u_pm",
    to_user_name: "Suresh",
    scope: "all",
    start: "2026-05-24T00:00:00Z",
    end:   "2026-05-26T00:00:00Z",
    active: true,
    ...extra,
  };
}

describe("delegations.activeDelegationsFor", () => {
  it("returns delegations active at the requested time", () => {
    const all = [makeDelegation()];
    expect(activeDelegationsFor(all, "u_arch", fixedNow)).toHaveLength(1);
  });

  it("excludes expired delegations", () => {
    const all = [makeDelegation({ end: "2026-05-24T00:00:00Z" })];
    expect(activeDelegationsFor(all, "u_arch", fixedNow)).toHaveLength(0);
  });

  it("excludes scheduled-future delegations", () => {
    const all = [makeDelegation({ start: "2026-06-01T00:00:00Z", end: "2026-06-30T00:00:00Z" })];
    expect(activeDelegationsFor(all, "u_arch", fixedNow)).toHaveLength(0);
  });

  it("excludes revoked delegations", () => {
    const all = [makeDelegation({ active: false })];
    expect(activeDelegationsFor(all, "u_arch", fixedNow)).toHaveLength(0);
  });
});

describe("delegations.resolveApprover", () => {
  it("returns original user when no active delegation", () => {
    const r = resolveApprover([], archUser, "ra_bills");
    expect(r.id).toBe("u_arch");
    expect(r.delegated).toBe(false);
  });

  it("redirects to delegate for matching scope", () => {
    const dels = [makeDelegation({ scope: "ra_bills" })];
    const r = resolveApprover(dels, archUser, "ra_bills", insideWindow);
    expect(r.id).toBe("u_pm");
    expect(r.delegated).toBe(true);
    expect(r.original_user_id).toBe("u_arch");
  });

  it('"all" scope matches any approval', () => {
    const dels = [makeDelegation({ scope: "all" })];
    expect(resolveApprover(dels, archUser, "drawings", insideWindow).delegated).toBe(true);
    expect(resolveApprover(dels, archUser, "change_orders", insideWindow).delegated).toBe(true);
  });

  it("does not redirect when scope doesn't match", () => {
    const dels = [makeDelegation({ scope: "ra_bills" })];
    const r = resolveApprover(dels, archUser, "drawings", insideWindow);
    expect(r.delegated).toBe(false);
  });
});

describe("delegations.addDelegation + revokeDelegation", () => {
  it("appends row with id + created_at", () => {
    const next = addDelegation([], { from_user_id: "u1", to_user_id: "u2", start: "2026-05-25", end: "2026-05-28" });
    expect(next).toHaveLength(1);
    expect(next[0].id).toMatch(/^d_/);
    expect(next[0].active).toBe(true);
  });

  it("revoke flips active to false but keeps row", () => {
    const dels = [{ id: "d1", active: true }];
    const next = revokeDelegation(dels, "d1");
    expect(next).toHaveLength(1);
    expect(next[0].active).toBe(false);
    expect(next[0].revoked_at).toBeTruthy();
  });
});

describe("delegations.delegationStatus", () => {
  it("returns active during the window", () => {
    expect(delegationStatus(makeDelegation(), fixedNow)).toBe("active");
  });
  it("returns scheduled before the window", () => {
    expect(delegationStatus(makeDelegation({ start: "2027-01-01T00:00:00Z", end: "2027-01-10T00:00:00Z" }), fixedNow)).toBe("scheduled");
  });
  it("returns expired after the window", () => {
    expect(delegationStatus(makeDelegation({ end: "2026-01-01T00:00:00Z" }), fixedNow)).toBe("expired");
  });
  it("returns revoked when active=false", () => {
    expect(delegationStatus(makeDelegation({ active: false }), fixedNow)).toBe("revoked");
  });
});
