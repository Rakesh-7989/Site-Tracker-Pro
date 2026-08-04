// SiteTrack Pro — v4 D2 drawing-diff pairing + raster helpers (pure, no client/canvas).
// Wraps the orphan geometry module src/lib/drawingDiff.ts with drawing-row logic:
//   - group drawings into diff pairs (same project+title+type, different revision)
//   - resolve each pair to storage paths for the DiffView canvas overlay
//   - detect raster vs non-raster uploads (PDFs can't be pixel-diffed)

import { canDiff, pixelDiffers, type Layer } from "@/lib/drawingDiff";
import type { Drawing } from "@/app/designQueries";
import { drawingObjectPath, type DrawingFileRef } from "@/app/drawingFileQueries";

const RASTER_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);

interface Pixel { r: number; g: number; b: number; a?: number; }

/** True when a file name looks like a raster image (pixel-diffable). */
export function isRasterFileName(name: string): boolean {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return RASTER_EXT.has(lower.slice(dot));
}

/** Erase white/near-white pixels so the overlay doesn't hide the layer beneath. */
export function eraseNearWhite(p: Pixel): Pixel {
  const threshold = 248;
  if (p.r >= threshold && p.g >= threshold && p.b >= threshold) {
    return { r: p.r, g: p.g, b: p.b, a: 0 };
  }
  return p;
}

/**
 * Pure pixel-mask diff over two RGBA byte arrays (same width/height).
 * Returns a Uint8Array where 1 = pixel differs beyond tolerance, 0 = same.
 * DiffView applies this to canvas ImageData (no canvas in jsdom tests).
 */
export function diffPixelMask(oldBytes: Uint8ClampedArray, newBytes: Uint8ClampedArray, tolerance = 16): Uint8Array {
  if (oldBytes.length !== newBytes.length) throw new Error("diffPixelMask: length mismatch");
  const out = new Uint8Array(Math.floor(oldBytes.length / 4));
  for (let i = 0, o = 0; i < oldBytes.length; i += 4, o++) {
    const a: Pixel = { r: oldBytes[i], g: oldBytes[i + 1], b: oldBytes[i + 2], a: oldBytes[i + 3] };
    const b: Pixel = { r: newBytes[i], g: newBytes[i + 1], b: newBytes[i + 2], a: newBytes[i + 3] };
    out[o] = pixelDiffers(a, b, tolerance) ? 1 : 0;
  }
  return out;
}

/** Compose the RGBA output bytes from a diff mask + the new-layer bytes. */
export function applyDiffMask(mask: Uint8Array, newBytes: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(newBytes.length) as Uint8ClampedArray<ArrayBuffer>;
  const src = newBytes;
  for (let i = 0, o = 0; i < src.length; i += 4, o++) {
    out[i] = src[i];
    out[i + 1] = src[i + 1];
    out[i + 2] = src[i + 2];
    out[i + 3] = mask[o] === 1 ? 255 : 0;
  }
  return out;
}

/**
 * Build the two Layers for a diff pair from Drawing rows.
 * imageUrl is the signed URL resolved by the caller (DiffView fetches it).
 */
export function layerForDrawing(d: Drawing, imageUrl: string): Layer {
  return {
    id: d.id,
    label: `${d.revision} · ${(d.releaseDate ?? "").slice(0, 10)}`.trim(),
    imageUrl,
    opacity: 1,
    visible: true,
    project_id: d.projectId,
    title: d.title,
    type: d.type,
    revision: d.revision,
  };
}

export interface DiffPair { old: Drawing; newer: Drawing; }

/**
 * Diff-pair: the current/superseded drawing with the minimum override layout.
 * Two drawings qualify if canDiff passes (same project+title+type, different
 * revision). Returns old = earlier revision, newer = later/PROFILE.
 */
export function diffPairs(drawings: Drawing[]): DiffPair[] {
  const byKey = new Map<string, Drawing[]>();
  for (const d of drawings) {
    const key = formatKey(d.title, d.type);
    const arr = byKey.get(key) ?? [];
    arr.push(d);
    byKey.set(key, arr);
  }
  const pairs: DiffPair[] = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    // sort oldest first by release date, then revision
    const sorted = [...group].sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const check = canDiff(
          { project_id: sorted[i].projectId, title: sorted[i].title, type: sorted[i].type, revision: sorted[i].revision },
          { project_id: sorted[j].projectId, title: sorted[j].title, type: sorted[j].type, revision: sorted[j].revision },
        );
        if (check.ok) pairs.push({ old: sorted[i], newer: sorted[j] });
      }
    }
  }
  return pairs;
}

/** Normalized grouping key (case + whitespace insensitive, mirrors canDiff). */
export function formatKey(title: string, type: string): string {
  return `${(type || "").trim().toLowerCase()}|${(title || "").trim().toLowerCase()}`;
}

/**
 * Resolve the raster storage path to show for a drawing, given its file listing.
 * Prefers preview_url (migration 150) when set, else the first raster file.
 */
export function rasterPathForDrawing(d: Drawing, files: DrawingFileRef[]): string | null {
  if (d.previewUrl) return d.previewUrl;
  const raster = files.find(f => isRasterFileName(f.name));
  if (raster) return drawingObjectPath(d.projectId, d.id, raster.name);
  return null;
}