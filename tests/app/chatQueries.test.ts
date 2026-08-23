// SiteTrack Pro — Teams P1 query-layer tests: channel/message mappers +
// pure mention helpers (extractMentionIds / splitOnMentions).

import { describe, it, expect, vi } from "vitest";
import {
  listChannels, createChannel, setChannelArchived, deleteChannel,
  listChannelMessages, postChannelMessage, listThreadReplies,
  getChatMessage, deleteChatMessage,
  extractMentionIds, splitOnMentions,
} from "@/app/chatQueries";

function clientWith(impl: Record<string, unknown>) {
  // Minimal fluent-mock mirroring the crmQueries.test.ts pattern.
  const chain = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      from: (_t: string) => b,
      select: () => { (impl.select as (() => void) | undefined)?.(); return b; },
      eq: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      insert: () => b,
      update: () => b,
      delete: () => b,
      single: async () => (impl.single ? await (impl.single as () => Promise<unknown>)() : { data: null, error: null }),
    };
    // Make the builder await-able for list-style calls.
    b.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(impl.list ? resolve((impl.list as () => unknown)()) : resolve({ data: [], error: null }));
    return b;
  };
  return chain();
}

const CHANNEL_ROW = { id: "ch1", name: "site-updates", description: "Daily site notes", is_archived: false, created_at: "2026-08-22T10:00:00Z" };
const MSG_ROW = {
  id: "m1", channel_id: "ch1", parent_id: null, sender_id: "u1", sender_name: "Rakesh",
  body: "Hello @Sai", mentions: ["u2"], reply_count: 3, created_at: "2026-08-22T10:01:00Z",
};

describe("chatChannels mappers", () => {
  it("listChannels maps rows + camelCases flags, ordered result passthrough", async () => {
    const client = clientWith({ list: () => ({ data: [CHANNEL_ROW], error: null }) });
    const res = await listChannels(client, "org1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toMatchObject({ id: "ch1", name: "site-updates", description: "Daily site notes", isArchived: false });
  });

  it("listChannels surfaces errors", async () => {
    const res = await listChannels(clientWith({ list: () => ({ data: null, error: { message: "boom" } }) }), "org1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("boom");
  });

  it("createChannel rejects empty names before touching the client", async () => {
    const res = await createChannel(clientWith({}), { orgId: "org1", name: "   " });
    expect(res.ok).toBe(false);
  });

  it("createChannel inserts trimmed name + optional description", async () => {
    const single = vi.fn(async () => ({ data: { id: "new1" }, error: null }));
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const client = { from: () => ({ insert }) } as never;
    const res = await createChannel(client, { orgId: "org1", name: "  general  ", description: "  lobby  " });
    expect(insert).toHaveBeenCalledWith({ org_id: "org1", name: "general", description: "lobby" });
    expect(res.ok).toBe(true);
  });

  it("setChannelArchived + deleteChannel surface errors", async () => {
    const bad = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: "rls denied" } }) }) }) } as never;
    expect((await setChannelArchived(bad, "ch1", true)).ok).toBe(false);
    const delBad = { from: () => ({ delete: () => ({ eq: async () => ({ error: { message: "nope" } }) }) }) } as never;
    expect((await deleteChannel(delBad, "ch1")).ok).toBe(false);
  });
});

