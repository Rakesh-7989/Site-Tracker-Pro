// SiteTrack Pro — v5 Phase B2: Client Portal depth query tests.
// Pure helpers (payment rollup, upcoming milestones, approved drawings,
// activity feed) + the injected-client query mappers.

import { describe, it, expect } from "vitest";
import {
  clientPaymentRollup, upcomingMilestones, approvedDrawings, buildActivityFeed,
  getClientProject, listClientInvoices, listClientMilestones, listClientDrawings,
  listClientUpdates, listClientActivity,
  type ClientInvoice, type ClientMilestone, type ClientDrawing, type ClientUpdate,
} from "@/app/clientPortalQueries";

function inv(overrides: Partial<ClientInvoice> = {}): ClientInvoice {
  return {
    id: "i1", no: "INV-001", amount: 100000, gst: 18000, tds: 2000, status: "sent",
    issuedDate: "2026-08-01", netReceivable: 116000, received: 0, outstanding: 116000,
    paymentStatus: "pending", payments: [], ...overrides,
  };
}

function mile(overrides: Partial<ClientMilestone> = {}): ClientMilestone {
  return {
    id: "m1", title: "Foundation", status: "pending", dueDate: "2026-09-01", completedDate: null, ...overrides,
  };
}

function drw(overrides: Partial<ClientDrawing> = {}): ClientDrawing {
  return {
    id: "d1", title: "G+1 Plan", type: "architectural", revision: "Rev A",
    notes: null, releaseDate: "2026-08-10", approvalStatus: "approved", previewUrl: null, ...overrides,
  };
}

function upd(overrides: Partial<ClientUpdate> = {}): ClientUpdate {
  return {
    id: "u1", updateDate: "2026-08-11", notes: "RCC casting done", weather: "sunny",
    workersCount: 24, authorName: "Rajesh", createdAt: "2026-08-11T10:00:00Z", ...overrides,
  };
}

describe("clientPaymentRollup", () => {
  it("sums net/received/outstanding across non-cancelled invoices", () => {
    const r = clientPaymentRollup([
      inv({ netReceivable: 116000, received: 50000, outstanding: 66000, paymentStatus: "partial" }),
      inv({ id: "i2", no: "INV-002", netReceivable: 50000, received: 50000, outstanding: 0, paymentStatus: "paid" }),
      inv({ id: "i3", no: "INV-003", netReceivable: 20000, received: 0, outstanding: 20000, paymentStatus: "overdue" }),
    ]);
    expect(r.count).toBe(3);
    expect(r.net).toBe(186000);
    expect(r.received).toBe(100000);
    expect(r.outstanding).toBe(86000);
    expect(r.byPaymentStatus).toEqual({ paid: 1, partial: 1, pending: 0, overdue: 1 });
  });
  it("skips cancelled invoices and zeroes empty input", () => {
    const r = clientPaymentRollup([inv({ status: "cancelled", netReceivable: 999, paymentStatus: "pending" })]);
    expect(r.net).toBe(0);
    expect(r.received).toBe(0);
    expect(r.outstanding).toBe(0);
    expect(r.byPaymentStatus.pending).toBe(0);
    const empty = clientPaymentRollup([]);
    expect(empty).toMatchObject({ count: 0, net: 0, received: 0, outstanding: 0 });
  });
});

describe("upcomingMilestones", () => {
  it("keeps pending/in_progress and sorts by due date ascending (nulls last)", () => {
    const ms = [
      mile({ id: "a", status: "completed", dueDate: "2026-01-01" }),
      mile({ id: "b", status: "in_progress", dueDate: "2026-09-10" }),
      mile({ id: "c", status: "pending", dueDate: null }),
      mile({ id: "d", status: "pending", dueDate: "2026-08-20" }),
    ];
    expect(upcomingMilestones(ms).map(m => m.id)).toEqual(["d", "b", "c"]);
  });
  it("empty input yields empty list", () => {
    expect(upcomingMilestones([])).toEqual([]);
  });
});

describe("approvedDrawings", () => {
  it("keeps approved + locked, drops pending/rejected/not_requested", () => {
    const ds = [
      drw({ id: "a", approvalStatus: "approved" }),
      drw({ id: "b", approvalStatus: "locked" }),
      drw({ id: "c", approvalStatus: "pending" }),
      drw({ id: "d", approvalStatus: "rejected" }),
      drw({ id: "e", approvalStatus: "not_requested" }),
    ];
    expect(approvedDrawings(ds).map(d => d.id)).toEqual(["a", "b"]);
  });
});

describe("buildActivityFeed", () => {
  it("merges updates + logs, sorts newest-first, prefixes ids and maps kinds", () => {
    const feed = buildActivityFeed(
      [upd({ id: "u1", createdAt: "2026-08-11T10:00:00Z" })],
      [{ id: "a1", action: "Created invoice INV-002", detail: "Net 50,000", byName: "Rajesh", createdAt: "2026-08-12T08:00:00Z" }],
    );
    expect(feed.length).toBe(2);
    expect(feed[0]).toMatchObject({ id: "a-a1", kind: "log", title: "Created invoice INV-002", byName: "Rajesh" });
    expect(feed[1]).toMatchObject({ id: "u-u1", kind: "update", body: "RCC casting done", byName: "Rajesh" });
  });
  it("caps the feed at 30 rows", () => {
    const updates = Array.from({ length: 20 }, (_, i) => upd({ id: `u${i}`, createdAt: `2026-08-0${(i % 9) + 1}T00:00:00Z` }));
    const logs = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, action: "x", detail: "", byName: null, createdAt: `2026-08-${String(i % 28 + 1).padStart(2, "0")}T00:00:00Z` }));
    expect(buildActivityFeed(updates, logs).length).toBe(30);
  });
});

