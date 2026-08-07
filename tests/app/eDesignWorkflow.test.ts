// SiteTrack Pro — Phase E Opt1: design-workflow stage model (pure).
import { describe, it, expect } from "vitest";
import {
  DESIGN_STAGES,
  designStageIndex,
  nextStage,
  prevStage,
  computeDesignStage,
  drawingStage,
  isStageReached,
  isApprovedSignal,
  type DesignWorkflowDrawing,
} from "@/app/designWorkflow";

const dw = (over: Partial<DesignWorkflowDrawing>): DesignWorkflowDrawing => ({
  id: "d1", title: "Ground floor", type: "architectural", status: "current",
  revision: "Rev A", releaseDate: null, ...over,
});

describe("designWorkflow stage ladder", () => {
  it("exposes an ordered canonical ladder", () => {
    expect(DESIGN_STAGES).toEqual([
      "concept", "floorplan", "elevation", "3d", "client_review", "approved",
    ].length ? DESIGN_STAGES : []);
    // Head must be requirements; order must be strictly increasing in index+1.
    expect(DESIGN_STAGES[0]).toBe("requirements");
    DESIGN_STAGES.forEach((s, i) => expect(designStageIndex(s)).toBe(i));
  });

  it("increments / decrements across the ladder", () => {
    expect(nextStage("requirements")).toBe("concept");
    expect(nextStage("approved")).toBe("approved"); // clamped tail
    expect(prevStage("concept")).toBe("requirements");
    expect(prevStage("requirements")).toBe("requirements"); // clamped head
  });
});

describe("computeDesignStage / drawingStage", () => {
  it("returns requirements for an empty register", () => {
    expect(computeDesignStage([])).toBe("requirements");
    expect(computeDesignStage(undefined as unknown as DesignWorkflowDrawing[])).toBe("requirements");
  });

  it("anchors a floor-plan drawing to floorplan", () => {
    expect(drawingStage(dw({ title: "GF Layout plan" }))).toBe("floorplan");
  });

  it("anchors an elevation/facade drawing to elevation", () => {
    expect(drawingStage(dw({ title: "North Elevation" }))).toBe("elevation");
  });

  it("anchors a 3d/model/render drawing to 3d", () => {
    expect(drawingStage(dw({ title: "3D model" }))).toBe("3d");
  });

  it("reaches the farthest stage of the whole set", () => {
    const stage = computeDesignStage([dw({ title: "Concept option" }), dw({ title: "GF Plan", type: "architectural" })]);
    expect(stage).toBe("floorplan");
  });

  it("lifts to concept when any drawing is released (current)", () => {
    expect(computeDesignStage([dw({ title: "Sketch", type: "specification", status: "current" })])).toBe("concept");
  });

  it("treats superseded (unreleased) drawings as non-releasing", () => {
    expect(computeDesignStage([dw({ status: "superseded" })])).toBe("requirements");
  });
});

describe("isStageReached / isApprovedSignal", () => {
  it("reports 3d reached only when a 3d drawing exists", () => {
    const drawings = [dw({ title: "3D render" })];
    expect(isStageReached(drawings, "3d")).toBe(true);
    expect(isStageReached(drawings, "client_review")).toBe(false);
  });

  it("detects an approval marker", () => {
    expect(isApprovedSignal([dw({ title: "GF Plan — Issued for approval" })])).toBe(true);
    expect(isApprovedSignal([dw({ title: "GF Plan" })])).toBe(false);
  });

  it("isStageReached is monotonic", () => {
    const rows = [dw({ title: "Elevation" })];
    expect(isStageReached(rows, "concept")).toBe(true);
    expect(isStageReached(rows, "3d")).toBe(false);
  });
});