describe("chatMessages mappers", () => {
  it("listChannelMessages maps top-level messages incl. mentions + replyCount", async () => {
    const res = await listChannelMessages(clientWith({ list: () => ({ data: [MSG_ROW], error: null }) }), "ch1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data[0]).toMatchObject({ id: "m1", parentId: null, senderName: "Rakesh", body: "Hello @Sai", replyCount: 3 });
      expect(res.data[0].mentions).toEqual(["u2"]);
    }
  });

  it("postChannelMessage trims body and rejects empties", async () => {
    const empty = await postChannelMessage(clientWith({}), { orgId: "o", channelId: "c", senderId: "u", senderName: "n", body: "   " });
    expect(empty.ok).toBe(false);
    let payload: Record<string, unknown> | null = null;
    const insert = vi.fn((p: Record<string, unknown>) => { payload = p; return { select: () => ({ single: async () => ({ data: { id: "m9" }, error: null }) }) }; });
    const client = { from: () => ({ insert }) } as never;
    const ok = await postChannelMessage(client, {
      orgId: "o", channelId: "c", senderId: "u1", senderName: "Rakesh",
      body: "  hi  ", mentionIds: ["u2"], parentId: null,
    });
    expect(ok.ok).toBe(true);
    expect(payload).toMatchObject({ org_id: "o", channel_id: "c", parent_id: null, sender_id: "u1", body: "hi", mentions: ["u2"] });
  });

  it("postChannelMessage defaults parent to null and mentions to []", async () => {
    let payload: Record<string, unknown> | null = null;
    const insert = vi.fn((p: Record<string, unknown>) => { payload = p; return { select: () => ({ single: async () => ({ data: { id: "m9" }, error: null }) }) }; });
    const client = { from: () => ({ insert }) } as never;
    await postChannelMessage(client, { orgId: "o", channelId: "c", senderId: "u1", senderName: "x", body: "hi" });
    expect(payload).toMatchObject({ parent_id: null, mentions: [] });
  });

  it("listThreadReplies maps replies with parent linkage", async () => {
    const row = { ...MSG_ROW, id: "r1", parent_id: "m1" };
    const res = await listThreadReplies(clientWith({ list: () => ({ data: [row], error: null }) }), "m1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toMatchObject({ id: "r1", parentId: "m1" });
  });

  it("non-array mentions coerce to []", async () => {
    const res = await listChannelMessages(clientWith({ list: () => ({ data: [{ ...MSG_ROW, mentions: null }], error: null }) }), "ch1");
    if (res.ok) expect(res.data[0].mentions).toEqual([]);
  });

  it("getChatMessage maps a single row and null for missing", async () => {
    const single = vi.fn(async () => ({ data: MSG_ROW, error: null }));
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: single }) }) }) } as never;
    const res = await getChatMessage(client, "m1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toMatchObject({ id: "m1", senderName: "Rakesh" });

    const missing = await getChatMessage({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as never, "nope");
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.data).toBeNull();
  });

  it("getChatMessage surfaces errors", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "rls" } }) }) }) }) } as never;
    const res = await getChatMessage(client, "m1");
    expect(res.ok).toBe(false);
  });

  it("deleteChatMessage ok + error paths", async () => {
    const good = { from: () => ({ delete: () => ({ eq: async () => ({ error: null }) }) }) } as never;
    expect((await deleteChatMessage(good, "m1")).ok).toBe(true);
    const bad = { from: () => ({ delete: () => ({ eq: async () => ({ error: { message: "denied" } }) }) }) } as never;
    const res = await deleteChatMessage(bad, "m1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("denied");
  });
});

describe("extractMentionIds", () => {
  const members = [
    { profileId: "u-ravi", name: "Ravi Kumar" },
    { profileId: "u-ravi2", name: "Ravi" },
    { profileId: "u-sai", name: "Sai Chandu" },
    { profileId: "u-te", name: "రవి కుమార్" },
  ];

  it("resolves @Name case-insensitively and dedupes", () => {
    expect(extractMentionIds("@ravi kumar please check @RAVI KUMAR", members)).toEqual(["u-ravi"]);
  });

  it("longest name wins when one contains another", () => {
    expect(extractMentionIds("@Ravi Kumar vs @Ravi", members)).toEqual(["u-ravi", "u-ravi2"]);
  });

  it("ignores bare @ without a matching member", () => {
    expect(extractMentionIds("@unknown hello", members)).toEqual([]);
  });

  it("returns [] fast when no @ or no members", () => {
    expect(extractMentionIds("plain text", members)).toEqual([]);
    expect(extractMentionIds("@Ravi", [])).toEqual([]);
  });

  it("supports Telugu member names", () => {
    expect(extractMentionIds("ప్రారంభం @రవి కుమార్", members)).toEqual(["u-te"]);
  });
});

describe("splitOnMentions", () => {
  it("splits plain text around mention tokens", () => {
    expect(splitOnMentions("ping @Ravi now", ["Ravi"])).toEqual([
      { text: "ping " }, { text: "@Ravi", mention: "@Ravi" }, { text: " now" },
    ]);
  });

  it("handles leading/trailing mentions and no-match bodies", () => {
    expect(splitOnMentions("@Ravi", ["Ravi"])).toEqual([{ text: "@Ravi", mention: "@Ravi" }]);
    expect(splitOnMentions("no mentions here", ["Ravi"])).toEqual([{ text: "no mentions here" }]);
    expect(splitOnMentions("", ["Ravi"])).toEqual([]);
  });

  it("is non-overlapping across similar names (longest first)", () => {
    const parts = splitOnMentions("@Ravi Kumar and @Ravi", ["Ravi Kumar", "Ravi"]);
    const mentions = parts.filter(p => p.mention).map(p => p.text);
    expect(mentions).toEqual(["@Ravi Kumar", "@Ravi"]);
  });
});
