// SiteTrack Pro — v5 Phase B2: Client Portal depth query tests.
// Pure helpers (payment rollup, upcoming milestones, approved drawings,
// activity feed) + the injected-client query mappers.

import { describe, it, expect } from "vitest";
import {
  clientPaymentRollup, upcomingMilestones, approvedDrawings, buildActivityFeed,
  getClientProject, listClientProjects, listClientInvoices, listClientMilestones, listClientDrawings,
  listClientUpdates, listClientActivity,
  type ClientInvoice, type ClientMilestone, type ClientDrawing, type ClientUpdate,
} from "@/app/clientPortalQueries";

function inv(overrides: Partial<ClientInvoice> = {}): ClientInvoice {
  return {
    id: "i1", no: "INV-001", amount: 100000, gst: 18, tds: 2, status: "sent",
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
  function invoicesClient(overrides: { invoices?: Record<string, unknown>[]; payments?: Record<string, unknown>[] } = {}) {
    const tableData: Record<string, Record<string, unknown>[]> = {
      invoices: [
        { id: "i1", no: "INV-001", amount: 100000, gst: 18, tds: 2, status: "sent", issued_date: "2026-08-01" },
      ],
      payments: [
        { target_id: "i1", amount: 40000, method: "bank", received_on: "2026-08-05", reference: "R1" },
      ],
      ...(overrides.invoices ? { invoices: overrides.invoices } : {}),
      ...(overrides.payments ? { payments: overrides.payments } : {}),
    };
    const calls: string[] = [];
    const client = {
      from: (t: string) => {
        calls.push(`from:${t}`);
        const rows = tableData[t] ?? [];
        return {
          select: () => ({
            eq: (_k: string) => ({
              in: (k2: string, ids: string[]) => {
                calls.push(`in:${k2}`);
                const filtered = rows.filter((r: Record<string, unknown>) => ids.includes(String(r.target_id ?? r.id)));
                return Promise.resolve({ error: null, data: filtered });
              },
              order: () => Promise.resolve({ error: null, data: rows }),
            }),
          }),
        };
      },
    };
    return { client, calls };
  }

  it("fetches payments polymorphically and maps net/received/outstanding/status", async () => {
    const { client, calls } = invoicesClient();
    const res = await listClientInvoices(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(calls).toEqual(["from:invoices", "from:payments", "in:target_id"]);
    expect(res.data[0]).toMatchObject({
      no: "INV-001", netReceivable: 116000, received: 40000, outstanding: 76000, paymentStatus: "partial",
    });
    expect(res.data[0].payments[0]).toMatchObject({ amount: 40000, method: "bank", reference: "R1" });
  });
  it("maps zero payments to received 0 and the issued-date-derived status", async () => {
    const { client } = invoicesClient({ payments: [] });
    const res = await listClientInvoices(client as never, "p1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]).toMatchObject({ received: 0, outstanding: 116000, payments: [] });
    expect(res.data[0].paymentStatus).toBe("overdue");
  });
  it("surfaces DB errors on invoices", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ error: { message: "denied" }, data: null }) }) }) }) };
    const res = await listClientInvoices(client as never, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });
  it("surfaces DB errors on payments", async () => {
    const invoices = () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ error: null, data: [{ id: "i1" }] }) }) }) });
    const payments = () => ({ select: () => ({ eq: () => ({ in: () => Promise.resolve({ error: { message: "denied2" }, data: null }) }) }) });
    const client = { from: (t: string) => (t === "payments" ? payments() : invoices()) };
    const res = await listClientInvoices(client as never, "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied2");
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

// SEC-08 (phase 1.4): every client-portal read is hard-scoped to the caller's
// email-matched project — a source-contract lock so the surface can never
// broaden into cross-project reads.
describe("client portal query isolation (SEC-08)", () => {
  function recordingClient() {
    const calls: string[] = [];
    const chain = {
      select: () => chain,
      eq: (k: string, v: unknown) => { calls.push(`eq:${k}:${String(v)}`); return chain; },
      contains: (k: string, v: unknown[]) => { calls.push(`contains:${k}:${v.join(",")}`); return chain; },
      in: (k: string, v: unknown[]) => { calls.push(`in:${k}:${(v as string[]).length}`); return Promise.resolve({ error: null, data: [] }); },
      maybeSingle: () => Promise.resolve({ error: null, data: null }),
      order: () => Promise.resolve({ error: null, data: [] }),
    };
    const client = { from: (_t: string) => ({ ...chain, select: () => chain }) };
    return { client, calls };
  }

  it("listClientProjects is filtered by the caller's email only", async () => {
    const { client, calls } = recordingClient();
    await listClientProjects(client as never, "client@x.in");
    expect(calls).toEqual(["eq:client_email:client@x.in"]);
  });

  it("getClientProject requires BOTH the project id and the caller's email", async () => {
    const { client, calls } = recordingClient();
    await getClientProject(client as never, "p-1", "client@x.in");
    expect(calls).toEqual(["eq:id:p-1", "eq:client_email:client@x.in"]);
  });

  it("every child-table read is scoped to .eq('project_id', projectId)", async () => {
    for (const fn of [listClientInvoices, listClientMilestones, listClientDrawings, listClientUpdates, listClientActivity]) {
      const { client, calls } = recordingClient();
      await fn(client as never, "p-1");
      expect(calls.some(c => c === "eq:project_id:p-1")).toBe(true);
    }
  });
});