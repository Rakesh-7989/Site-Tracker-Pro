// SiteTrack Pro — storage-backed drawing file register (v4 D1).
// Reuses the private `deliverables` storage bucket (migration 145). Object path
// scheme is <project_id>/<drawing_id>/<file_name> so RLS (145) gates on the
// first path segment = project id (member read/insert/update, manager delete).
// Mirrors deliverableStorageQueries.ts (C3.2) — pure path/name helpers
// (unit-testable, no client) + thin Supabase Storage wrappers.
//
// Row-level drawings visibility is fixed in migration 149 (member read + the
// client-released rule); this module only concerns file storage.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

/** The storage bucket used for both deliverables and drawings (mig 145). */
export const DRAWING_BUCKET = "deliverables";

/** Max upload size = the bucket file_size_limit (migrations 145/200): 50 MB. */
export const DRAWING_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Allowed file extensions (SEC-P1-6): CAD + docs + site images only.
 * Blocks stored-HTML/SVG/JS (.html/.svg/.js) that would run in the storage
 * origin when opened, plus executables. Keep in sync with the file-input
 * `accept` attr in DrawingsTab.
 */
export const DRAWING_ALLOWED_EXTENSIONS = [
  "pdf", "dwg", "dxf", "dwf", "skp", "ifc", "rvt",
  "png", "jpg", "jpeg", "webp",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
] as const;

/** `accept` attr value derived from the allowlist (dot-prefixed, comma-joined). */
export const DRAWING_ACCEPT = DRAWING_ALLOWED_EXTENSIONS.map(e => `.${e}`).join(",");

/**
 * Pure pre-upload validation: extension allowlist + size cap.
 * Returns an error message, or null when the file may be uploaded.
 */
export function validateDrawingFile(fileName: string, sizeBytes: number): string | null {
  const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !(DRAWING_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `File type .${ext || "?"} is not allowed. Allowed: ${DRAWING_ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if ((Number(sizeBytes) || 0) > DRAWING_MAX_BYTES) {
    return `File is larger than ${formatBytes(DRAWING_MAX_BYTES)}.`;
  }
  return null;
}

/** Byte size of an upload payload (Blob | ArrayBuffer | string). */
export function uploadPayloadSize(file: Blob | ArrayBuffer | string): number {
  if (typeof file === "string") return file.length;
  if (typeof Blob !== "undefined" && file instanceof Blob) return file.size;
  return (file as ArrayBuffer).byteLength ?? 0;
}

/** Folder holding every file for one drawing: <project_id>/<drawing_id>. */
export function drawingFolder(projectId: string, drawingId: string): string {
  return `${projectId}/${drawingId}`;
}

/** Full storage path for one drawing file. */
export function drawingObjectPath(projectId: string, drawingId: string, fileName: string): string {
  return `${drawingFolder(projectId, drawingId)}/${sanitizeFileName(fileName)}`;
}

/** First path segment (project id) extracted from an object path. */
export function projectIdFromPath(path: string): string | null {
  const seg = path.split("/").filter(Boolean);
  return seg[0] ?? null;
}

/** Strip path separators + control chars so a client file name can't escape the folder. */
export function sanitizeFileName(name: string): string {
  return String(name ?? "")
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, "") // eslint-disable-line no-control-regex -- strip control chars from stored filenames
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 120) || "file";
}

/** Format a byte count for display. */
export function formatBytes(bytes: number): string {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export interface DrawingFileRef {
  name: string;
  size: number;
  /** e.g. 2026-08-01T10:00:00.000Z */
  updatedAt: string | null;
}

// ── Client wrappers (injected supabase client; storage API) ──────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

/** List files inside a drawing's folder. */
export async function listDrawingFiles(client: any, projectId: string, drawingId: string): Promise<Result<DrawingFileRef[]>> {
  try {
    const { data, error } = await client
      .storage
      .from(DRAWING_BUCKET)
      .list(drawingFolder(projectId, drawingId));
    if (error) return dbe(error);
    const refs: DrawingFileRef[] = ((data ?? []) as Array<Record<string, unknown>>)
      .filter(r => (r.metadata as { mimetype?: string } | undefined)?.mimetype !== "application/octet-stream" || typeof r.id === "undefined")
      .map(r => ({
        name: String(r.name ?? ""),
        size: Number((r as { metadata?: { size?: unknown } }).metadata?.size ?? r.size ?? 0),
        updatedAt: r.updated_at == null ? null : String(r.updated_at),
      }))
      .filter(f => f.name && !f.name.startsWith("."));
    return ok(refs);
  } catch (e) { return er(e); }
}

/** Upload one file (replaces an existing same-named file with upsert). */
export async function uploadDrawingFile(
  client: any, projectId: string, drawingId: string, file: Blob | ArrayBuffer | string,
  fileName: string, opts?: { upsert?: boolean },
): Promise<Result<{ path: string }>> {
  try {
    const rejected = validateDrawingFile(fileName, uploadPayloadSize(file));
    if (rejected) return { ok: false, error: rejected };
    const path = drawingObjectPath(projectId, drawingId, fileName);
    const { error } = await client.storage.from(DRAWING_BUCKET).upload(path, file, {
      upsert: opts?.upsert ?? true,
      cacheControl: "3600",
    });
    if (error) return dbe(error);
    return ok({ path });
  } catch (e) { return er(e); }
}

/** Delete one or many drawing files by storage path(s). */
export async function deleteDrawingFiles(client: any, paths: string[]): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.storage.from(DRAWING_BUCKET).remove(paths);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Short-lived signed URL for one storage path (private bucket download). */
export async function drawingFileUrl(client: any, path: string, expiresIn = 300): Promise<Result<string>> {
  try {
    const { data, error } = await client
      .storage.from(DRAWING_BUCKET).createSignedUrl(path, expiresIn);
    if (error) return dbe(error);
    return ok(String(data?.signedUrl ?? ""));
  } catch (e) { return er(e); }
}