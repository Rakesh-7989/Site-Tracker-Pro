import { describe, it, expect } from "vitest";
import { computePartnerCoordination, coordinationLevel } from "@/app/engines/partnerCoordination";

describe("computePartnerCoordination", () => {
  it("returns 0 when nothing is pending", () => {
    const r = computePartnerCoordination({ pendingDrawings: 0, openTasks: 0, openIssues: 0 });
    expect(r.score).toBe(0);
    expect(r.signals).toHaveLength(0);
    expect(coordinationLevel(r.score)).toBe("low");
  });

  it("emits design-blocking when pending drawings block open tasks", () => {
    const r = computePartnerCoordination({ pendingDrawings: 2, openTasks: 4, openIssues: 1 });
    expect(r.signals.some(s => s.code === "design-blocking")).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(20);
  });

  it("high severity design-blocking when 3+ pending or 5+ tasks", () => {
    const r = computePartnerCoordination({ pendingDrawings: 3, openTasks: 5, openIssues: 0 });
    const s = r.signals.find(x => x.code === "design-blocking");
    expect(s?.severity).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(35);
  });

  it("site-pileup when many tasks/issues", () => {
    const r = computePartnerCoordination({ pendingDrawings: 0, openTasks: 8, openIssues: 0 });
    expect(r.signals.some(s => s.code === "site-pileup")).toBe(true);
  });

  it("idle-partner when no updates for >7 days", () => {
    const r = computePartnerCoordination({ pendingDrawings: 1, openTasks: 1, openIssues: 0, daysSinceLastUpdate: 10 });
    expect(r.signals.some(s => s.code === "idle-partner")).toBe(true);
  });

  it("FFE pending triggers review-lag", () => {
    const r = computePartnerCoordination({ pendingDrawings: 0, openTasks: 0, openIssues: 0, pendingFfe: 6 });
    expect(r.signals.some(s => s.detail.includes("FF&E"))).toBe(true);
  });

  it("caps at 100", () => {
    const r = computePartnerCoordination({ pendingDrawings: 10, openTasks: 20, openIssues: 10, pendingFfe: 20, daysSinceLastUpdate: 30 });
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("coordinationLevel bands", () => {
    expect(coordinationLevel(10)).toBe("low");
    expect(coordinationLevel(30)).toBe("medium");
    expect(coordinationLevel(50)).toBe("high");
    expect(coordinationLevel(80)).toBe("critical");
  });
});
