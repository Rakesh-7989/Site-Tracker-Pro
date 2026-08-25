import { describe, it, expect } from "vitest";

// Pure helper tests - no module imports needed

const ROOM_FINISH_STATUSES = ["planned", "in_progress", "installed", "cancelled"];
const INSTALL_STATUSES = ["planned", "ordered", "installed", "cancelled"];

function roomProgress(rooms: { finishStatus: string }[]) {
  let installed = 0;
  let inProgress = 0;
  let cancelled = 0;
  for (const r of rooms) {
    if (r.finishStatus === "installed") installed += 1;
    else if (r.finishStatus === "in_progress") inProgress += 1;
    else if (r.finishStatus === "cancelled") cancelled += 1;
  }
  const active = rooms.length - cancelled;
  const pct = active === 0 ? 0 : Math.round((installed / active) * 100);
  return { total: rooms.length, installed, inProgress, cancelled, pct };
}

const INSTALL_NEXT: Record<string, string> = {
  planned: "ordered", ordered: "installed", installed: "installed", cancelled: "planned",
};

const ROOM_FINISH_NEXT: Record<string, string> = {
  planned: "in_progress", in_progress: "installed", installed: "installed", cancelled: "planned",
};

const ROOM_FINISH_LABEL: Record<string, string> = {
  planned: "Planned", in_progress: "In progress", installed: "Installed", cancelled: "Cancelled",
};
const INSTALL_LABEL: Record<string, string> = {
  planned: "Planned", ordered: "Ordered", installed: "Installed", cancelled: "Cancelled",
};

describe("Interior Pure Helpers", () => {
  it("roomProgress computes correct percentages", () => {
    const rooms = [
      { finishStatus: "installed" },
      { finishStatus: "in_progress" },
      { finishStatus: "cancelled" },
    ];
    const progress = roomProgress(rooms);
    expect(progress.installed).toBe(1);
    expect(progress.inProgress).toBe(1);
    expect(progress.cancelled).toBe(1);
    expect(progress.pct).toBe(50);
  });

  it("roomProgress returns 0% when all rooms cancelled", () => {
    const rooms = [
      { finishStatus: "cancelled" },
      { finishStatus: "cancelled" },
    ];
    const progress = roomProgress(rooms);
    expect(progress.pct).toBe(0);
    expect(progress.installed).toBe(0);
    expect(progress.total).toBe(2);
  });

  it("INSTALL_NEXT maps status correctly", () => {
    expect(INSTALL_NEXT.planned).toBe("ordered");
    expect(INSTALL_NEXT.ordered).toBe("installed");
    expect(INSTALL_NEXT.installed).toBe("installed");
    expect(INSTALL_NEXT.cancelled).toBe("planned");
  });

  it("ROOM_FINISH_NEXT maps status correctly", () => {
    expect(ROOM_FINISH_NEXT.planned).toBe("in_progress");
    expect(ROOM_FINISH_NEXT.in_progress).toBe("installed");
    expect(ROOM_FINISH_NEXT.installed).toBe("installed");
    expect(ROOM_FINISH_NEXT.cancelled).toBe("planned");
  });

  it("ROOM_FINISH_LABEL provides correct labels", () => {
    expect(ROOM_FINISH_LABEL.planned).toBe("Planned");
    expect(ROOM_FINISH_LABEL.in_progress).toBe("In progress");
    expect(ROOM_FINISH_LABEL.installed).toBe("Installed");
    expect(ROOM_FINISH_LABEL.cancelled).toBe("Cancelled");
  });

  it("INSTALL_LABEL provides correct labels", () => {
    expect(INSTALL_LABEL.planned).toBe("Planned");
    expect(INSTALL_LABEL.ordered).toBe("Ordered");
    expect(INSTALL_LABEL.installed).toBe("Installed");
    expect(INSTALL_LABEL.cancelled).toBe("Cancelled");
  });

  it("ROOM_FINISH_STATUSES has correct values", () => {
    expect(ROOM_FINISH_STATUSES).toContain("planned");
    expect(ROOM_FINISH_STATUSES).toContain("installed");
  });

  it("INSTALL_STATUSES has correct values", () => {
    expect(INSTALL_STATUSES).toContain("planned");
    expect(INSTALL_STATUSES).toContain("installed");
  });
});