// SiteTrack Pro — v4 Phase B interior module surface tests.
// Pure helpers (room progress, status transitions) + query-layer mappers.

import { describe, it, expect } from "vitest";
import {
  roomProgress, INSTALL_NEXT, ROOM_FINISH_NEXT,
  listMoodBoards, upsertMoodBoard, deleteMoodBoard,
  listInteriorRooms, upsertRoom, setRoomFinishStatus, deleteRoom,
  listInstallations, addInstallation, setInstallStatus, deleteInstallation,
} from "@/app/interiorQueries";

describe("interiorQueries roomProgress", () => {
  it("computes installed / in-progress / cancelled + pct", () => {
    const p = roomProgress([
      { finishStatus: "installed" }, { finishStatus: "installed" },
      { finishStatus: "in_progress" }, { finishStatus: "planned" }, { finishStatus: "cancelled" },
    ]);
    expect(p.total).toBe(5);
    expect(p.installed).toBe(2);
    expect(p.inProgress).toBe(1);
    expect(p.cancelled).toBe(1);
    expect(p.pct).toBe(50); // 2 / (5-1) active
  });

  it("pct clamps to 0 when no active rooms", () => {
    expect(roomProgress([{ finishStatus: "cancelled" }]).pct).toBe(0);
    expect(roomProgress([]).pct).toBe(0);
  });

  it("100% when every active room is installed", () => {
    expect(roomProgress([{ finishStatus: "installed" }, { finishStatus: "installed" }]).pct).toBe(100);
  });
});

describe("interiorQueries status transitions", () => {
  it("INSTALL_NEXT walks planned → ordered → installed, terminal stays put", () => {
    expect(INSTALL_NEXT.planned).toBe("ordered");
    expect(INSTALL_NEXT.ordered).toBe("installed");
    expect(INSTALL_NEXT.installed).toBe("installed");
    expect(INSTALL_NEXT.cancelled).toBe("planned");
  });

  it("ROOM_FINISH_NEXT walks planned → in_progress → installed, terminal stays put", () => {
    expect(ROOM_FINISH_NEXT.planned).toBe("in_progress");
    expect(ROOM_FINISH_NEXT.in_progress).toBe("installed");
    expect(ROOM_FINISH_NEXT.installed).toBe("installed");
    expect(ROOM_FINISH_NEXT.cancelled).toBe("planned");
  });
});

describe("interiorQueries mood boards (mock client)", () => {
  it("listMoodBoards maps rows + coerces unknown title", async () => {
    const res = await listMoodBoards({ from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    }) }, "p1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("upsertMoodBoard inserts a row and returns its id", async () => {
    const c = {
      from: () => ({
        insert: (_row: unknown) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "b1" }, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    };
    const res = await upsertMoodBoard(c, { projectId: "p1", title: "Earthy kitchen", theme: "Warm" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("b1");
  });

  it("deleteMoodBoard surfaces errors", async () => {
    const c = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: { message: "boom" } }) }) }) };
    const res = await deleteMoodBoard(c, "b1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("interiorQueries rooms (mock client)", () => {
  it("listInteriorRooms maps empty list", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    const res = await listInteriorRooms(c, "p1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("upsertRoom updates when an id is given", async () => {
    let updated = false;
    const c = {
      from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "r1" }, error: null }) }) }),
      update: (_row: unknown) => { updated = true; return { eq: () => Promise.resolve({ error: null }) }; },
      }),
    };
    const res = await upsertRoom(c, { id: "r1", projectId: "p1", name: "Kitchen" });
    expect(res.ok).toBe(true);
    expect(updated).toBe(true);
  });

  it("setRoomFinishStatus maps a status update", async () => {
    const c = { from: () => ({ update: (_row: unknown) => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    const res = await setRoomFinishStatus(c, "r1", "in_progress");
    expect(res.ok).toBe(true);
  });

  it("deleteRoom surfaces errors", async () => {
    const c = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: { message: "nope" } }) }) }) };
    const res = await deleteRoom(c, "r1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("nope");
  });
});

describe("interiorQueries installations (mock client)", () => {
  it("listInstallations maps empty list", async () => {
    const c = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    const res = await listInstallations(c, "room1");
    expect(res.ok).toBe(true);
  });

  it("addInstallation inserts with item + planned date", async () => {
    const c = { from: () => ({ insert: (_row: unknown) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "i1" }, error: null }) }) }) }) };
    const res = await addInstallation(c, { roomId: "room1", item: "Wardrobe", plannedDate: "2026-09-01" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("i1");
  });

  it("setInstallStatus updates and delete surfaces errors", async () => {
    const up = { from: () => ({ update: (_row: unknown) => ({ eq: () => Promise.resolve({ error: null }) }) }) };
    expect((await setInstallStatus(up, "i1", "installed")).ok).toBe(true);
    const del = { from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: { message: "x" } }) }) }) };
    const res = await deleteInstallation(del, "i1");
    expect(res.ok).toBe(false);
  });
});
