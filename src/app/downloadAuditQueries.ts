// SiteTrack Pro — deliverable / drawing download audit (v4 E4).
// Records who downloaded which file from the shared `deliverables` storage
// bucket, per register row (deliverable vs drawing). The upload/download tabs
// log an event on every signed-URL download (append-only); this module exposes
// the org-wide rollup the Download Audit view renders.
//
// DB: download_events (migration 159). RLS: read = project member; insert =
// self + member; no update/delete. So the org rollup only surfaces downloads
// from projects the caller can already see.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export type DownloadRegister = "deliverable" | "drawing";
export const DOWNLOAD_REGISTERS: readonly DownloadRegister[] = ["deliverable", "drawing"];
const asRegister = (v: unknown): DownloadRegister => (DOWNLOAD_REGISTERS.includes(v as DownloadRegister) ? (v as DownloadRegister) : "deliverable");

export interface DownloadEventInput {
  projectId: string;
  register: DownloadRegister;
  refId: string;
  fileName: string;
  filePath: string;
  sizeBytes?: number;
}

export interface DownloadEvent {
  id: string;
  projectId: string;
  register: DownloadRegister;
  refId: string;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  downloadedBy: string | null;
  downloadedAt: string;
}

export interface DecoratedDownloadEvent extends DownloadEvent {
  projectName: string | null;
  projectType: string | null;
  downloadedByName: string | null;
}

export interface ProjectBrief { id: string; name: string; type: string | null; }
export interface UserBrief { id: string; name: string; }

/**
 * Append a download event (fire-and-forget from the download handlers — the
 * download is not blocked on audit success). RLS enforces `downloaded_by =
 * auth.uid()` + project membership, so `downloadedBy` is left unset here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logDownloadEvent(client: any, input: DownloadEventInput): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("download_events").insert({
      project_id: input.projectId,
      register: input.register,
      ref_id: input.refId,
      file_name: input.fileName,
      file_path: input.filePath,
      size_bytes: input.sizeBytes ?? 0,
    });
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgProjectsBrief(client: any, orgId: string): Promise<Result<ProjectBrief[]>> {
  try {
    const { data, error } = await client
      .from("projects")
      .select("id, name, type")
      .eq("org_id", orgId);
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), type: r.type == null ? null : String(r.type),
    })));
  } catch (e) { return er(e); }
}

const DOWNLOAD_SELECT = "id, project_id, register, ref_id, file_name, file_path, size_bytes, downloaded_by, downloaded_at";

/**
 * Org-wide download events across the caller's member projects. Pulls the
 * project list once, the events in one `.in(project_id)` call, then profile
 * names for whichever users appear, before decorating with the pure helper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgDownloadEvents(client: any, orgId: string, limit = 200): Promise<Result<DecoratedDownloadEvent[]>> {
  try {
    const projectsRes = await listOrgProjectsBrief(client, orgId);
    if (!projectsRes.ok) return projectsRes;
    if (projectsRes.data.length === 0) return ok([]);
    const ids = projectsRes.data.map(p => p.id);

    const { data, error } = await client
      .from("download_events")
      .select(DOWNLOAD_SELECT)
      .in("project_id", ids)
      .order("downloaded_at", { ascending: false })
      .limit(limit);
    if (error) return dbe(error);

    const events: DownloadEvent[] = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      register: asRegister(r.register),
      refId: String(r.ref_id ?? ""),
      fileName: String(r.file_name ?? ""),
      filePath: String(r.file_path ?? ""),
      sizeBytes: Number(r.size_bytes ?? 0),
      downloadedBy: r.downloaded_by == null ? null : String(r.downloaded_by),
      downloadedAt: String(r.downloaded_at ?? ""),
    }));

    const userIds = [...new Set(events.map(e => e.downloadedBy).filter((v): v is string => !!v))];
    let users: UserBrief[] = [];
    if (userIds.length > 0) {
      const pRes = await client.from("profiles").select("id, name").in("id", userIds);
      if (pRes.error) return dbe(pRes.error);
      users = ((pRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({ id: String(r.id), name: String(r.name ?? "") }));
    }

    return ok(decorateDownloadEvents(events, projectsRes.data, users));
  } catch (e) { return er(e); }
}

/** Merge project + downloader names into ready-to-render rows (pure). */
export function decorateDownloadEvents(events: DownloadEvent[], projects: ProjectBrief[], users: UserBrief[]): DecoratedDownloadEvent[] {
  const projectsById = new Map(projects.map(p => [p.id, p]));
  const usersById = new Map(users.map(u => [u.id, u]));
  return events.map(e => {
    const p = projectsById.get(e.projectId);
    const u = e.downloadedBy ? usersById.get(e.downloadedBy) : null;
    return { ...e, projectName: p?.name ?? null, projectType: p?.type ?? null, downloadedByName: u?.name ?? null };
  });
}

/** Simple org totals by register for the summary strip. */
export function downloadTotals(rows: Array<{ register: DownloadRegister }>): { total: number; deliverable: number; drawing: number } {
  let deliverable = 0;
  for (const r of rows) {
    if (r.register === "drawing") continue;
    deliverable += 1;
  }
  return { total: rows.length, deliverable, drawing: rows.length - deliverable };
}