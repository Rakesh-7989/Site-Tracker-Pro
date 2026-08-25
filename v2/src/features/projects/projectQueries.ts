import { getClient } from "@/lib/supabase";
import { memberProjectScope, type AppSession, type MemberProjectScope } from "@/auth/types";

export interface ProjectRow {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: number | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  budget: number | null;
  created_at: string | null;
}

function mapRow(r: RawRow): ProjectRow {
  return {
    id: r.id,
    name: r.name ?? "",
    type: r.type ?? "",
    status: r.status ?? "",
    budget: r.budget,
    createdAt: r.created_at ?? "",
  };
}

export async function listProjectsForOrg(
  session: AppSession,
): Promise<ProjectRow[]> {
  const orgId = session.activeOrgId;
  if (!orgId) return [];
  const scope: MemberProjectScope = memberProjectScope(session);
  if (scope.mode === "member" && (scope.projectIds?.length ?? 0) === 0) return [];

  let q = getClient()
    .from("projects")
    .select("id, name, type, status, budget, created_at")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (scope.mode === "member") q = q.in("id", scope.projectIds as string[]);

  const { data, error } = await q;
  if (error) throw new Error(`projects-failed:${error.message}`);
  return ((data ?? []) as unknown as RawRow[]).map(mapRow);
}
