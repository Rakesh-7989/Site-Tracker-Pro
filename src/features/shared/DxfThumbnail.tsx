// SiteTrack Pro — CAD thumbnail for file registers (DXF only).
// Renders a tiny inline SVG preview of a .dxf drawing next to its filename in
// the Drawings / Deliverables file lists, reusing the dependency-free
// dxfPreview lib (same parse + render path as CadPreviewModal).
//
// Performance contract:
// - Lazy: nothing is fetched until the row scrolls into view
//   (IntersectionObserver; environments without it load immediately).
// - Cached: one fetch/parse per storage path per session — module-level
//   promise map dedupes concurrent mounts across both tabs. Failed loads are
//   evicted so a later mount can retry (e.g. expired signed URL).

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/atoms";
import { cadKind, parseDxfDoc, dxfToSvg } from "@/lib/dxfPreview";
import { cn } from "@/lib/cn";

type UrlResult = { ok: true; data: string } | { ok: false; error: string };

export interface DxfThumbnailProps {
  /** File name with extension — only .dxf renders; everything else shows the doc glyph. */
  fileName: string;
  /** Resolve a short-lived signed URL for the file (storage-agnostic). */
  getUrl: () => Promise<UrlResult>;
  /** Stable cache identity — prefer the storage object path over the URL. Defaults to fileName. */
  cacheKey?: string;
  /** Tile edge in px (default 22). */
  size?: number;
  className?: string;
}

/** Parse + render DXF text down to an SVG string, or null when nothing is renderable. */
export function thumbnailSvgFromDxf(text: string): string | null {
  try {
    const doc = parseDxfDoc(text);
    if (!doc.entities || doc.entities.length === 0) return null;
    const svg = dxfToSvg(doc.entities);
    return svg || null;
  } catch {
    return null;
  }
}

const cache = new Map<string, Promise<string | null>>();

function requestThumbnail(key: string, getUrl: () => Promise<UrlResult>): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const url = await getUrl();
    if (!url.ok) return null;
    const res = await fetch(url.data);
    if (!res.ok) return null;
    return thumbnailSvgFromDxf(await res.text());
  })().catch(() => null);
  cache.set(key, p);
  // Evict failures so a future mount retries instead of caching a dead signed URL.
  void p.then(svg => { if (svg === null) cache.delete(key); });
  return p;
}

/** Test hook — drop all cached thumbnails (or just one key). */
export function clearDxfThumbnailCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export function DxfThumbnail({ fileName, getUrl, cacheKey, size = 22, className }: DxfThumbnailProps): JSX.Element {
  const isDxf = cadKind(fileName) === "dxf";
  const [svg, setSvg] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const holderRef = useRef<HTMLSpanElement | null>(null);
  const getUrlRef = useRef(getUrl);
  getUrlRef.current = getUrl;

  useEffect(() => {
    if (!isDxf) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isDxf]);

  useEffect(() => {
    if (!isDxf || !visible) return;
    let cancelled = false;
    void requestThumbnail(cacheKey ?? fileName, () => getUrlRef.current()).then(out => {
      if (!cancelled && out) setSvg(out);
    });
    return () => { cancelled = true; };
  }, [isDxf, visible, cacheKey, fileName]);

  return (
    <span
      ref={holderRef}
      data-testid="dxf-thumbnail"
      className={cn(
        "inline-grid flex-shrink-0 place-items-center overflow-hidden rounded border border-default bg-bg-primary align-middle",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {isDxf && svg ? (
        // SVG is generated locally from parsed numeric entities with escaped
        // text — never user-supplied HTML.
        <span className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <Icon name="doc" size={Math.max(11, Math.round(size * 0.6))} className={cn("text-fg-tertiary", isDxf && visible && "opacity-50")} />
      )}
    </span>
  );
}
