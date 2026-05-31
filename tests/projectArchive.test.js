import { describe, it, expect } from "vitest";
import {
  archiveProject, restoreProject, isArchived,
  daysSinceArchive, daysUntilPurge, isPurgeable,
  partitionByArchive, listPurgeCandidates, PURGE_AFTER_DAYS,
} from "../src/lib/projectArchive.js";

const projects = [
  { id: "p1", name: "Alpha", status: "active" },
  { id: "p2", name: "Beta",  status: "completed" },
  { id: "p3", name: "Gamma", status: "on_hold" },
];

describe("projectArchive — archive + restore", () => {
  it("archiveProject sets archived_at immutably", () => {
    const after = archiveProject(projects, "p2");
    expect(after.find(p => p.id === "p2").archived_at).toBeTruthy();
    expect(after.find(p => p.id === "p1").archived_at).toBeUndefined();
    expect(projects.find(p => p.id === "p2").archived_at).toBeUndefined(); // original untouched
  });
  it("restoreProject removes archived_at", () => {
    const archived = archiveProject(projects, "p2");
    const restored = restoreProject(archived, "p2");
    expect(restored.find(p => p.id === "p2").archived_at).toBeUndefined();
  });
  it("ignores unknown id", () => {
    expect(archiveProject(projects, "ghost")).toEqual(projects);
    expect(restoreProject(projects, "ghost")).toEqual(projects);
  });
  it("handles invalid inputs", () => {
    expect(archiveProject(null, "p1")).toEqual([]);
    expect(restoreProject(null, "p1")).toEqual([]);
  });
});

describe("projectArchive — isArchived + days helpers", () => {
  const NOW = new Date("2026-06-01T00:00:00Z");
  it("isArchived returns true when archived_at present", () => {
    expect(isArchived({ archived_at: "2026-05-01" })).toBe(true);
    expect(isArchived({ name: "live" })).toBe(false);
    expect(isArchived(null)).toBe(false);
  });
  it("daysSinceArchive counts whole days", () => {
    expect(daysSinceArchive({ archived_at: "2026-05-25T00:00:00Z" }, NOW)).toBe(7);
    expect(daysSinceArchive({ archived_at: NOW.toISOString() }, NOW)).toBe(0);
  });
  it("daysUntilPurge counts down from 90", () => {
    expect(daysUntilPurge({ archived_at: "2026-05-25T00:00:00Z" }, NOW)).toBe(PURGE_AFTER_DAYS - 7);
  });
  it("isPurgeable true when past the 90-day window", () => {
    expect(isPurgeable({ archived_at: "2026-02-01T00:00:00Z" }, NOW)).toBe(true);
    expect(isPurgeable({ archived_at: "2026-05-01T00:00:00Z" }, NOW)).toBe(false);
  });
  it("returns null for non-archived rows", () => {
    expect(daysSinceArchive({})).toBeNull();
    expect(daysUntilPurge({})).toBeNull();
    expect(isPurgeable({})).toBe(false);
  });
});

describe("projectArchive — partitionByArchive + listPurgeCandidates", () => {
  it("splits active vs archived", () => {
    const mixed = [...projects, { id: "p4", archived_at: "2026-05-01" }];
    const { active, archived } = partitionByArchive(mixed);
    expect(active.length).toBe(3);
    expect(archived.length).toBe(1);
    expect(archived[0].id).toBe("p4");
  });
  it("listPurgeCandidates returns only those past 90 days", () => {
    const NOW = new Date("2026-06-01T00:00:00Z");
    const mixed = [
      { id: "p1", archived_at: "2026-02-01" }, // 120 days — purge
      { id: "p2", archived_at: "2026-05-01" }, // 31 days — keep
      { id: "p3" }, // not archived
    ];
    const candidates = listPurgeCandidates(mixed, NOW);
    expect(candidates.length).toBe(1);
    expect(candidates[0].id).toBe("p1");
  });
  it("PURGE_AFTER_DAYS is the documented 90", () => {
    expect(PURGE_AFTER_DAYS).toBe(90);
  });
});
