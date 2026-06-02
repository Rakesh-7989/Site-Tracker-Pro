// SiteTrack Pro — Sprint 2 (Session 30.8) DPRStatusBadge tests.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import {
  DPRStatusBadge,
  DPRStatusBadgeGallery,
  DPR_STATUSES,
} from "../src/features/dpr/DPRStatusBadge.jsx";

const html = (jsx) => renderToStaticMarkup(jsx);

describe("DPR_STATUSES", () => {
  it("exposes the 6 lifecycle states matching the SQL CHECK constraint", () => {
    expect(DPR_STATUSES).toEqual(["queued", "sending", "sent", "delivered", "read", "failed"]);
  });
});

describe("DPRStatusBadge — explicit status", () => {
  it.each([
    ["queued", "Queued"],
    ["sending", "Sending"],
    ["sent", "Sent"],
    ["delivered", "Delivered"],
    ["read", "Read"],
    ["failed", "Failed"],
  ])("renders %s status with the right English label", (status, expectedFragment) => {
    const out = html(<DPRStatusBadge status={status} lang="en" />);
    expect(out).toContain(`data-dpr-status="${status}"`);
    expect(out).toContain(expectedFragment);
    expect(out).toContain(`role="status"`);
  });

  it("falls back to 'queued' for unknown status values", () => {
    const out = html(<DPRStatusBadge status="bogus-status" lang="en" />);
    expect(out).toContain(`data-dpr-status="queued"`);
  });
});

describe("DPRStatusBadge — i18n", () => {
  it("uses Telugu for sent status when lang=te", () => {
    const out = html(<DPRStatusBadge status="sent" lang="te" />);
    expect(out).toMatch(/pampamayindi|Promoter/);
  });

  it("uses Hindi for delivered status when lang=hi", () => {
    const out = html(<DPRStatusBadge status="delivered" lang="hi" />);
    expect(out).toMatch(/deliver|WhatsApp/);
  });
});

describe("DPRStatusBadge — attempts counter", () => {
  it("appends the attempt count for sending state when > 1", () => {
    const out = html(<DPRStatusBadge status="sending" attempts={3} lang="en" />);
    expect(out).toMatch(/Sending.*·.*3/);
  });

  it("appends the attempt count for failed state when > 1", () => {
    const out = html(<DPRStatusBadge status="failed" attempts={5} lang="en" />);
    expect(out).toMatch(/Failed.*·.*5/);
  });

  it("does NOT append attempts for delivered state (succeeded)", () => {
    const out = html(<DPRStatusBadge status="delivered" attempts={3} lang="en" />);
    expect(out).not.toMatch(/Delivered.*·.*3/);
  });

  it("does NOT append attempts when count is 1", () => {
    const out = html(<DPRStatusBadge status="sending" attempts={1} lang="en" />);
    expect(out).not.toMatch(/Sending.*·.*1/);
  });
});

describe("DPRStatusBadge — sizes", () => {
  it("respects size prop class output", () => {
    const sm = html(<DPRStatusBadge status="sent" size="sm" />);
    const lg = html(<DPRStatusBadge status="sent" size="lg" />);
    expect(sm).toContain("px-2.5 py-1");
    expect(lg).toContain("px-3.5 py-2");
  });

  it("falls back to md when size invalid", () => {
    const out = html(<DPRStatusBadge status="sent" size="huge" />);
    expect(out).toContain("px-3 py-1.5");
  });
});

describe("DPRStatusBadgeGallery", () => {
  it("renders all 6 statuses with unique data attributes", () => {
    const out = html(<DPRStatusBadgeGallery lang="en" />);
    const matches = out.match(/data-dpr-status="([^"]+)"/g) || [];
    expect(matches).toHaveLength(6);
    const states = matches.map(m => m.match(/"([^"]+)"/)[1]).sort();
    expect(states).toEqual([...DPR_STATUSES].sort());
  });

  it("differs by lang", () => {
    const enOut = html(<DPRStatusBadgeGallery lang="en" />);
    const teOut = html(<DPRStatusBadgeGallery lang="te" />);
    expect(enOut).not.toBe(teOut);
  });
});
