// ST BOQ/Estimate depth — estimateBuildUp / estimatePayload / nextEstimateVersion / buildUpLine.
import { describe, it, expect } from "vitest";
import { estimateBuildUp, estimatePayload, nextEstimateVersion, type Estimate, type EstimateBuildUp, type EstimateBuildUpInput } from "@/app/designQueries";
import { buildUpLine } from "@/features/project/tabs/EstimateTab";

const build = (baseAmount: number, p: Partial<EstimateBuildUpInput> = {}): EstimateBuildUp => estimateBuildUp({ baseAmount, ...p });

describe("estimateBuildUp (ST BOQ/Estimate depth)", () => {
  it("is neutral with zero percentages", () => {
    const up = build(1_000_000);
    expect(up.markup).toBe(0);
    expect(up.overhead).toBe(0);
    expect(up.contingency).toBe(0);
    expect(up.subtotal).toBe(1_000_000);
    expect(up.gst).toBe(0);
    expect(up.total).toBe(1_000_000);
  });

  it("builds base → markup → overhead → contingency → subtotal → GST → total", () => {
    const up = build(1_000_000, { markupPct: 10, overheadPct: 5, contingencyPct: 5, gstPct: 18 });
    expect(up.markup).toBe(100_000);
    expect(up.overhead).toBe(50_000);
    expect(up.contingency).toBe(50_000);
    expect(up.subtotal).toBe(1_200_000);
    expect(up.gst).toBe(216_000);
    expect(up.total).toBe(1_416_000);
  });

  it("rounds each component to 2dp", () => {
    const up = build(999, { markupPct: 10 });
    expect(up.markup).toBe(99.9);
    expect(up.total).toBe(1098.9);
  });

  it("coerces missing/NaN percentages to 0", () => {
    const up = estimateBuildUp({ baseAmount: 100, markupPct: Number.NaN, overheadPct: undefined, contingencyPct: Number.NaN, gstPct: undefined as unknown as number });
    expect(up.total).toBe(100);
  });

  it("handles a zero base", () => {
    const up = build(0, { markupPct: 10, gstPct: 18 });
    expect(up.total).toBe(0);
  });

  it("estimatePayload round-trips the build-up inputs", () => {
    const up = build(1_000_000, { markupPct: 10, overheadPct: 5, contingencyPct: 5, gstPct: 18 });
    const payload = estimatePayload(up);
    expect(payload).toEqual({ baseAmount: 1_000_000, markupPct: 10, overheadPct: 5, contingencyPct: 5, gstPct: 18 });
  });
});

describe("nextEstimateVersion (ST BOQ/Estimate depth)", () => {
  const row = (name: string, version: number): Estimate => ({ id: "x", name, version, totalAmount: 1, status: "draft", baseAmount: null, markupPct: 0, overheadPct: 0, contingencyPct: 0, gstPct: 0 });

  it("starts at 1 for a fresh name", () => {
    expect(nextEstimateVersion([], "Quote")).toBe(1);
  });

  it("bumps per existing same-name max version", () => {
    expect(nextEstimateVersion([row("Quote", 1), row("Quote", 2), row("Other", 1)], "Quote")).toBe(3);
  });

  it("ignores other names", () => {
    expect(nextEstimateVersion([row("Other", 9)], "Quote")).toBe(1);
  });
});

describe("buildUpLine (ST BOQ/Estimate depth)", () => {
  it("renders a compact breakdown with pcts and base", () => {
    const up = build(1_000_000, { markupPct: 10, overheadPct: 5, contingencyPct: 5, gstPct: 18 });
    const line = buildUpLine(up);
    expect(line).toContain("₹10,00,000");
    expect(line).toContain("+10%");
    expect(line).toContain("+5% OH");
    expect(line).toContain("GST 18%");
  });
});
