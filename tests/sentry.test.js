// SiteTrack Pro — Sentry lib unit tests.
//
// We test only the pure-function PII scrubber + user redaction here. The
// initSentry() lazy-load + Sentry SDK integration is exercised by an
// E2E test that sets a fake DSN.

import { describe, it, expect } from "vitest";
import { _internal } from "../src/lib/sentry.js";

const { scrubPII, redactUser } = _internal;

describe("sentry — scrubPII", () => {
  it("returns primitives unchanged", () => {
    expect(scrubPII(null)).toBe(null);
    expect(scrubPII(7)).toBe(7);
    expect(scrubPII("normal text")).toBe("normal text");
  });

  it("redacts a 12-digit Aadhaar look-alike inside a string", () => {
    expect(scrubPII("aadhaar 123412341234 attached")).toBe("[redacted]");
  });

  it("redacts a PAN look-alike inside a string", () => {
    expect(scrubPII("PAN ABCDE1234F applied")).toBe("[redacted]");
  });

  it("redacts a GSTIN look-alike inside a string", () => {
    expect(scrubPII("29ABCDE1234F1Z5 verified")).toBe("[redacted]");
  });

  it("redacts sensitive keys", () => {
    const out = scrubPII({ password: "hunter2", normal: "ok" });
    expect(out.password).toBe("[redacted]");
    expect(out.normal).toBe("ok");
  });

  it("redacts cashfree_secret nested keys", () => {
    const out = scrubPII({ payload: { cashfree_secret: "abc", other: "ok" } });
    expect(out.payload.cashfree_secret).toBe("[redacted]");
    expect(out.payload.other).toBe("ok");
  });

  it("redacts an api_key field deep in the tree", () => {
    const e = { user: { roles: [{ scope: { api_key: "k1", other: "ok" } }] } };
    const out = scrubPII(e);
    expect(out.user.roles[0].scope.api_key).toBe("[redacted]");
    expect(out.user.roles[0].scope.other).toBe("ok");
  });

  it("walks arrays", () => {
    const out = scrubPII([{ token: "x" }, { name: "y" }]);
    expect(out[0].token).toBe("[redacted]");
    expect(out[1].name).toBe("y");
  });

  it("stops at depth 6 to avoid infinite cycles", () => {
    const a = {};
    let cur = a;
    for (let i = 0; i < 50; i++) { cur.next = { val: "v" }; cur = cur.next; }
    expect(() => scrubPII(a)).not.toThrow();
  });

  it("preserves field names that LOOK sensitive but aren't (case-insensitive but specific)", () => {
    // 'permission' has 'mission' — not sensitive.
    const out = scrubPII({ permission: "ok", description: "ok" });
    expect(out.permission).toBe("ok");
    expect(out.description).toBe("ok");
  });
});

describe("sentry — redactUser", () => {
  it("returns null for null input", () => {
    expect(redactUser(null)).toBe(null);
  });

  it("redacts email keeping first char + domain", () => {
    const u = { id: "u1", email: "mohan@gigglezen.in", role: "orgadmin", org_id: "o1" };
    expect(redactUser(u)).toEqual({
      id: "u1", email: "m***@gigglezen.in", role: "orgadmin", org_id: "o1",
    });
  });

  it("returns 'redacted' for malformed email", () => {
    expect(redactUser({ email: "noatsign" }).email).toBe("redacted");
  });

  it("falls back to user_id when id missing", () => {
    expect(redactUser({ user_id: "u2", email: "a@b.com" }).id).toBe("u2");
  });

  it("preserves role + org_id", () => {
    const u = { id: "u1", email: "x@y.com", role: "pm", org_id: "o-9" };
    const r = redactUser(u);
    expect(r.role).toBe("pm");
    expect(r.org_id).toBe("o-9");
  });
});
