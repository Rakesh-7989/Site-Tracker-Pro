// SiteTrack Pro — org calendar query + bucketing tests.

import { describe, it, expect } from "vitest";
import { getOrgCalendar, bucketByDate, type CalItem } from "@/app/calendarQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcClient = (result: { data?: unknown; error?: unknown }): any => ({ rpc: async () => result });

describe("getOrgCalendar", () => {
  it("maps rows snake→camel + coerces kind", async () => {
    const r = await getOrgCalendar(rpcClient({ data: [
      { kind: "milestone", id: "m1", project_id: "p1", project_name: "Tower A", title: "Plinth", due_date: "2026-07-01", status: "pending" },
      { kind: "weird", id: "t1", project_id: "p1", project_name: "Tower A", title: "Order steel", due_date: "2026-06-10", status: "in_progress" },
    ], error: null }), "o");
    expect(r.ok && r.data[0]).toMatchObject({ kind: "milestone", title: "Plinth", dueDate: "2026-07-01", projectName: "Tower A" });
    expect(r.ok && r.data[1].kind).toBe("milestone"); // unknown → milestone fallback
    const e = await getOrgCalendar(rpcClient({ data: null, error: { message: "x" } }), "o");
    expect(e).toEqual({ ok: false, error: "x" });
  });
});

describe("bucketByDate", () => {
  const mk = (id: string, dueDate: string, status = "pending"): CalItem => ({ kind: "task", id, projectId: "p", projectName: "P", title: id, dueDate, status });
  it("splits overdue / today / upcoming and skips completed-overdue", () => {
    const items = [mk("a", "2026-06-01"), mk("b", "2026-06-06"), mk("c", "2026-06-10"), mk("d", "2026-06-11"), mk("done", "2026-06-01", "completed")];
    const { overdue, today, upcoming } = bucketByDate(items, "2026-06-06");
    expect(overdue.map(i => i.id)).toEqual(["a"]);        // 'done' overdue but completed → skipped
    expect(today.map(i => i.id)).toEqual(["b"]);
    expect([...upcoming.keys()].sort()).toEqual(["2026-06-10", "2026-06-11"]);
    expect(upcoming.get("2026-06-10")?.map(i => i.id)).toEqual(["c"]);
  });
});
