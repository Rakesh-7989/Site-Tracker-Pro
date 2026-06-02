// SiteTrack Pro — Sprint 2 (Session 30.8) BuildNowBadge tests.
//
// vitest.config.js uses environment='node' (no jsdom), so we render to a
// string via react-dom/server and assert on the markup. Avoids adding
// jsdom + testing-library as deps just for these atoms.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import {
  BuildNowBadge,
  BuildNowBadgeGallery,
  BUILDNOW_BADGE_STATES,
} from "../src/features/dpr/BuildNowBadge.jsx";

const html = (jsx) => renderToStaticMarkup(jsx);

describe("BUILDNOW_BADGE_STATES", () => {
  it("exposes exactly 5 states in the canonical order", () => {
    expect(BUILDNOW_BADGE_STATES).toEqual(["verified", "stale", "warning", "unverified", "none"]);
  });
});

describe("BuildNowBadge — explicit state prop", () => {
  it.each([
    ["verified", "Verified by BuildNow Telangana"],
    ["stale", "BuildNow data stale (&gt;24h)"],
    ["warning", "BuildNow flagged this project"],
    ["unverified", "BuildNow status unknown"],
    ["none", "Not anchored to BuildNow"],
  ])("renders %s state with the right English label", (state, expectedLabel) => {
    const out = html(<BuildNowBadge state={state} lang="en" showLink={false} />);
    expect(out).toContain(`data-buildnow-state="${state}"`);
    expect(out).toContain(expectedLabel);
    expect(out).toContain(`role="status"`);
    expect(out).toContain(`aria-label="${expectedLabel}"`);
  });

  it("falls back to 'none' for unknown state values", () => {
    const out = html(<BuildNowBadge state="invalid-state" lang="en" />);
    expect(out).toContain(`data-buildnow-state="none"`);
  });
});

describe("BuildNowBadge — i18n", () => {
  it("uses Telugu label for verified state when lang=te", () => {
    const out = html(<BuildNowBadge state="verified" lang="te" showLink={false} />);
    expect(out).toContain("BuildNow Telangana lo verified");
  });

  it("uses Hindi label for verified state when lang=hi", () => {
    const out = html(<BuildNowBadge state="verified" lang="hi" showLink={false} />);
    expect(out).toContain("BuildNow Telangana se verified");
  });

  it("falls back to English for unknown lang", () => {
    const out = html(<BuildNowBadge state="verified" lang="fr" showLink={false} />);
    expect(out).toContain("Verified by BuildNow Telangana");
  });
});

describe("BuildNowBadge — metadata derivation", () => {
  it("derives state=verified from fresh approved metadata", () => {
    const fresh = { approval_status: "approved", fetched_at: new Date().toISOString() };
    const out = html(<BuildNowBadge metadata={fresh} showLink={false} />);
    expect(out).toContain(`data-buildnow-state="verified"`);
  });

  it("derives state=warning from rejected metadata", () => {
    const out = html(<BuildNowBadge metadata={{ approval_status: "rejected" }} showLink={false} />);
    expect(out).toContain(`data-buildnow-state="warning"`);
  });

  it("derives state=stale from old approved metadata", () => {
    const stale = {
      approval_status: "approved",
      fetched_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    const out = html(<BuildNowBadge metadata={stale} showLink={false} />);
    expect(out).toContain(`data-buildnow-state="stale"`);
  });

  it("derives state=none when metadata is null", () => {
    const out = html(<BuildNowBadge metadata={null} showLink={false} />);
    expect(out).toContain(`data-buildnow-state="none"`);
  });

  it("state prop wins over metadata prop", () => {
    const out = html(
      <BuildNowBadge state="warning" metadata={{ approval_status: "approved" }} showLink={false} />,
    );
    expect(out).toContain(`data-buildnow-state="warning"`);
  });

  it("respects custom staleHours threshold", () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const stale = html(
      <BuildNowBadge metadata={{ approval_status: "approved", fetched_at: sixHoursAgo }} staleHours={3} showLink={false} />,
    );
    expect(stale).toContain(`data-buildnow-state="stale"`);
    const verified = html(
      <BuildNowBadge metadata={{ approval_status: "approved", fetched_at: sixHoursAgo }} staleHours={24} showLink={false} />,
    );
    expect(verified).toContain(`data-buildnow-state="verified"`);
  });
});

describe("BuildNowBadge — link to portal", () => {
  it("wraps in a link when state=verified + ids provided + showLink=true", () => {
    const out = html(
      <BuildNowBadge
        state="verified"
        buildnowProjectId="BN123"
        dprId="DPR456"
        showLink={true}
        lang="en"
      />,
    );
    expect(out).toMatch(/<a [^>]*href="https:\/\/buildnow\.telangana\.gov\.in\/verify/);
    expect(out).toContain("p=BN123");
    expect(out).toContain("d=DPR456");
    expect(out).toContain(`target="_blank"`);
    expect(out).toContain(`rel="noopener noreferrer"`);
  });

  it("does NOT wrap in a link when showLink=false", () => {
    const out = html(
      <BuildNowBadge
        state="verified"
        buildnowProjectId="BN123"
        dprId="DPR456"
        showLink={false}
      />,
    );
    expect(out).not.toMatch(/<a /);
  });

  it("does NOT wrap in a link when state != verified", () => {
    const out = html(
      <BuildNowBadge state="stale" buildnowProjectId="BN1" dprId="D1" showLink={true} />,
    );
    expect(out).not.toMatch(/<a /);
  });

  it("does NOT wrap when ids missing", () => {
    const out = html(<BuildNowBadge state="verified" showLink={true} />);
    expect(out).not.toMatch(/<a /);
  });
});

describe("BuildNowBadgeGallery", () => {
  it("renders one badge per state (5 total) with unique data attributes", () => {
    const out = html(<BuildNowBadgeGallery lang="en" />);
    const matches = out.match(/data-buildnow-state="([^"]+)"/g) || [];
    expect(matches).toHaveLength(5);
    const states = matches.map(m => m.match(/"([^"]+)"/)[1]).sort();
    expect(states).toEqual([...BUILDNOW_BADGE_STATES].sort());
  });

  it("respects lang prop across all badges", () => {
    const enOut = html(<BuildNowBadgeGallery lang="en" />);
    const teOut = html(<BuildNowBadgeGallery lang="te" />);
    // The Telugu rendering must differ from English (different strings).
    expect(teOut).not.toBe(enOut);
    expect(teOut).toContain("BuildNow Telangana lo verified");
  });
});
