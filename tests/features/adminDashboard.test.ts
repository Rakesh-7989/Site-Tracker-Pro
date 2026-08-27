// SiteTrack Pro — Phase SA-D (Platform Dashboard rebuild) pure-helper tests.
// Dashboard view helpers (PlatformDashboardView) + the cross-org audit feed
// behavior introduced on listAuditLog (orgId undefined → no org filter).

import { describe, expect, it } from "vitest";
import {
  planMixData,
  openTickets,
  ticketFocus,
  upgradeFocus,
  feedRows,
  orgNameFromBrief,
  agoLabel,
} from "@/features/admin/PlatformDashboardView";
import { listAuditLog } from "@/app/queries/auditLogQueries";
import type { Ticket } from "@/app/queries/platformSupportQueries";
import type { UpgradeRequest } from "@/app/queries/upgradeQueries";

const ticket = (over: Partial<Ticket>): Ticket => ({
  id: "t", subject: "S", body: "", from: "", email: "", status: "open",
  created: "2026-01-01T00:00:00Z", org_id: "o1", ...over,
});

const request = (over: Partial<UpgradeRequest>): UpgradeRequest => ({
  id: "r", orgId: "o1", orgName: "ABC", requesterEmail: null,
  currentPlan: "basic", desiredPlan: "pro", note: null, status: "open",
  assignedStaffId: null, assignedEmail: null, resolutionNote: null,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...over,
});

describe("planMixData", () => {
  it("maps canonical order + labels and drops zero-count plans", () => {
    expect(planMixData({ pro: 3, basic: 2, gold: 9, custom: 1 })).toEqual([
      { label: "Basic", value: 2 },
      { label: "Pro", value: 3 },
      { label: "Custom", value: 1 },
    ]);
  });
  it("returns an empty series when nothing is set", () => {
    expect(planMixData({})).toEqual([]);
  });
});

describe("openTickets + ticketFocus", () => {
  const tickets = [
    ticket({ id: "a", created: "2026-01-02T00:00:00Z", status: "open" }),
    ticket({ id: "b", created: "2026-01-03T00:00:00Z", status: "closed" }),
    ticket({ id: "c", created: "2026-01-01T00:00:00Z", status: "replied" }),
  ];
  it("filters closed and sorts most-recent first", () => {
    const rows = openTickets(tickets);
    expect(rows.map(r => r.id)).toEqual(["a", "c"]);
  });
  it("counts non-closed and caps the rows", () => {
    const f = ticketFocus(tickets, 1);
    expect(f.count).toBe(2);
    expect(f.rows.map(r => r.id)).toEqual(["a"]);
  });
  it("empty input → zero", () => {
    expect(ticketFocus([])).toEqual({ count: 0, rows: [] });
  });
});

describe("upgradeFocus", () => {
  const requests = [
    request({ id: "a", status: "open", createdAt: "2026-01-02T00:00:00Z", orgName: "Old" }),
    request({ id: "b", status: "closed", createdAt: "2026-01-05T00:00:00Z", orgName: "Done" }),
    request({ id: "c", status: "in_progress", createdAt: "2026-01-04T00:00:00Z", orgName: "New" }),
    request({ id: "d", status: "open", createdAt: "2026-01-03T00:00:00Z", orgName: "Mid" }),
  ];
  it("counts only active requests and returns the newest rows with mapped fields", () => {
    const f = upgradeFocus(requests, 2);
    expect(f.count).toBe(3);
    expect(f.rows.map(r => r.id)).toEqual(["c", "d"]);
    expect(f.rows[0]).toMatchObject({ orgName: "New", desiredPlan: "pro", status: "in_progress" });
  });
  it("empty input → zero", () => {
    expect(upgradeFocus([])).toEqual({ count: 0, rows: [] });
  });
});

describe("feedRows", () => {
  it("caps the cross-org feed at the limit", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ id: String(i) } as never));
    expect(feedRows(rows, 10)).toHaveLength(10);
    expect(feedRows(rows, 3)).toHaveLength(3);
  });
});

describe("orgNameFromBrief", () => {
  it("resolves the org display name", () => {
    expect(orgNameFromBrief([{ id: "o1", name: "G Architects" }], "o1")).toBe("G Architects");
  });
  it("falls back for unknown/deleted orgs", () => {
    expect(orgNameFromBrief([], "o9")).toBe("Unknown org");
  });
});

describe("agoLabel", () => {
  const now = Date.now();
  const at = (s: number) => new Date(now - s * 1000).toISOString();
  it("renders compact relative labels", () => {
    expect(agoLabel(at(5))).toBe("just now");
    expect(agoLabel(at(300))).toBe("5m ago");
    expect(agoLabel(at(3 * 3600))).toBe("3h ago");
    expect(agoLabel(at(2 * 86400))).toBe("2d ago");
  });
  it("handles empty + invalid timestamps", () => {
    expect(agoLabel("")).toBe("");
    expect(agoLabel("not-a-date")).toBe("");
  });
});

describe("listAuditLog cross-org mode", () => {
  const row = { id: "1", org_id: "o1", project_id: null, actor_id: "u1", actor_name: "Rakesh", actor_role: "superadmin", action: "org.update", resource: "organization", resource_id: "o1", message: "changed plan", ts: "2026-01-01T00:00:00Z" };

  const client = (data: unknown, error: unknown, ops: string[] = []) => {
    const step = () => ({
      select: step,
      order: step,
      eq: (c: string, v: unknown) => { ops.push(`eq:${c}:${v}`); return step(); },
      range: async () => ({ data, error }),
    });
    return { from: step };
  };

  it("omits the org filter when orgId is undefined (cross-org feed)", async () => {
    const ops: string[] = [];
    const r = await listAuditLog(client([row], null, ops) as never, undefined, { limit: 10 });
    expect(r.ok).toBe(true);
    expect(ops).not.toContain("eq:org_id:o1");
    expect(ops).not.toContain("eq:org_id:");
    if (!r.ok) return;
    expect(r.data[0]).toMatchObject({ orgId: "o1", actorName: "Rakesh", action: "org.update", message: "changed plan" });
  });

  it("keeps the org filter when orgId is provided (org-scoped view)", async () => {
    const ops: string[] = [];
    await listAuditLog(client([], null, ops) as never, "o1", { limit: 10 });
    expect(ops).toContain("eq:org_id:o1");
  });

  it("propagates DB errors", async () => {
    const r = await listAuditLog(client(null, { message: "denied" }, []) as never, undefined, {});
    expect(r).toEqual({ ok: false, error: "denied" });
  });
});
