// SiteTrack Pro — Sprint 2 (Session 30.8) VoiceConfidenceBar tests.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import {
  VoiceConfidenceBar,
  VoiceConfidenceBarGallery,
  confidenceBand,
  CONFIDENCE_THRESHOLDS,
} from "../src/features/dpr/VoiceConfidenceBar.jsx";

const html = (jsx) => renderToStaticMarkup(jsx);

describe("confidenceBand()", () => {
  it("returns 'high' for confidence ≥ 0.95", () => {
    expect(confidenceBand(0.95)).toBe("high");
    expect(confidenceBand(0.99)).toBe("high");
    expect(confidenceBand(1.0)).toBe("high");
  });

  it("returns 'medium' for 0.85 ≤ confidence < 0.95", () => {
    expect(confidenceBand(0.85)).toBe("medium");
    expect(confidenceBand(0.89)).toBe("medium");
    expect(confidenceBand(0.94999)).toBe("medium");
  });

  it("returns 'low' for confidence < 0.85", () => {
    expect(confidenceBand(0.84)).toBe("low");
    expect(confidenceBand(0.5)).toBe("low");
    expect(confidenceBand(0)).toBe("low");
  });

  it("clamps and treats out-of-range / non-numeric as 'low'", () => {
    expect(confidenceBand(-0.5)).toBe("low");
    expect(confidenceBand(NaN)).toBe("low");
    expect(confidenceBand(undefined)).toBe("low");
    expect(confidenceBand("0.9")).toBe("low");   // string is not number
  });

  it("matches the CONFIDENCE_THRESHOLDS constants", () => {
    expect(CONFIDENCE_THRESHOLDS.high).toBe(0.95);
    expect(CONFIDENCE_THRESHOLDS.medium).toBe(0.85);
  });
});

describe("VoiceConfidenceBar — rendering", () => {
  it("renders progressbar with the right aria attributes", () => {
    const out = html(<VoiceConfidenceBar confidence={0.88} lang="en" />);
    expect(out).toMatch(/role="progressbar"/);
    expect(out).toMatch(/aria-valuenow="88"/);
    expect(out).toMatch(/aria-valuemin="0"/);
    expect(out).toMatch(/aria-valuemax="100"/);
  });

  it("renders 88% width for confidence=0.88", () => {
    const out = html(<VoiceConfidenceBar confidence={0.88} lang="en" />);
    expect(out).toContain('width:88%');
  });

  it("renders 0% width for confidence=0", () => {
    const out = html(<VoiceConfidenceBar confidence={0} lang="en" />);
    expect(out).toContain('width:0%');
  });

  it("renders 100% width for confidence=1", () => {
    const out = html(<VoiceConfidenceBar confidence={1} lang="en" />);
    expect(out).toContain('width:100%');
  });

  it("clamps out-of-range confidence", () => {
    const overOut = html(<VoiceConfidenceBar confidence={1.5} lang="en" />);
    expect(overOut).toContain('width:100%');
    const underOut = html(<VoiceConfidenceBar confidence={-0.3} lang="en" />);
    expect(underOut).toContain('width:0%');
  });

  it("handles NaN / undefined confidence as 0%", () => {
    const nanOut = html(<VoiceConfidenceBar confidence={NaN} lang="en" />);
    expect(nanOut).toContain('width:0%');
    const undefOut = html(<VoiceConfidenceBar lang="en" />);
    expect(undefOut).toContain('width:0%');
  });
});

describe("VoiceConfidenceBar — band labels", () => {
  it("shows 'High accuracy' for high band in English", () => {
    const out = html(<VoiceConfidenceBar confidence={0.96} lang="en" />);
    expect(out).toContain('data-voice-band="high"');
    expect(out).toContain("High accuracy");
  });

  it("shows the medium band label in English", () => {
    const out = html(<VoiceConfidenceBar confidence={0.88} lang="en" />);
    expect(out).toContain('data-voice-band="medium"');
    expect(out).toMatch(/Medium/);
  });

  it("shows the low band label in English", () => {
    const out = html(<VoiceConfidenceBar confidence={0.6} lang="en" />);
    expect(out).toContain('data-voice-band="low"');
    expect(out).toMatch(/Low/);
  });

  it("renders Telugu labels when lang=te", () => {
    const out = html(<VoiceConfidenceBar confidence={0.96} lang="te" />);
    expect(out).toContain("Manchi accuracy");
  });

  it("renders Hindi labels when lang=hi", () => {
    const out = html(<VoiceConfidenceBar confidence={0.96} lang="hi" />);
    expect(out).toContain("Achhi accuracy");
  });
});

describe("VoiceConfidenceBar — visual variants", () => {
  it("hides label span when showLabel=false (but aria-label still set for screen readers)", () => {
    const out = html(<VoiceConfidenceBar confidence={0.88} showLabel={false} lang="en" />);
    // The visible <span> with the band label should NOT appear
    expect(out).not.toMatch(/<span[^>]*>Medium/);
    // aria-label IS retained on the progressbar for a11y
    expect(out).toMatch(/aria-label="Medium/);
  });

  it("hides percent when showPercent=false", () => {
    const out = html(<VoiceConfidenceBar confidence={0.88} showPercent={false} />);
    expect(out).not.toContain(">88%<");
  });

  it("shows percent by default", () => {
    const out = html(<VoiceConfidenceBar confidence={0.88} />);
    expect(out).toContain(">88%<");
  });

  it("respects size prop", () => {
    const sm = html(<VoiceConfidenceBar confidence={0.5} size="sm" />);
    const lg = html(<VoiceConfidenceBar confidence={0.5} size="lg" />);
    expect(sm).toMatch(/overflow-hidden h-1"/);
    expect(lg).toMatch(/overflow-hidden h-2"/);
  });
});

describe("VoiceConfidenceBarGallery", () => {
  it("renders 3 bars at representative confidence levels", () => {
    const out = html(<VoiceConfidenceBarGallery lang="en" />);
    expect((out.match(/role="progressbar"/g) || []).length).toBe(3);
  });

  it("covers all 3 bands (low, medium, high)", () => {
    const out = html(<VoiceConfidenceBarGallery lang="en" />);
    expect(out).toContain('data-voice-band="low"');
    expect(out).toContain('data-voice-band="medium"');
    expect(out).toContain('data-voice-band="high"');
  });
});
