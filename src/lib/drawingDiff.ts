interface Transform {
  zoom: number;
  panX: number;
  panY: number;
}

interface Drawing {
  id: string;
  revision?: string;
  released_at?: string;
  storage_path?: string;
  preview_url?: string;
  title?: string;
  project_id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface Layer {
  id: string;
  label: string;
  imageUrl: string;
  opacity: number;
  visible: boolean;
  project_id?: string;
  title?: string;
  type?: string;
  revision?: string;
  [key: string]: unknown;
}

interface Pixel {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
  opacity: number;
  showOnlyDiffs: boolean;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const composeZoom = (current: number, delta: number): number => clamp(current * delta, 0.05, 32);

export function zoomFromWheel(currentZoom: number, deltaY: number): number {
  const speed = 0.0015;
  const factor = Math.exp(-deltaY * speed);
  return composeZoom(currentZoom, factor);
}

export function fitToViewport(drawingW: number, drawingH: number, viewW: number, viewH: number, pad = 24): Transform {
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

export function screenToDrawing(transform: Transform, x: number, y: number): { x: number; y: number } {
  const { zoom, panX, panY } = transform;
  return { x: (x - panX) / zoom, y: (y - panY) / zoom };
}

export function drawingToScreen(transform: Transform, x: number, y: number): { x: number; y: number } {
  const { zoom, panX, panY } = transform;
  return { x: x * zoom + panX, y: y * zoom + panY };
}

export function zoomAbout(transform: Transform, focalScreenX: number, focalScreenY: number, newZoom: number): Transform {
  const drawingPt = screenToDrawing(transform, focalScreenX, focalScreenY);
  const next = { ...transform, zoom: newZoom };
  const screenAtNewZoom = drawingToScreen(next, drawingPt.x, drawingPt.y);
  return {
    zoom: newZoom,
    panX: transform.panX + (focalScreenX - screenAtNewZoom.x),
    panY: transform.panY + (focalScreenY - screenAtNewZoom.y),
  };
}

export const DEFAULT_LAYER = Object.freeze({
  id: "",
  label: "",
  imageUrl: "",
  opacity: 1,
  visible: true,
});

export function buildLayer(drawing: Drawing, overrides: Partial<Layer> = {}): Layer {
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

/** Minimal structural subset of Layer that canDiff actually inspects. */
type DiffLayerInput = Pick<Layer, "project_id" | "title" | "type" | "revision"> | null | undefined;

export function canDiff(a: DiffLayerInput, b: DiffLayerInput): { ok: boolean; reason?: string } {
  if (!a || !b) return { ok: false, reason: "two-layers-required" };
  if (a.project_id !== b.project_id) return { ok: false, reason: "different-projects" };
  const sameTitle = (a.title || "").trim().toLowerCase() === (b.title || "").trim().toLowerCase();
  if (!sameTitle) return { ok: false, reason: "different-titles" };
  if ((a.type || "") !== (b.type || "")) return { ok: false, reason: "different-types" };
  if ((a.revision || "") === (b.revision || "")) return { ok: false, reason: "same-revision" };
  return { ok: true };
}

export function blendOpacities(t: number): { oldOpacity: number; newOpacity: number } {
  const x = clamp(t, 0, 1);
  return { oldOpacity: 1 - x, newOpacity: x };
}

export function pixelDiffers(oldPx: Pixel | null | undefined, newPx: Pixel | null | undefined, tolerance = 16): boolean {
  if (!oldPx || !newPx) return true;
  return (
    Math.abs(oldPx.r - newPx.r) > tolerance ||
    Math.abs(oldPx.g - newPx.g) > tolerance ||
    Math.abs(oldPx.b - newPx.b) > tolerance ||
    Math.abs((oldPx.a ?? 255) - (newPx.a ?? 255)) > tolerance
  );
}

export function newViewportState({
  zoom = 1, panX = 0, panY = 0,
  opacity = 0.5, showOnlyDiffs = false,
}: Partial<ViewportState> = {}): ViewportState {
  return {
    zoom: clamp(zoom, 0.05, 32),
    panX,
    panY,
    opacity: clamp(opacity, 0, 1),
    showOnlyDiffs: !!showOnlyDiffs,
  };
}
