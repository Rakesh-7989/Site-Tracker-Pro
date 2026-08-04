// SiteTrack Pro — v4 D2 drawing-diff overlay.
// Canvas-based image diff between two revisions of the same drawing
// (old + newer). Reuses the orphan geometry module src/lib/drawingDiff.ts
// (zoom/pan/fit transforms, blendOpacities, newViewportState) plus the pure
// pixel-mask helpers in drawingDiffPair.ts.
//
// Both images are fetched as blobs → ImageBitmap so canvas pixels are
// same-origin (signed URLs are cross-origin and would taint the canvas,
// breaking getImageData for the pixel-diff mode).

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon } from "@/components/ui/atoms";
import {
  fitToViewport, zoomAbout, zoomFromWheel, blendOpacities,
  newViewportState, type ViewportState,
} from "@/lib/drawingDiff";
import { diffPixelMask, applyDiffMask } from "@/lib/drawingDiffPair";

export interface DiffImageSource {
  /** e.g. "Rev A · 2026-08-01" */
  label: string;
  /** Signed URL to a raster image, or null when the drawing has no raster file. */
  url: string | null;
  /** False when the file is a PDF/etc — cannot be pixel-diffed. */
  raster: boolean;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch image");
  const blob = await res.blob();
  return createImageBitmap(blob);
}

interface LoadedImage {
  bitmap: ImageBitmap;
  label: string;
  raster: boolean;
  url: string | null;
}

export interface DiffViewProps {
  title: string;
  oldImage: DiffImageSource;
  newImage: DiffImageSource;
  onClose: () => void;
  /** Called with the drawing's signed URL when the user wants to download a non-raster file. */
  onDownload?: (source: DiffImageSource) => void;
}

