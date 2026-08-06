// SiteTrack Pro — OfflineQueueBanner component tests (i18n-wired, render via
// renderToStaticMarkup inside I18nProvider; locale defaults to en in Node).

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../../src/i18n/I18nProvider";
import { OfflineQueueBanner } from "../../src/features/dpr/OfflineQueueBanner";

const render = (queued: number, draining: boolean): string =>
  renderToStaticMarkup(
    <I18nProvider><OfflineQueueBanner queued={queued} draining={draining} /></I18nProvider>,
  );

describe("OfflineQueueBanner", () => {
  it("renders nothing when nothing is queued", () => {
    expect(render(0, false)).toBe("");
  });

  it("renders singular English copy for one queued DPR", () => {
    const out = render(1, false);
    expect(out).toContain("1 DPR queued");
    expect(out).toContain("back online");
    expect(out).not.toContain("DPRs");
  });

  it("renders plural English copy for multiple queued DPRs", () => {
    const out = render(3, false);
    expect(out).toContain("3 DPRs queued");
  });

  it("shows 'sending' copy while the queue is draining", () => {
    const out = render(2, true);
    expect(out).toContain("sending");
  });
});
