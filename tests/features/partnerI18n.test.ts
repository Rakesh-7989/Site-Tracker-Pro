import { describe, it, expect } from "vitest";
import { sigParts, partnerLevelKey } from "@/features/project/PartnerRiskCard";
import { computePartnerCoordination, type CoordinationSignal } from "@/app/engines/partnerCoordination";

describe("sigParts", () => {
  it("maps design-blocking to keyed parts with the raw counts", () => {
    const r = computePartnerCoordination({ pendingDrawings: 2, openTasks: 4, openIssues: 1 });
    const s = r.signals.find(x => x.code === "design-blocking");
    expect(s).toBeDefined();
    const p = sigParts(s!, { pendingDrawings: 2, openTasks: 4, openIssues: 1 });
    expect(p.titleKey).toBe("partner.sigDesignBlockingTitle");
    expect(p.detailKey).toBe("partner.sigDesignBlockingDetail");
    expect(p.args).toEqual({ drawings: 2, tasks: 4, issues: 1 });
  });

  it("maps review-lag to the drawings variant", () => {
    const s: CoordinationSignal = { code: "review-lag", variant: "drawings", severity: "medium", title: "", detail: "" };
    const p = sigParts(s, { pendingDrawings: 3, openTasks: 0, openIssues: 0 });
    expect(p.titleKey).toBe("partner.sigReviewLagTitle");
    expect(p.detailKey).toBe("partner.sigReviewLagDetail");
    expect(p.args).toEqual({ drawings: 3 });
  });

  it("maps review-lag to the ffe variant", () => {
    const s: CoordinationSignal = { code: "review-lag", variant: "ffe", severity: "low", title: "", detail: "" };
    const p = sigParts(s, { pendingDrawings: 0, openTasks: 0, openIssues: 0, pendingFfe: 6 });
    expect(p.titleKey).toBe("partner.sigFfeTitle");
    expect(p.detailKey).toBe("partner.sigFfeDetail");
    expect(p.args).toEqual({ ffe: 6 });
  });

  it("review-lag without a variant defaults to the drawings keys", () => {
    const s: CoordinationSignal = { code: "review-lag", severity: "medium", title: "", detail: "" };
    const p = sigParts(s, { pendingDrawings: 1, openTasks: 0, openIssues: 0 });
    expect(p.titleKey).toBe("partner.sigReviewLagTitle");
    expect(p.args).toEqual({ drawings: 1 });
  });

  it("maps site-pileup keys and args", () => {
    const s: CoordinationSignal = { code: "site-pileup", severity: "medium", title: "", detail: "" };
    const p = sigParts(s, { pendingDrawings: 0, openTasks: 8, openIssues: 2 });
    expect(p.titleKey).toBe("partner.sigSitePileupTitle");
    expect(p.detailKey).toBe("partner.sigSitePileupDetail");
    expect(p.args).toEqual({ tasks: 8, issues: 2 });
  });

  it("maps idle-partner with days + summed open items", () => {
    const s: CoordinationSignal = { code: "idle-partner", severity: "medium", title: "", detail: "" };
    const p = sigParts(s, { pendingDrawings: 2, openTasks: 1, openIssues: 3, daysSinceLastUpdate: 10 });
    expect(p.titleKey).toBe("partner.sigIdleTitle");
    expect(p.detailKey).toBe("partner.sigIdleDetail");
    expect(p.args).toEqual({ days: 10, items: 6 });
  });

  it("idle-partner falls back days to 0 when the input has no update date", () => {
    const s: CoordinationSignal = { code: "idle-partner", severity: "medium", title: "", detail: "" };
    const p = sigParts(s, { pendingDrawings: 0, openTasks: 0, openIssues: 0, daysSinceLastUpdate: null });
    expect(p.args).toEqual({ days: 0, items: 0 });
  });
});

describe("partnerLevelKey", () => {
  it("maps the four bands to flat partner keys", () => {
    expect(partnerLevelKey("low")).toBe("partner.levelLow");
    expect(partnerLevelKey("medium")).toBe("partner.levelMedium");
    expect(partnerLevelKey("high")).toBe("partner.levelHigh");
    expect(partnerLevelKey("critical")).toBe("partner.levelCritical");
  });

  it("falls back to the raw value for unknown levels", () => {
    expect(partnerLevelKey("unknown")).toBe("unknown");
  });
});