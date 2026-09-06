// SiteTrack Pro — consultancy deliverable file uploads (v4 C3.2).
// Uses the private `deliverables` storage bucket (migration 145). Object path
// scheme is <project_id>/<deliverable_id>/<file_name> so RLS (145) can gate on
// the first path segment = project id. This module exposes pure path/name
// helpers (unit-testable, no client) + thin Supabase Storage wrappers.
//
// Access mirrors the deliverables table gates via storage RLS:
//   read   → project member · insert/update → member (non client-ish)
//   delete → managers + org admin (incl. project-tier via has_project_role)

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export const DELIVERABLE_BUCKET = "deliverables";

/** Max upload size = the bucket file_size_limit (migrations 145/200): 50 MB. */
export const DELIVERABLE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Allowed file extensions (SEC-P1-6): CAD + docs + site images only.
 * Blocks stored-HTML/SVG/JS (.html/.svg/.js) that would run in the storage
 * origin when opened, plus executables. Keep in sync with the file-input
 * `accept` attr in DeliverablesTab.
 */
export const DELIVERABLE_ALLOWED_EXTENSIONS = [
  "pdf", "dwg", "dxf", "dwf", "skp", "ifc", "rvt",
  "png", "jpg", "jpeg", "webp",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
] as const;

/** `accept` attr value derived from the allowlist (dot-prefixed, comma-joined). */
export const DELIVERABLE_ACCEPT = DELIVERABLE_ALLOWED_EXTENSIONS.map(e => `.${e}`).join(",");

/**
 * Pure pre-upload validation: extension allowlist + size cap.
 * Returns an error message, or null when the file may be uploaded.
 */
export function validateDeliverableFile(fileName: string, sizeBytes: number): string | null {
  const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (!ext || !(DELIVERABLE_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return `File type .${ext || "?"} is not allowed. Allowed: ${DELIVERABLE_ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if ((Number(sizeBytes) || 0) > DELIVERABLE_MAX_BYTES) {
    return `File is larger than ${formatBytes(DELIVERABLE_MAX_BYTES)}.`;
  }
  return null;
}

/** Byte size of an upload payload (Blob | ArrayBuffer | string). */
export function uploadPayloadSize(file: Blob | ArrayBuffer | string): number {
  if (typeof file === "string") return file.length;
  if (typeof Blob !== "undefined" && file instanceof Blob) return file.size;
  return (file as ArrayBuffer).byteLength ?? 0;
}

/** Folder holding every file for one deliverable: <project_id>/<deliverable_id>. */
export function deliverableFolder(projectId: string, deliverableId: string): string {
  return `${projectId}/${deliverableId}`;
}

/** Full storage path for one file. */
export function deliverableObjectPath(projectId: string, deliverableId: string, fileName: string): string {
  return `${deliverableFolder(projectId, deliverableId)}/${sanitizeFileName(fileName)}`;
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

export interface DeliverableFileRef {
  name: string;
  size: number;
  /** e.g. 2026-08-01T10:00:00.000Z */
  updatedAt: string | null;
}

// ── Client wrappers (injected supabase client; storage API) ──────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

/** List files inside a deliverable's folder. */
export async function listDeliverableFiles(client: any, projectId: string, deliverableId: string): Promise<Result<DeliverableFileRef[]>> {
  try {
    const { data, error } = await client
      .storage
      .from(DELIVERABLE_BUCKET)
      .list(deliverableFolder(projectId, deliverableId));
    if (error) return dbe(error);
    const refs: DeliverableFileRef[] = ((data ?? []) as Array<Record<string, unknown>>)
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
export async function uploadDeliverableFile(
  client: any, projectId: string, deliverableId: string, file: Blob | ArrayBuffer | string,
  fileName: string, opts?: { upsert?: boolean },
): Promise<Result<{ path: string }>> {
  try {
    const rejected = validateDeliverableFile(fileName, uploadPayloadSize(file));
    if (rejected) return { ok: false, error: rejected };
    const path = deliverableObjectPath(projectId, deliverableId, fileName);
    const { error } = await client.storage.from(DELIVERABLE_BUCKET).upload(path, file, {
      upsert: opts?.upsert ?? true,
      cacheControl: "3600",
    });
    if (error) return dbe(error);
    return ok({ path });
  } catch (e) { return er(e); }
}

/** Delete one or many deliverable files by storage path(s). */
export async function deleteDeliverableFiles(client: any, paths: string[]): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.storage.from(DELIVERABLE_BUCKET).remove(paths);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Short-lived signed URL for one storage path (private bucket download). */
export async function deliverableFileUrl(client: any, path: string, expiresIn = 300): Promise<Result<string>> {
  try {
    const { data, error } = await client
      .storage.from(DELIVERABLE_BUCKET).createSignedUrl(path, expiresIn);
    if (error) return dbe(error);
    return ok(String(data?.signedUrl ?? ""));
  } catch (e) { return er(e); }
}