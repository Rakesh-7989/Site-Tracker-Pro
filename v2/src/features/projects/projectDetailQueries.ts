import { getClient } from "@/lib/supabase";

export interface ProjectDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: number | null;
  clientName: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
}

function mapRow(r: RawRow): ProjectDetail {
  return {
    id: r.id,
    name: r.name ?? "",
    type: r.type ?? "",
    status: r.status ?? "",
    budget: r.budget,
    clientName: null,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at ?? "",
  };
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { data, error } = await getClient()
    .from("projects")
    .select("id, name, type, status, budget, start_date, end_date, created_at")
    .eq("id", projectId)
    .limit(1);
  if (error) throw new Error(`project-failed:${error.message}`);
  const row = (data ?? [])[0] as RawRow | undefined;
  if (!row) throw new Error("project-not-found");
  return mapRow(row);
}
