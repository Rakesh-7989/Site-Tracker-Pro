// SiteTrack Pro — issue queries (v3 port, Batch 1). DB-wired to `issues`.

export type IssueSeverity = "high" | "medium" | "low";
export type IssueStatus = "open" | "resolved";

export interface Issue {
  id: string;
  title: string;
  description: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  reportedDate: string | null;
  resolvedDate: string | null;
}

export type IQResult<T> = { ok: true; data: T } | { ok: false; error: string };

const SEV: IssueSeverity[] = ["high", "medium", "low"];
const asSeverity = (v: unknown): IssueSeverity => (SEV.includes(v as IssueSeverity) ? (v as IssueSeverity) : "medium");
const asStatus = (v: unknown): IssueStatus => (v === "resolved" ? "resolved" : "open");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listIssues(client: any, projectId: string): Promise<IQResult<Issue[]>> {
  try {
    const { data, error } = await client
      .from("issues")
      .select("id, title, description, severity, status, reported_date, resolved_date")
      .eq("project_id", projectId)
      .order("reported_date", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      title: String(r.title ?? "Untitled"),
      description: r.description == null ? null : String(r.description),
      severity: asSeverity(r.severity),
      status: asStatus(r.status),
      reportedDate: r.reported_date == null ? null : String(r.reported_date),
      resolvedDate: r.resolved_date == null ? null : String(r.resolved_date),
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { projectId: string; title: string; description?: string; severity?: IssueSeverity; reportedBy: string },
): Promise<IQResult<{ id: string }>> {
  try {
    const { data, error } = await client.from("issues").insert({
      project_id: input.projectId,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      reported_by: input.reportedBy,
    }).select("id").single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Resolve or reopen an issue. */
export async function setIssueResolved(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  id: string,
  resolved: boolean,
  resolverId: string,
): Promise<IQResult<{ ok: true }>> {
  try {
    const patch = resolved
      ? { status: "resolved", resolved_date: new Date().toISOString().slice(0, 10), resolved_by: resolverId }
      : { status: "open", resolved_date: null, resolved_by: null };
    const { error } = await client.from("issues").update(patch).eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteIssue(client: any, id: string): Promise<IQResult<{ ok: true }>> {
  try {
    const { error } = await client.from("issues").delete().eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
