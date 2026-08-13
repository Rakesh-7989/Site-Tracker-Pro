import { describe, it, expect } from "vitest";
import {
  ticketSummary,
  fmtTime,
  TICKET_CSV_COLUMNS,
} from "@/features/admin/PlatformSupportView";
import type { Ticket } from "@/app/platformSupportQueries";

const ticket = (over: Partial<Ticket>): Ticket => ({
  id: "t1", subject: "Billing issue", body: "Help", from: "Rakesh", email: "r@b.co",
  status: "open", created: "2026-08-13T10:00:00Z", org_id: "o1", ...over,
});

describe("ticketSummary", () => {
  it("rolls up open / replied / closed + total", () => {
    const s = ticketSummary([
      ticket({ id: "a", status: "open" }),
      ticket({ id: "b", status: "open" }),
      ticket({ id: "c", status: "replied" }),
      ticket({ id: "d", status: "closed" }),
      ticket({ id: "e", status: "replied" }),
    ]);
    expect(s).toEqual({ open: 2, replied: 2, closed: 1, total: 5 });
  });

  it("returns zero buckets on an empty inbox", () => {
    expect(ticketSummary([])).toEqual({ open: 0, replied: 0, closed: 0, total: 0 });
  });
});

describe("fmtTime", () => {
  it("formats a valid ISO timestamp", () => {
    expect(fmtTime("2026-08-13T10:00:00Z")).toMatch(/13 Aug/i);
  });

  it("returns empty string on missing/blank input", () => {
    expect(fmtTime("")).toBe("");
  });
});

describe("TICKET_CSV_COLUMNS", () => {
  it("covers the ticket's raw fields for export", () => {
    const keys = TICKET_CSV_COLUMNS.map(c => c.key);
    expect(keys).toContain("subject");
    expect(keys).toContain("email");
    expect(keys).toContain("status");
    expect(keys).toContain("created");
    expect(keys).toContain("org_id");
    expect(TICKET_CSV_COLUMNS.length).toBeGreaterThanOrEqual(6);
  });
});