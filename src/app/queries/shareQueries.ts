// SiteTrack Pro — share-link queries (public/read-only project data).

import type { ConstructionIndustry } from "@/auth";

export interface ShareProjectData {
  id: string;
  name: string;
  type: string;
  status: string | null;
  location: string | null;
  industrySubtype?: ConstructionIndustry | null;
  startDate: string | null;
  description: string | null;
  progress: number | null;
  expectedEndDate: string | null;
  clientName: string | null;
}

export interface ShareMilestone {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedDate: string | null;
}

export interface ShareUpdate {
  id: string;
  updateDate: string | null;
  notes: string | null;
  weather: string | null;
  workersCount: number | null;
}

export interface ShareDrawing {
  id: string;
  title: string;
  type: string;
  revision: string | null;
  date: string | null;
  status: string | null;
  notes: string | null;
  files: unknown[] | null;
}

export type ShareDataResult =
  | { ok: true; project: ShareProjectData; milestones: ShareMilestone[]; updates: ShareUpdate[]; drawings: ShareDrawing[] }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getShareData(client: any, projectId: string): Promise<ShareDataResult> {
  try {
    const [projectRes, milestonesRes, updatesRes, drawingsRes] = await Promise.all([
      client
        .from("projects")
        .select("id, name, type, status, location, start_date, description, progress, expected_end_date, client_name, industry_subtype")
        .eq("id", projectId)
        .single(),
      client
        .from("milestones")
        .select("id, title, status, due_date, completed_date")
        .eq("project_id", projectId)
        .order("due_date", { ascending: true }),
      client
        .from("site_updates")
        .select("id, update_date, notes, weather, workers_count")
        .eq("project_id", projectId)
        .order("update_date", { ascending: false })
        .limit(10),
      client
        .from("drawings")
        .select("id, title, type, revision, release_date, status, notes, storage_path, preview_url")
        .eq("project_id", projectId)
        .eq("status", "current")
        .contains("released_to", ["client"])
        .order("release_date", { ascending: false, nullsFirst: false }),
    ]);

    if (projectRes.error) return { ok: false, error: String(projectRes.error.message ?? projectRes.error) };

    const proj = projectRes.data as Record<string, unknown>;
    const project: ShareProjectData = {
      id: String(proj.id),
      name: String(proj.name ?? ""),
      type: String(proj.type ?? "construction"),
      status: proj.status === undefined || proj.status === null ? null : String(proj.status),
      location: proj.location === undefined || proj.location === null ? null : String(proj.location),
      startDate: proj.start_date === undefined || proj.start_date === null ? null : String(proj.start_date),
      description: proj.description === undefined || proj.description === null ? null : String(proj.description),
      progress: proj.progress === undefined || proj.progress === null ? null : Number(proj.progress),
      expectedEndDate: proj.expected_end_date === undefined || proj.expected_end_date === null ? null : String(proj.expected_end_date),
      clientName: proj.client_name === undefined || proj.client_name === null ? null : String(proj.client_name),
      industrySubtype: proj.industry_subtype == null ? null : (proj.industry_subtype as import("@/auth").ConstructionIndustry),
    };

    const mapRow = <T>(rows: unknown, fn: (r: Record<string, unknown>) => T): T[] =>
      (rows as Array<Record<string, unknown>> ?? []).map(fn);

    const milestones: ShareMilestone[] = mapRow(milestonesRes.data, r => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      status: String(r.status ?? "pending"),
      dueDate: r.due_date === undefined || r.due_date === null ? null : String(r.due_date),
      completedDate: r.completed_date === undefined || r.completed_date === null ? null : String(r.completed_date),
    }));

    const updates: ShareUpdate[] = mapRow(updatesRes.data, r => ({
      id: String(r.id),
      updateDate: r.update_date === undefined || r.update_date === null ? null : String(r.update_date),
      notes: r.notes === undefined || r.notes === null ? null : String(r.notes),
      weather: r.weather === undefined || r.weather === null ? null : String(r.weather),
      workersCount: r.workers_count === undefined || r.workers_count === null ? null : Number(r.workers_count),
    }));

    const drawings: ShareDrawing[] = mapRow(drawingsRes.data, r => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      type: String(r.type ?? ""),
      revision: r.revision === undefined || r.revision === null ? null : String(r.revision),
      date: r.release_date === undefined || r.release_date === null ? null : String(r.release_date),
      status: r.status === undefined || r.status === null ? null : String(r.status),
      notes: r.notes === undefined || r.notes === null ? null : String(r.notes),
      files: r.storage_path == null ? (r.preview_url == null ? null : [r.preview_url]) : [r.storage_path],
    }));

    return { ok: true, project, milestones, updates, drawings };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}
