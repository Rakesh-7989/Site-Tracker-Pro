// SiteTrack Pro — Drawing-diff math (Procore-demo feature).
//
// What this gives the product:
//   Two revisions of the SAME drawing rendered as overlaid canvases.
//   - Single source of truth for synchronized pan/zoom across both layers.
//   - Opacity slider blends old over new (or vice versa) so the user can
//     "see" what changed.
//   - Delta highlighter — pixel-diff thumbnails for at-a-glance change
//     detection (post-render, optional).
//
// Pure function lib: input geometry + viewport, output transforms. No React,
// no canvas — the UI component just consumes these. Easier to test, easier
// to swap renderers later (WebGL, fabric.js, etc.).

/** Clamp v to [lo, hi]. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Combine two zoom multipliers safely. */
export const composeZoom = (current, delta) => clamp(current * delta, 0.05, 32);

/**
 * Given a wheel event delta (positive = zoom out), return the new zoom
 * factor. We use a smooth exponential so 100 ticks doesn't overshoot.
 */
export function zoomFromWheel(currentZoom, deltaY) {
  const speed = 0.0015;
  const factor = Math.exp(-deltaY * speed);
  return composeZoom(currentZoom, factor);
}

/**
 * Compute a transform that fits a (drawingW × drawingH) image inside a
 * (viewW × viewH) viewport with `pad` px margin. Returns { zoom, panX, panY }.
 */
export function fitToViewport(drawingW, drawingH, viewW, viewH, pad = 24) {
  if (drawingW <= 0 || drawingH <= 0 || viewW <= 0 || viewH <= 0) {
    return { zoom: 1, panX: 0, panY: 0 };
  }
  const innerW = Math.max(viewW - pad * 2, 50);
  const innerH = Math.max(viewH - pad * 2, 50);
  const zoom = Math.min(innerW / drawingW, innerH / drawingH);
  const scaledW = drawingW * zoom;
  const scaledH = drawingH * zoom;
  return {
    zoom,
    panX: (viewW - scaledW) / 2,
    panY: (viewH - scaledH) / 2,
  };
}

/** Apply a transform to a viewport-space point → drawing-space point. */
export function screenToDrawing(transform, x, y) {
  const { zoom, panX, panY } = transform;
  return { x: (x - panX) / zoom, y: (y - panY) / zoom };
}

/** Apply a transform to a drawing-space point → viewport-space point. */
export function drawingToScreen(transform, x, y) {
  const { zoom, panX, panY } = transform;
  return { x: x * zoom + panX, y: y * zoom + panY };
}

/**
 * Pan-and-zoom about a focal point (e.g. cursor location). Keeps the focal
 * point under the cursor stable while zooming — what the user expects.
 */
export function zoomAbout(transform, focalScreenX, focalScreenY, newZoom) {
  const drawingPt = screenToDrawing(transform, focalScreenX, focalScreenY);
  const next = { ...transform, zoom: newZoom };
  const screenAtNewZoom = drawingToScreen(next, drawingPt.x, drawingPt.y);
  return {
    zoom: newZoom,
    panX: transform.panX + (focalScreenX - screenAtNewZoom.x),
    panY: transform.panY + (focalScreenY - screenAtNewZoom.y),
  };
}

/**
 * Layer model. A "layer" is one revision of the drawing.
 *   { id, label, imageUrl, opacity (0..1), visible }
 */
export const DEFAULT_LAYER = Object.freeze({
  id: "",
  label: "",
  imageUrl: "",
  opacity: 1,
  visible: true,
});

/** Build a layer from a drawing row, with sensible defaults. */
export function buildLayer(drawing, overrides = {}) {
  if (!drawing) throw new Error("buildLayer: drawing required");
  return {
    ...DEFAULT_LAYER,
    id: drawing.id,
    label: `${drawing.revision || "Rev"} · ${drawing.released_at?.slice(0, 10) || ""}`.trim(),
    imageUrl: drawing.storage_path || drawing.preview_url || "",
    opacity: 1,
    visible: true,
    ...overrides,
  };
}

/**
 * Validate that two layers can be diffed:
 *   - Same project_id.
 *   - Same title (case-insensitive, trimmed).
 *   - Same type.
 *   - Different revision.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function canDiff(a, b) {
  if (!a || !b) return { ok: false, reason: "two-layers-required" };
  if (a.project_id !== b.project_id) return { ok: false, reason: "different-projects" };
  const sameTitle = (a.title || "").trim().toLowerCase() === (b.title || "").trim().toLowerCase();
  if (!sameTitle) return { ok: false, reason: "different-titles" };
  if ((a.type || "") !== (b.type || "")) return { ok: false, reason: "different-types" };
  if ((a.revision || "") === (b.revision || "")) return { ok: false, reason: "same-revision" };
  return { ok: true };
}

/**
 * Given a target opacity slider position t in [0,1], return per-layer opacity
 * so the OLD layer is full opaque at t=0, OLD fades out by t=1, NEW fades in.
 * Useful for an "A → B" wipe slider.
 */
export function blendOpacities(t) {
  const x = clamp(t, 0, 1);
  return { oldOpacity: 1 - x, newOpacity: x };
}

/**
 * Decide whether a pixel pair (old, new) counts as a change, given a
 * tolerance (0-255). Each input is { r,g,b,a }. Used by the change-detection
 * heatmap (post-render thumbnail).
 */
export function pixelDiffers(oldPx, newPx, tolerance = 16) {
  if (!oldPx || !newPx) return true;
  return (
    Math.abs(oldPx.r - newPx.r) > tolerance ||
    Math.abs(oldPx.g - newPx.g) > tolerance ||
    Math.abs(oldPx.b - newPx.b) > tolerance ||
    Math.abs((oldPx.a ?? 255) - (newPx.a ?? 255)) > tolerance
  );
}

/**
 * Build a "viewport state" used by the React component. This is what the UI
 * persists in usePersistent (so the user's last zoom/pan survives reload).
 */
export function newViewportState({
  zoom = 1, panX = 0, panY = 0,
  opacity = 0.5, showOnlyDiffs = false,
} = {}) {
  return {
    zoom: clamp(zoom, 0.05, 32),
    panX,
    panY,
    opacity: clamp(opacity, 0, 1),
    showOnlyDiffs: !!showOnlyDiffs,
  };
}