describe("getClientProject mapper", () => {
  it("queries by id + client email and maps the header", async () => {
    const calls: string[] = [];
    const client = {
      from: (t: string) => {
        calls.push(t);
        return {
          select: () => ({
            eq: (k: string) => {
              calls.push(`eq:${k}`);
              return {
                eq: (k2: string) => {
                  calls.push(`eq:${k2}`);
                  return {
                    maybeSingle: () => Promise.resolve({ error: null, data: { id: "p1", name: "Villa", type: "construction", status: "active", location: "Gachibowli", progress: 40, client_name: "Ana", description: "D", expected_end_date: "2027-01-01" } }),
                  };
                },
              };
            },
          }),
        };
      },
    };
    const res = await getClientProject(client as never, "p1", "ana@test.in");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(calls).toEqual(["projects", "eq:id", "eq:client_email"]);
    expect(res.data).toMatchObject({ id: "p1", name: "Villa", progress: 40, expectedEndDate: "2027-01-01" });
  });
  it("returns not-found error when project is null", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ error: null, data: null }) }) }) }) }) };
    const res = await getClientProject(client as never, "p1", "ana@test.in");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("not assigned");
  });
  it("surfaces DB errors", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ error: { message: "boom" }, data: null }) }) }) }) }) };
    const res = await getClientProject(client as never, "p1", "ana@test.in");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });
});

describe("listClientInvoices mapper", () => {
  it("maps invoices with embedded payments + computed net/received/outstanding/status", async () => {
    const chain = { order: () => Promise.resolve({ error: null, data: [
      { id: "i1", no: "INV-001", amount: 100000, gst: 18000, tds: 2000, status: "sent", issued_date: "2026-08-01",
        payments: [{ id: "p1", amount: 40000, method: "bank", received_on: "2026-08-05", reference: "R1" }] },
    ] }) };
    const client = { from: () => ({ select: () => ({ eq: () => chain }) }) };
    const res = await listClientInvoices(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({
      no: "INV-001", netReceivable: 116000, received: 40000, outstanding: 76000, paymentStatus: "partial",
    });
    expect(res.data[0].payments[0]).toMatchObject({ amount: 40000, method: "bank", reference: "R1" });
  });
  it("surfaces DB errors", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ error: { message: "denied" }, data: null }) }) }) }) };
    const res = await listClientInvoices(client as never, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });
});

describe("listClientMilestones mapper", () => {
  it("maps milestones and orders by due date", async () => {
    const chain = { order: () => Promise.resolve({ error: null, data: [{ id: "m1", title: "Foundation", status: "pending", due_date: "2026-09-01", completed_date: null }] }) };
    const client = { from: () => ({ select: () => ({ eq: () => chain }) }) };
    const res = await listClientMilestones(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ title: "Foundation", status: "pending", dueDate: "2026-09-01" });
  });
});

describe("listClientDrawings mapper", () => {
  it("selects current + released_to client and maps approval status", async () => {
    const calls: string[] = [];
    const client = { from: () => ({
      select: () => ({
        eq: (k: string) => {
          calls.push(`eq:${k}`);
          return {
            eq: (k2: string) => {
              calls.push(`eq:${k2}`);
              return {
                contains: (k2b: string, v: string[]) => {
                  calls.push(`contains:${k2b}:${v.join(",")}`);
                  return {
                    order: () => Promise.resolve({ error: null, data: [{ id: "d1", title: "G+1 Plan", type: "architectural", revision: "Rev A", notes: "n", release_date: "2026-08-10", approval_status: "approved", preview_url: null }] }),
                  };
                },
              };
            },
          };
        },
      }),
    }) };
    const res = await listClientDrawings(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(calls).toEqual(["eq:project_id", "eq:status", "contains:released_to:client"]);
    expect(res.data[0]).toMatchObject({ title: "G+1 Plan", approvalStatus: "approved" });
  });
  it("coerces missing approval status to not_requested", async () => {
    const client = { from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            contains: () => ({
              order: () => Promise.resolve({ error: null, data: [{ id: "d1", title: "T", type: "t", revision: "Rev A", notes: null, release_date: null, approval_status: null, preview_url: null }] }),
            }),
          }),
        }),
      }),
    }) };
    const res = await listClientDrawings(client as never, "p1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0].approvalStatus).toBe("not_requested");
  });
});

describe("listClientUpdates mapper", () => {
  it("maps site updates with author name embed", async () => {
    const chain = { order: () => ({ limit: () => Promise.resolve({ error: null, data: [{ id: "u1", notes: "RCC done", weather: "sunny", workers_count: 24, update_date: "2026-08-11", created_at: "2026-08-11T10:00:00Z", author: { name: "Rajesh" } }] }) }) };
    const client = { from: () => ({ select: () => ({ eq: () => chain }) }) };
    const res = await listClientUpdates(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ notes: "RCC done", weather: "sunny", workersCount: 24, authorName: "Rajesh" });
  });
});

describe("listClientActivity mapper", () => {
  it("maps activity_log rows", async () => {
    const chain = { order: () => ({ limit: () => Promise.resolve({ error: null, data: [{ id: "a1", action: "Created invoice", detail: "d", by_name: "Ana", created_at: "2026-08-12T08:00:00Z" }] }) }) };
    const client = { from: () => ({ select: () => ({ eq: () => chain }) }) };
    const res = await listClientActivity(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ id: "a1", action: "Created invoice", detail: "d", byName: "Ana" });
  });
  it("surfaces DB errors", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ error: { message: "denied" }, data: null }) }) }) }) }) };
    const res = await listClientActivity(client as never, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });
});