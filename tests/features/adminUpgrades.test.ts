import { describe, it, expect } from "vitest";
import {
  upgradeSummary,
  STATUS_TONE,
  STATUS_LABEL,
  UPGRADE_CSV_COLUMNS,
} from "@/features/admin/UpgradeRequestsView";
import type { UpgradeRequest } from "@/app/upgradeQueries";

const row = (over: Partial<UpgradeRequest>): UpgradeRequest => ({
  id: "u1", orgId: "o1", orgName: "Acme", requesterEmail: "a@b.co", currentPlan: "basic",
  desiredPlan: "pro", note: null, status: "open", assignedStaffId: null, assignedEmail: null,
  resolutionNote: null, createdAt: "2026-08-13T10:00:00Z", updatedAt: "2026-08-13T10:00:00Z", ...over,
});

describe("upgradeSummary", () => {
  it("rolls up the loaded page by status + openTotal", () => {
    const s = upgradeSummary([
      row({ id: "a", status: "open" }),
      row({ id: "b", status: "open" }),
      row({ id: "c", status: "in_progress" }),
      row({ id: "d", status: "closed" }),
      row({ id: "e", status: "in_progress" }),
    ]);
    expect(s).toEqual({ open: 2, inProgress: 2, closed: 1, openTotal: 4 });
  });

  it("returns zero buckets on an empty page", () => {
    expect(upgradeSummary([])).toEqual({ open: 0, inProgress: 0, closed: 0, openTotal: 0 });
  });
});

describe("status maps", () => {
  it("labels all three statuses", () => {
    expect(STATUS_LABEL.open).toBe("Open");
    expect(STATUS_LABEL.in_progress).toBe("In progress");
    expect(STATUS_LABEL.closed).toBe("Closed");
  });

  it("tones open warning / in_progress info / closed success", () => {
    expect(STATUS_TONE.open).toBe("warning");
    expect(STATUS_TONE.in_progress).toBe("info");
    expect(STATUS_TONE.closed).toBe("success");
  });
});

describe("UPGRADE_CSV_COLUMNS", () => {
  it("covers the request's raw fields for export", () => {
    const keys = UPGRADE_CSV_COLUMNS.map(c => c.key);
    expect(keys).toContain("orgName");
    expect(keys).toContain("currentPlan");
    expect(keys).toContain("desiredPlan");
    expect(keys).toContain("status");
    expect(keys).toContain("assignedEmail");
    expect(keys).toContain("createdAt");
    expect(UPGRADE_CSV_COLUMNS.length).toBeGreaterThanOrEqual(8);
  });
});