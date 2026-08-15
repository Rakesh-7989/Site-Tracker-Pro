import { describe, it, expect } from "vitest";
import type { ProjectSummary } from "@/app/queries";
import {
  projectRollup,
  filterProjects,
  sortProjects,
  PROJECT_SORT_KEYS,
} from "@/lib/projectList";

function mk(partial: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: partial.id ?? "p1",
    name: partial.name ?? "Project",
    type: partial.type ?? "construction",
    status: "status" in partial ? (partial.status ?? null) : "active",
    location: "location" in partial ? (partial.location ?? null) : null,
    archivedAt: "archivedAt" in partial ? (partial.archivedAt ?? null) : null,
    progress: partial.progress ?? 0,
    budget: "budget" in partial ? (partial.budget ?? null) : null,
    startDate: "startDate" in partial ? (partial.startDate ?? null) : null,
    expectedEndDate: "expectedEndDate" in partial ? (partial.expectedEndDate ?? null) : null,
    clientName: "clientName" in partial ? (partial.clientName ?? null) : null,
    description: "description" in partial ? (partial.description ?? null) : null,
  };
}

const FIXTURE: ProjectSummary[] = [
  mk({ id: "a", name: "Alpha Villa", status: "active", budget: 5_000_000, progress: 40, location: "Hyderabad", clientName: "Rakesh", startDate: "2026-01-01" }),
  mk({ id: "b", name: "Beta Tower", status: "paused", budget: 20_000_000, progress: 20, location: "Bengaluru", clientName: "Sai", startDate: "2026-02-01" }),
  mk({ id: "c", name: "Gamma Row", status: "on_hold", budget: 3_000_000, progress: 60, location: "Chennai", clientName: "Chandu", startDate: "2026-03-01" }),
  mk({ id: "d", name: "Delta House", status: "deactivated", budget: null, progress: 10, location: null, clientName: null, startDate: null }),
  mk({ id: "e", name: "Epsilon Yard", status: "completed", budget: 8_000_000, progress: 100, location: "Hyderabad", clientName: "Rakesh", startDate: "2025-12-01" }),
  mk({ id: "f", name: "Zeta Court", status: "cancelled", budget: 2_000_000, progress: 0, location: "Pune", clientName: null, startDate: null }),
  mk({ id: "g", name: "Eta Arch (archived)", status: "active", archivedAt: "2026-08-01", budget: 99_000_000, progress: 50, location: "Goa", clientName: null, startDate: null }),
  mk({ id: "h", name: "Theta Labs", status: null, progress: 5, budget: 1_000_000 }),
];

describe("projectRollup", () => {
  it("counts each lifecycle bucket and excludes archived from totals", () => {
    const r = projectRollup(FIXTURE);
    expect(r.total).toBe(7); // g archived excluded
    expect(r.active).toBe(1); // a live; g is archived
    expect(r.paused).toBe(1);
    expect(r.onHold).toBe(1);
    expect(r.deactivated).toBe(1);
    expect(r.completed).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.archived).toBe(1);
  });

  it("sums live budgets, skipping archived + null/NaN", () => {
    const r = projectRollup(FIXTURE);
    expect(r.totalBudget).toBe(5e6 + 20e6 + 3e6 + 8e6 + 2e6 + 1e6);
  });

  it("returns all-zero for an empty list", () => {
    const r = projectRollup([]);
    expect(r).toEqual({
      total: 0, active: 0, paused: 0, onHold: 0, deactivated: 0,
      completed: 0, cancelled: 0, archived: 0, totalBudget: 0,
    });
  });
});

describe("filterProjects", () => {
  it("returns input unchanged for empty/whitespace query", () => {
    expect(filterProjects(FIXTURE, "")).toBe(FIXTURE);
    expect(filterProjects(FIXTURE, "   ")).toBe(FIXTURE);
  });

  it("matches name case-insensitively", () => {
    const out = filterProjects(FIXTURE, "beta");
    expect(out.map(p => p.id)).toEqual(["b"]);
    expect(filterProjects(FIXTURE, "ALPHA").map(p => p.id)).toEqual(["a"]);
  });

  it("matches location and client name", () => {
    expect(filterProjects(FIXTURE, "hyder").map(p => p.id)).toEqual(["a", "e"]);
    expect(filterProjects(FIXTURE, "chandu").map(p => p.id)).toEqual(["c"]);
  });

  it("matches description", () => {
    const d = mk({ id: "x", name: "X", description: "High-rise redevelopment" });
    expect(filterProjects([d], "redevelopment").map(p => p.id)).toEqual(["x"]);
    expect(filterProjects([d], "nope")).toEqual([]);
  });
});

describe("sortProjects", () => {
  it("sorts by name asc/desc (case-insensitive)", () => {
    const asc = sortProjects(FIXTURE, "name");
    expect(asc[0].id).toBe("a"); // Alpha
    expect(asc[asc.length - 1].id).toBe("f"); // Zeta
    const desc = sortProjects(FIXTURE, "name", "desc");
    expect(desc[0].id).toBe("f"); // Zeta
    expect(desc[desc.length - 1].id).toBe("a"); // Alpha
  });

  it("sorts by progress asc/desc", () => {
    const asc = sortProjects(FIXTURE, "progress");
    expect(asc[0].progress).toBe(0);
    expect(asc[asc.length - 1].progress).toBe(100);
    const desc = sortProjects(FIXTURE, "progress", "desc");
    expect(desc[0].progress).toBe(100);
  });

  it("sorts by budget, treating null as 0", () => {
    const asc = sortProjects(FIXTURE, "budget");
    expect(asc[0].budget).toBeNull(); // d has null
    expect(asc[1].budget).toBe(1_000_000); // h
    const desc = sortProjects(FIXTURE, "budget", "desc");
    expect(desc[0].budget).toBe(99_000_000); // g archived still sorts by budget
    expect(desc[1].budget).toBe(20_000_000);
  });

  it("sorts by status, null/unknown first", () => {
    const asc = sortProjects(FIXTURE, "status");
    expect(asc[0].status).toBeNull(); // h
    expect(asc[1].status).toBe("active"); // a (g archived still active)
  });

  it("sorts by startDate asc/desc, nulls first on asc", () => {
    const asc = sortProjects(FIXTURE, "startDate");
    expect(asc[0].startDate).toBeNull();
    expect(asc[asc.length - 1].startDate).toBe("2026-03-01");
    const desc = sortProjects(FIXTURE, "startDate", "desc");
    expect(desc[0].startDate).toBe("2026-03-01");
  });

  it("does not mutate the input array", () => {
    const before = FIXTURE.map(p => p.id).join(",");
    sortProjects(FIXTURE, "budget", "desc");
    expect(FIXTURE.map(p => p.id).join(",")).toBe(before);
  });
});

describe("PROJECT_SORT_KEYS", () => {
  it("has a label for every key and no duplicates", () => {
    const keys = PROJECT_SORT_KEYS.map(k => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const { key, label } of PROJECT_SORT_KEYS) {
      expect(label.length).toBeGreaterThan(0);
      expect(["name", "status", "location", "progress", "budget", "startDate"]).toContain(key);
    }
  });
});
