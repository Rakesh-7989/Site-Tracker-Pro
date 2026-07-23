import { h, csvRow } from "./escape";

const MAX_AUDIT_ROWS = 5000;

interface AuditActor {
  id?: string;
  name?: string;
  role?: string;
  org_id?: string | null;
}

interface AuditEntry {
  actor?: AuditActor;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  org_id?: string | null;
  action?: string;
  resource?: string;
  resource_id?: string | null;
  project_id?: string | null;
  before?: unknown;
  after?: unknown;
  message?: string;
  [key: string]: unknown;
}

interface AuditRow {
  id: string;
  ts: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  org_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  project_id: string | null;
  before: unknown;
  after: unknown;
  message: string;
  [key: string]: unknown;
}

interface FilterCriteria {
  actor_id?: string;
  action?: string;
  resource?: string;
  project_id?: string;
  from?: string;
  to?: string;
  q?: string;
}

export function recordAudit(currentLog: Record<string, unknown>[], entry: AuditEntry): Record<string, unknown>[] {
  if (!Array.isArray(currentLog)) currentLog = [];
  const row: AuditRow = {
    id: "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    ts: new Date().toISOString(),
    actor_id: entry.actor_id || entry.actor?.id || "system",
    actor_name: entry.actor_name || entry.actor?.name || "System",
    actor_role: entry.actor_role || entry.actor?.role || "system",
    org_id: entry.org_id ?? null,
    action: entry.action || "UPDATE",
    resource: entry.resource || "unknown",
    resource_id: entry.resource_id ?? null,
    project_id: entry.project_id ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    message: entry.message || "",
  };
  const next = [row, ...currentLog] as Record<string, unknown>[];
  if (next.length > MAX_AUDIT_ROWS) next.length = MAX_AUDIT_ROWS;
  return next;
}

export function filterAudit(log: Record<string, unknown>[], criteria: FilterCriteria = {}): Record<string, unknown>[] {
  if (!Array.isArray(log)) return [];
  const { actor_id, action, resource, project_id, from, to, q } = criteria;
  const qLower = q?.trim().toLowerCase();
  return log.filter(r => {
    if (actor_id && r.actor_id !== actor_id) return false;
    if (action && r.action !== action) return false;
    if (resource && r.resource !== resource) return false;
    if (project_id && r.project_id !== project_id) return false;
    if (from && (r.ts as string) < from) return false;
    if (to && (r.ts as string) > to) return false;
    if (qLower) {
      const hay = `${String(r.actor_name || "")} ${String(r.message || "")} ${String(r.resource_id || "")}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
}

export function exportAuditCsv(rows: Record<string, unknown>[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const head = ["Timestamp", "Actor", "Role", "Action", "Resource", "Resource ID", "Project", "Message"];
  const lines = [csvRow(head)];
  for (const r of rows) {
    lines.push(csvRow([
      r.ts,
      r.actor_name,
      r.actor_role,
      r.action,
      r.resource,
      r.resource_id || "",
      r.project_id || "",
      r.message || "",
    ]));
  }
  return lines.join("\n");
}

export function auditSummary(r: Record<string, unknown>): string {
  if (!r) return "";
  return `${h(r.actor_name)} ${h(String(r.action || "").toLowerCase())} ${h(r.resource)}${r.resource_id ? ` #${h(String(r.resource_id))}` : ""}${r.message ? ` — ${h(r.message)}` : ""}`;
}

export function auditStats(log: Record<string, unknown>[], days = 7): { total: number; byAction: Record<string, number>; byActor: Record<string, number>; recent: number } {
  if (!Array.isArray(log)) return { total: 0, byAction: {}, byActor: {}, recent: 0 };
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  let recent = 0;
  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};
  for (const r of log) {
    if ((r.ts as string) >= cutoff) recent += 1;
    const action = String(r.action || "");
    const actor = String(r.actor_name || "");
    byAction[action] = (byAction[action] || 0) + 1;
    byActor[actor] = (byActor[actor] || 0) + 1;
  }
  return { total: log.length, byAction, byActor, recent };
}
