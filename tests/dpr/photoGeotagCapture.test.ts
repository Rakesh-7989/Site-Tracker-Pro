import { describe, it, expect } from "vitest";
import { withinHyderabad } from "@/features/dpr/PhotoGeotagCapture";

describe("withinHyderabad", () => {
  it("accepts coords inside the Hyderabad bbox", () => {
    expect(withinHyderabad(17.4, 78.47)).toBe(true);
    expect(withinHyderabad(17.2, 78.2)).toBe(true);
    expect(withinHyderabad(17.65, 78.7)).toBe(true);
  });

  it("rejects coords outside the bbox", () => {
    expect(withinHyderabad(19.0, 78.5)).toBe(false);
    expect(withinHyderabad(17.4, 75.0)).toBe(false);
    expect(withinHyderabad(12.9, 77.6)).toBe(false);
  });

  it("returns null when a coord is missing", () => {
    expect(withinHyderabad(null, 78.5)).toBeNull();
    expect(withinHyderabad(17.4, null)).toBeNull();
    expect(withinHyderabad(null, null)).toBeNull();
  });
});
