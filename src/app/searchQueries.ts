// SiteTrack Pro — global search query. Cross-entity via the global_search RPC
// (migration 87), scoped to the caller's orgs.

export type SearchResult = { ok: true; data: SearchHit[] } | { ok: false; error: string };
export type SearchKind = "project" | "vendor" | "milestone" | "task";
export interface SearchHit {
  kind: SearchKind;
  id: string;
  projectId: string | null;
  label: string;
  sublabel: string;
}

const asKind = (v: unknown): SearchKind => (["project", "vendor", "milestone", "task"].includes(v as string) ? (v as SearchKind) : "task");

/** Where a hit navigates to. */
export function hitUrl(h: SearchHit): string {
  if (h.kind === "project") return `/projects/${h.id}`;
  if (h.kind === "vendor") return "/vendors";
  if (h.kind === "milestone" && h.projectId) return `/projects/${h.projectId}/milestones`;
  if (h.kind === "task" && h.projectId) return `/projects/${h.projectId}/tasks`;
  return h.projectId ? `/projects/${h.projectId}` : "/projects";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function globalSearch(client: any, query: string): Promise<SearchResult> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, data: [] };
  try {
    const { data, error } = await client.rpc("global_search", { p_query: q, p_limit: 30 });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      kind: asKind(r.kind), id: String(r.id), projectId: r.project_id == null ? null : String(r.project_id),
      label: String(r.label ?? ""), sublabel: String(r.sublabel ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
