// SiteTrack Pro — notifications inbox query tests.

import { describe, it, expect } from "vitest";
import { listNotifications, unreadCount } from "@/app/notificationQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "update", "eq", "is"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tableClient = (result: { data?: unknown; error?: unknown }): any => ({ from: () => chain(result) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (data: unknown, error: unknown = null): any => ({ rpc: async () => ({ data, error }) });

describe("listNotifications", () => {
  it("maps fields + read state; surfaces error", async () => {
    const r = await listNotifications(tableClient({ data: [
      { id: "1", kind: "approval_request", title: "RA-1 needs sign-off", body: "₹5L", link: "/projects/p1/rabills", read_at: null, created_at: "2026-06-06" },
      { id: "2", kind: "mention", title: "You were mentioned", body: null, link: null, read_at: "2026-06-05", created_at: "2026-06-05" },
    ], error: null }));
    expect(r.ok && r.data[0]).toMatchObject({ title: "RA-1 needs sign-off", link: "/projects/p1/rabills", readAt: null });
    expect(r.ok && r.data[1]).toMatchObject({ body: null, link: null, readAt: "2026-06-05" });
    const e = await listNotifications(tableClient({ data: null, error: { message: "no grant" } }));
    expect(e).toEqual({ ok: false, error: "no grant" });
  });
});

describe("unreadCount", () => {
  it("returns numeric count, 0 on error", async () => {
    expect(await unreadCount(rpcClient(3))).toBe(3);
    expect(await unreadCount(rpcClient(null, { message: "x" }))).toBe(0);
  });
});