export function DiffView({ title, oldImage, newImage, onClose, onDownload }: DiffViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewportState>(() => newViewportState({ opacity: 0.5 }));
  const [images, setImages] = useState<{ old: LoadedImage | null; newer: LoadedImage | null }>({ old: null, newer: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.5);
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [o, n] = await Promise.all([
          oldImage.url ? loadBitmap(oldImage.url) : null,
          newImage.url ? loadBitmap(newImage.url) : null,
        ]);
        if (cancelled) return;
        setImages({
          old: o ? { bitmap: o, ...oldImage } : null,
          newer: n ? { bitmap: n, ...newImage } : null,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [oldImage.url, newImage.url, oldImage, newImage]);

  const fit = useCallback((w: number, h: number) => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    canvas.width = wrap.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = wrap.clientHeight * (window.devicePixelRatio || 1);
    const t = fitToViewport(w, h, canvas.width, canvas.height, 24);
    setView(v => newViewportState({ ...v, zoom: t.zoom, panX: t.panX, panY: t.panY }));
  }, []);

  useEffect(() => {
    const o = images.old, n = images.newer;
    if (o?.bitmap && n?.bitmap) fit(Math.max(o.bitmap.width, n.bitmap.width), Math.max(o.bitmap.height, n.bitmap.height));
  }, [images, fit]);

  // Redraw on any state change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const o = images.old, n = images.newer;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "transparent";
    if (!o || !n) return;
    if (o.bitmap && n.bitmap && showOnlyDiffs) {
      drawDiffOnly(ctx, canvas.width, canvas.height, o, n, view);
      return;
    }
    if (o.bitmap) drawScaled(ctx, o.bitmap, view, o.bitmap.width, o.bitmap.height);
    if (n.bitmap) {
      const { oldOpacity, newOpacity } = blendOpacities(opacity);
      void oldOpacity;
      ctx.globalAlpha = newOpacity;
      drawScaled(ctx, n.bitmap, view, o.bitmap.width, o.bitmap.height);
      ctx.globalAlpha = 1;
    }
  }, [images, view, opacity, showOnlyDiffs]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const nz = zoomFromWheel(view.zoom, e.deltaY);
    setView(v => newViewportState({ ...zoomAbout(v, px, py, nz) }));
  }, [view.zoom]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setView(v => ({ ...v, panX: dragRef.current!.panX + (e.clientX - dragRef.current!.x), panY: dragRef.current!.panY + (e.clientY - dragRef.current!.y) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const diffable = oldImage.raster && newImage.raster;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg-primary truncate">{title}</div>
          <div className="text-[11px] text-fg-tertiary">
            <span className="text-accent-2">{oldImage.label}</span>
            <span className="mx-1 text-fg-tertiary">→</span>
            <span className="text-accent">{newImage.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {diffable && (
            <>
              <label className="flex items-center gap-1.5 text-[12px] text-fg-secondary">
                <input type="checkbox" checked={showOnlyDiffs} onChange={e => setShowOnlyDiffs(e.target.checked)} />
                Only diffs
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-fg-secondary">
                <span className="text-fg-tertiary">Blend</span>
                <input type="range" min={0} max={1} step={0.05} value={opacity} disabled={showOnlyDiffs} onChange={e => { const v = Number(e.target.value); setOpacity(v); setView(vp => newViewportState({ ...vp, opacity: v })); }} className="w-24" />
              </label>
            </>
          )}
          <Button size="sm" variant="secondary" onClick={() => { const o = images.old, n = images.newer; if (o?.bitmap && n?.bitmap) fit(Math.max(o.bitmap.width, n.bitmap.width), Math.max(o.bitmap.height, n.bitmap.height)); }}>
            <Icon name="refresh" size={14} /><span className="ml-1 hidden sm:inline">Fit</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}><Icon name="x" size={14} /></Button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-error-tint px-3 py-2 text-[12px] text-error">{error}</div>}

      {!diffable ? (
        <div className="grid place-items-center rounded-2xl border border-default bg-bg-secondary py-12 text-center">
          <div className="text-fg-tertiary text-sm">Drawing files are not raster images — pixel diff unavailable.</div>
          <div className="mt-3 flex gap-2">
            {oldImage.url && <Button size="sm" variant="secondary" onClick={() => onDownload?.(oldImage)}>Download {oldImage.label}</Button>}
            {newImage.url && <Button size="sm" variant="secondary" onClick={() => onDownload?.(newImage)}>Download {newImage.label}</Button>}
          </div>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative h-[55vh] overflow-hidden rounded-2xl border border-default bg-bg-secondary"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <canvas ref={canvasRef} className="h-full w-full touch-none cursor-grab active:cursor-grabbing" />
          {loading && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-[12px] text-fg-tertiary">Loading drawing images…</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function drawScaled(ctx: CanvasRenderingContext2D, img: ImageBitmap, view: ViewportState, targetW: number, targetH: number): void {
  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  ctx.restore();
}

/** Render only pixels that differ between the two layers (tolerance 16). */
function drawDiffOnly(
  ctx: CanvasRenderingContext2D, cw: number, ch: number,
  o: LoadedImage, n: LoadedImage, view: ViewportState,
): void {
  const w = Math.max(o.bitmap.width, n.bitmap.width);
  const h = Math.max(o.bitmap.height, n.bitmap.height);
  const oc = document.createElement("canvas");
  oc.width = w; oc.height = h;
  const octx = oc.getContext("2d")!;
  octx.drawImage(o.bitmap, 0, 0, w, h);
  const nc = document.createElement("canvas");
  nc.width = w; nc.height = h;
  const nctx = nc.getContext("2d")!;
  nctx.drawImage(n.bitmap, 0, 0, w, h);
  const oldPx = octx.getImageData(0, 0, w, h).data;
  const newPx = nctx.getImageData(0, 0, w, h).data;
  const mask = diffPixelMask(oldPx, newPx, 16);
  const out = applyDiffMask(mask, newPx);
  nc.width = w; nc.height = h;
  nctx.putImageData(new ImageData(out, w, h), 0, 0);
  void cw; void ch;
  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.zoom, view.zoom);
  ctx.drawImage(nc, 0, 0, w, h);
  ctx.restore();
}