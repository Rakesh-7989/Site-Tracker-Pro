// SiteTrack Pro — v4 D2: resolve signed raster URLs for a drawing diff pair.
// Shared by the DrawingsTab compare entry and the /kiosk/ar view.
// Pure-ish: takes the storage client + projectId, returns DiffImageSource
// (signed URL to the preferred raster file, or null if none).

import { drawingFileUrl, listDrawingFiles, type DrawingFileRef } from "@/app/drawingFileQueries";
import { isRasterFileName, rasterPathForDrawing } from "@/lib/drawingDiffPair";
import type { DiffImageSource } from "@/features/shared/DiffView";
import type { Drawing } from "@/app/designQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveSource(client: any, d: Drawing, projectId: string): Promise<DiffImageSource> {
  const label = `${d.revision} · ${(d.releaseDate ?? "").slice(0, 10)}`.trim();
  try {
    const files: DrawingFileRef[] = [];
    const res = await listDrawingFiles(client, projectId, d.id);
    if (res.ok) files.push(...res.data);
    const path = rasterPathForDrawing(d, files);
    if (!path) return { label, url: null, raster: false };
    const urlRes = await drawingFileUrl(client, path, 300);
    const url = urlRes.ok ? urlRes.data : null;
    return { label, url, raster: url ? isRasterFileName(path) : false };
  } catch {
    return { label, url: null, raster: false };
  }
}

export interface DrawingDiffPairSource {
  oldImage: DiffImageSource;
  newImage: DiffImageSource;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveDiffPair(client: any, projectId: string, oldD: Drawing, newerD: Drawing): Promise<DrawingDiffPairSource> {
  const [oldImage, newImage] = await Promise.all([
    resolveSource(client, oldD, projectId),
    resolveSource(client, newerD, projectId),
  ]);
  return { oldImage, newImage };
}