// SiteTrack Pro — audit log queries for the v3 shell.
// Schema: scripts/supabase/03_rls_phase1.sql (audit_log_v2)

import type { QueryResult } from "@/app/queries";

export interface AuditLogRow {
  id: string;
  orgId: string;
  projectId: string | null;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string | null;
  message: string | null;
  ts: string;
}

export interface AuditStats {
  total: number;
  recent: number;
  byAction: Record<string, number>;
}

export interface AuditLogFilters {
  q?: string;
  actorId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

function mapRow(r: Record<string, unknown>): AuditLogRow {
  return {
    id: String(r.id),
    orgId: String(r.org_id ?? ""),
    projectId: r.project_id == null ? null : String(r.project_id),
    actorId: String(r.actor_id ?? ""),
    actorName: String(r.actor_name ?? ""),
    actorRole: String(r.actor_role ?? ""),
    action: String(r.action ?? ""),
    resource: String(r.resource ?? ""),
    resourceId: r.resource_id == null ? null : String(r.resource_id),
    message: r.message == null ? null : String(r.message),
    ts: String(r.ts ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listAuditLog(client: any, orgId: string, filters: AuditLogFilters = {}): Promise<QueryResult<AuditLogRow[]>> {
  try {
    let query = client
      .from("audit_log_v2")
      .select("id, org_id, project_id, actor_id, actor_name, actor_role, action, resource, resource_id, message, ts")
      .eq("org_id", orgId)
      .order("ts", { ascending: false });

    if (filters.actorId) query = query.eq("actor_id", filters.actorId);
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.resource) query = query.eq("resource", filters.resource);
    if (filters.q) query = query.or(`actor_name.ilike.%${filters.q}%,message.ilike.%${filters.q}%,resource_id.ilike.%${filters.q}%`);
    if (filters.from) query = query.gte("ts", filters.from);
    if (filters.to) query = query.lte("ts", filters.to);

    const limit = filters.limit ?? 200;
    const offset = filters.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return { ok: true, data: rows.map(mapRow) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAuditActors(client: any, orgId: string): Promise<QueryResult<{ id: string; name: string }[]>> {
  try {
    const { data, error } = await client
      .from("audit_log_v2")
      .select("actor_id, actor_name")
      .eq("org_id", orgId)
      .order("actor_name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    const actors: { id: string; name: string }[] = [];
    for (const r of rows) {
      const id = String(r.actor_id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      actors.push({ id, name: String(r.actor_name ?? "") });
    }
    return { ok: true, data: actors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAuditStats(client: any, orgId: string, days = 7): Promise<QueryResult<AuditStats>> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: totalData, error: totalErr } = await client
      .from("audit_log_v2")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (totalErr) return { ok: false, error: String(totalErr.message ?? totalErr) };

    const { data: recentData, error: recentErr } = await client
      .from("audit_log_v2")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("ts", since);
    if (recentErr) return { ok: false, error: String(recentErr.message ?? recentErr) };

    const { data: actionData, error: actionErr } = await client
      .from("audit_log_v2")
      .select("action")
      .eq("org_id", orgId)
      .gte("ts", since);
    if (actionErr) return { ok: false, error: String(actionErr.message ?? actionErr) };

    const rows = (actionData ?? []) as Array<Record<string, unknown>>;
    const byAction: Record<string, number> = {};
    for (const r of rows) {
      const a = String(r.action ?? "");
      byAction[a] = (byAction[a] || 0) + 1;
    }

    return {
      ok: true,
      data: {
        total: totalData?.length ?? totalData ?? 0,
        recent: recentData?.length ?? recentData ?? 0,
        byAction,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
