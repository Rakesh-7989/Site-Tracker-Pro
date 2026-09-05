// SiteTrack Pro — PM Dashboard queries.

import type { MemberProjectScope } from "./queries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ProjectBrief { id: string; name: string; location: string | null; status: string; progress: number; }
export interface NotifBrief { id: string; title: string; body: string; }

export async function listPMProjects(client: TypedSupabaseClient, orgId: string, scope: MemberProjectScope = { mode: "all" }): Promise<PResult<ProjectBrief[]>> {
  try {
    let query = client.from("projects").select("id, name, location, status, progress").eq("org_id", orgId);
    if (scope.mode === "member") {
      // PostgREST ignores `IN ()` on an empty array — short-circuit instead.
      if (scope.projectIds.length === 0) return { ok: true, data: [] };
      query = query.in("id", scope.projectIds);
    }
    const { data, error } = await query.order("name");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), name: String(r.name), location: r.location == null ? null : String(r.location), status: String(r.status), progress: typeof r.progress === "number" ? r.progress : 0 })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listPMNotifications(client: TypedSupabaseClient): Promise<PResult<NotifBrief[]>> {
  try {
    const { data, error } = await client.from("notifications").select("id, title, body").order("created_at", { ascending: false }).limit(10);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: Record<string, unknown>) => ({ id: String(r.id), title: r.title == null ? "" : String(r.title), body: r.body == null ? "" : String(r.body) })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
