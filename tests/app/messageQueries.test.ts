// SiteTrack Pro — project messages query tests.

import { describe, it, expect } from "vitest";
import { listMessages, postMessage } from "@/app/messageQueries";

function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "insert", "single"]) c[m] = () => c;
  c.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return c;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (result: { data?: unknown; error?: unknown }): any => ({ from: () => chain(result) });

describe("listMessages", () => {
  it("maps fields + defaults sender; surfaces error", async () => {
    const r = await listMessages(client({ data: [
      { id: "1", sender_id: "u1", sender_name: "Rakesh", body: "Slab done", created_at: "2026-06-06T10:00:00Z" },
      { id: "2", sender_id: null, sender_name: null, body: "auto", created_at: "x" },
    ], error: null }), "p");
    expect(r.ok && r.data[0]).toMatchObject({ senderId: "u1", senderName: "Rakesh", body: "Slab done" });
    expect(r.ok && r.data[1]).toMatchObject({ senderId: null, senderName: "Member" });
    const e = await listMessages(client({ data: null, error: { message: "no grant" } }), "p");
    expect(e).toEqual({ ok: false, error: "no grant" });
  });
});

describe("postMessage", () => {
  it("returns the new id", async () => {
    const r = await postMessage(client({ data: { id: "m9" }, error: null }), { projectId: "p", body: "hi", senderId: "u", senderName: "U" });
    expect(r).toEqual({ ok: true, data: { id: "m9" } });
  });
});
