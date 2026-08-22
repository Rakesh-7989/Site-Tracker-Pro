// SiteTrack Pro — DxfThumbnail component tests (CAD thumbnails in file registers).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";

import { DxfThumbnail, clearDxfThumbnailCache } from "@/features/shared/DxfThumbnail";

const LINE_DXF = `0
SECTION
2
ENTITIES
0
LINE
8
WALLS
10
0.0
20
0.0
11
100.0
21
50.0
0
ENDSEC
0
EOF
`;

const okUrl = (data: string) => async () => ({ ok: true as const, data });
const failUrl = (error: string) => async () => ({ ok: false as const, error });

class IOStub {
  static instances: IOStub[] = [];
  callback: (entries: Array<{ isIntersecting: boolean }>) => void;
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.callback = cb;
    IOStub.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
  trigger(): void {
    this.callback([{ isIntersecting: true }]);
  }
}

beforeEach(() => {
  clearDxfThumbnailCache();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(LINE_DXF, { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // @ts-expect-error test stub teardown
  delete globalThis.IntersectionObserver;
});

describe("DxfThumbnail — non-DXF files", () => {
  it("renders only the doc glyph and never fetches for .dwg / .pdf names", async () => {
    const getUrl = vi.fn(failUrl("should not be called"));
    const { container } = render(<DxfThumbnail fileName="plan.dwg" getUrl={getUrl} />);
    expect(container.querySelector("[data-testid='dxf-thumbnail'] svg[aria-label='CAD drawing preview']")).toBeNull();
    await new Promise(r => setTimeout(r, 10));
    expect(getUrl).not.toHaveBeenCalled();
    expect(container.querySelector(".text-fg-tertiary")).not.toBeNull();
  });
});

describe("DxfThumbnail — DXF load path", () => {
  it("injects the rendered SVG after the signed URL + parse resolve", async () => {
    const { container } = render(<DxfThumbnail fileName="plan.dxf" cacheKey="p/1/a.dxf" getUrl={okUrl("https://signed.example/a")} />);
    const tile = container.querySelector("[data-testid='dxf-thumbnail']");
    await waitFor(() => expect(tile?.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    expect(tile?.querySelector("line")).not.toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith("https://signed.example/a");
  });

  it("keeps the placeholder when the URL provider fails", async () => {
    const { container } = render(<DxfThumbnail fileName="plan.dxf" cacheKey="p/1/b.dxf" getUrl={failUrl("Backend not configured.")} />);
    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelector("[data-testid='dxf-thumbnail'] svg[aria-label='CAD drawing preview']")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("keeps the placeholder when fetch fails or the DXF has no entities", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    const { container } = render(<DxfThumbnail fileName="plan.dxf" cacheKey="p/1/c.dxf" getUrl={okUrl("https://signed.example/c")} />);
    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelector("[data-testid='dxf-thumbnail'] svg[aria-label='CAD drawing preview']")).toBeNull();
  });
});

describe("DxfThumbnail — caching", () => {
  it("fetches once per cacheKey across remounts", async () => {
    const getUrl = vi.fn(okUrl("https://signed.example/shared"));
    const first = render(<DxfThumbnail fileName="a.dxf" cacheKey="p/1/same.dxf" getUrl={getUrl} />);
    await waitFor(() => expect(first.container.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    first.unmount();
    const second = render(<DxfThumbnail fileName="a.dxf" cacheKey="p/1/same.dxf" getUrl={getUrl} />);
    await waitFor(() => expect(second.container.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    expect(getUrl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("different cacheKeys fetch independently; failures are not cached", async () => {
    const urlA = vi.fn(failUrl("expired"));
    const a = render(<DxfThumbnail fileName="a.dxf" cacheKey="p/1/x.dxf" getUrl={urlA} />);
    await new Promise(r => setTimeout(r, 10));
    a.unmount();
    const a2 = render(<DxfThumbnail fileName="a.dxf" cacheKey="p/1/x.dxf" getUrl={urlA} />);
    await new Promise(r => setTimeout(r, 10));
    expect(urlA).toHaveBeenCalledTimes(2);
    a2.unmount();

    const urlB = vi.fn(okUrl("https://signed.example/y"));
    const b = render(<DxfThumbnail fileName="b.dxf" cacheKey="p/1/y.dxf" getUrl={urlB} />);
    await waitFor(() => expect(b.container.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    expect(urlB).toHaveBeenCalledTimes(1);
  });

  it("defaults the cache key to the fileName when omitted", async () => {
    const getUrl = vi.fn(okUrl("https://signed.example/k"));
    const one = render(<DxfThumbnail fileName="same.dxf" getUrl={getUrl} />);
    await waitFor(() => expect(one.container.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    one.unmount();
    const two = render(<DxfThumbnail fileName="same.dxf" getUrl={getUrl} />);
    await waitFor(() => expect(two.container.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    expect(getUrl).toHaveBeenCalledTimes(1);
  });
});

describe("DxfThumbnail — lazy visibility", () => {
  it("waits for IntersectionObserver before fetching", async () => {
    IOStub.instances = [];
    vi.stubGlobal("IntersectionObserver", IOStub as unknown as typeof IntersectionObserver);
    const getUrl = vi.fn(okUrl("https://signed.example/lazy"));
    const { container } = render(<DxfThumbnail fileName="lazy.dxf" cacheKey="p/1/lazy.dxf" getUrl={getUrl} />);
    await new Promise(r => setTimeout(r, 10));
    expect(getUrl).not.toHaveBeenCalled();
    IOStub.instances[IOStub.instances.length - 1].trigger();
    await waitFor(() => expect(container.querySelector("svg[aria-label='CAD drawing preview']")).not.toBeNull());
    expect(getUrl).toHaveBeenCalledTimes(1);
  });
});

