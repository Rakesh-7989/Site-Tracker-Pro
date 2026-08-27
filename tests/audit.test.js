import { describe, it, expect } from "vitest";
import { recordAudit, filterAudit, exportAuditCsv, auditSummary, auditStats } from "../src/lib/integrations/audit";

const actor = { id: "u1", name: "Ramesh", role: "architect", org_id: "org1" };

describe("audit.recordAudit", () => {
  it("appends new row at the front (newest first)", () => {
    let log = [];
    log = recordAudit(log, { actor, action: "APPROVE", resource: "ra_bill", resource_id: "ra_42" });
    log = recordAudit(log, { actor, action: "RELEASE", resource: "drawing", resource_id: "d_7" });
    expect(log).toHaveLength(2);
    expect(log[0].action).toBe("RELEASE");
    expect(log[1].action).toBe("APPROVE");
  });

  it("fills timestamps and id automatically", () => {
    const log = recordAudit([], { actor, action: "CREATE", resource: "project" });
    expect(log[0].id).toMatch(/^a_/);
    expect(log[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(log[0].actor_name).toBe("Ramesh");
    expect(log[0].actor_role).toBe("architect");
  });

  it("treats a non-array as fresh empty log", () => {
    expect(recordAudit(null, { actor, action: "CREATE", resource: "project" })).toHaveLength(1);
  });
});

describe("audit.filterAudit", () => {
  const log = [
    { ts: "2026-05-24T10:00:00Z", actor_id: "u1", actor_name: "Ramesh", action: "APPROVE",  resource: "ra_bill",  resource_id: "ra_1", project_id: "p1", message: "Approved bill" },
    { ts: "2026-05-25T09:00:00Z", actor_id: "u2", actor_name: "Suresh", action: "RELEASE",  resource: "drawing",  resource_id: "d_1", project_id: "p1", message: "Released revA" },
    { ts: "2026-05-25T10:30:00Z", actor_id: "u1", actor_name: "Ramesh", action: "REJECT",   resource: "ra_bill",  resource_id: "ra_2", project_id: "p2", message: "Bill mismatch" },
  ];

  it("filters by actor", () => {
    expect(filterAudit(log, { actor_id: "u1" })).toHaveLength(2);
  });

  it("filters by action", () => {
    expect(filterAudit(log, { action: "RELEASE" })).toHaveLength(1);
  });

  it("filters by date range", () => {
    expect(filterAudit(log, { from: "2026-05-25T00:00:00Z" })).toHaveLength(2);
  });

  it("free-text search across actor + message + resource_id", () => {
    expect(filterAudit(log, { q: "revA" })).toHaveLength(1);
    expect(filterAudit(log, { q: "ramesh" })).toHaveLength(2);
  });
});

describe("audit.exportAuditCsv", () => {
  it("returns header + one row per entry", () => {
    const log = [
      { ts: "2026-05-25T10:00:00Z", actor_name: "Ramesh", actor_role: "architect", action: "APPROVE", resource: "ra_bill", resource_id: "ra_1", project_id: "p1", message: "OK" },
    ];
    const csv = exportAuditCsv(log);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Timestamp");
    expect(lines[1]).toContain("Ramesh");
  });

  it("returns empty string when no rows", () => {
    expect(exportAuditCsv([])).toBe("");
  });
});

describe("audit.auditSummary", () => {
  it("formats actor + action + resource", () => {
    const s = auditSummary({ actor_name: "Ramesh", action: "APPROVE", resource: "ra_bill", resource_id: "ra_1", message: "OK" });
    expect(s).toContain("Ramesh");
    expect(s).toContain("approve");
    expect(s).toContain("ra_bill");
  });
});

describe("audit.auditStats", () => {
  it("counts total, by action, by actor", () => {
    const now = new Date().toISOString();
    const log = [
      { ts: now, action: "APPROVE", actor_name: "Ramesh" },
      { ts: now, action: "APPROVE", actor_name: "Ramesh" },
      { ts: now, action: "REJECT",  actor_name: "Suresh" },
    ];
    const s = auditStats(log);
    expect(s.total).toBe(3);
    expect(s.byAction.APPROVE).toBe(2);
    expect(s.byActor.Ramesh).toBe(2);
    expect(s.recent).toBe(3);
  });
});
