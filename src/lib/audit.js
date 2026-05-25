// SiteTrack Pro — Immutable audit log.
//
// Why this matters:
//   The client-side `activity` feed is convenient but mutable and per-user.
//   Auditors + compliance officers + super admins need an append-only record
//   that says "user X changed field Y from A to B at time T". This module is
//   the front-half — when the Supabase backend is wired, the same shape is
//   written server-side via the same recordAudit() call (the lib detects the
//   backend and switches transparently).
//
// Action vocabulary (keep stable — used by the Audit View filters):
//   CREATE | UPDATE | DELETE | APPROVE | REJECT | RELEASE | UPLOAD | LOGIN |
//   IMPERSONATE | EXPORT | PAYMENT | DELEGATE
//
// Resource vocabulary:
//   project | drawing | boq | ra_bill | mb | po | invoice | issue | rfi |
//   change_order | user | org | subscription | comment | unit | block | floor

import { h, csvRow } from "./escape.js";

const MAX_AUDIT_ROWS = 5000; // hard cap so localStorage doesn't blow up

/**
 * Append an entry to the audit log array. Returns a NEW array (immutable).
 * Caller is expected to pass the returned array back into setAuditLog().
 *
 *   const next = recordAudit(audit, { actor: user, action: "APPROVE", ... });
 *   setAudit(next);
 */
export function recordAudit(currentLog, entry) {
  if (!Array.isArray(currentLog)) currentLog = [];
  const row = {
    id: "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    ts: new Date().toISOString(),
    actor_id: entry.actor?.id || "system",
    actor_name: entry.actor?.name || "System",
    actor_role: entry.actor?.role || "system",
    org_id: entry.actor?.org_id || entry.org_id || null,
    action: entry.action || "UPDATE",
    resource: entry.resource || "unknown",
    resource_id: entry.resource_id || null,
    project_id: entry.project_id || null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    message: entry.message || "",
  };
  const next = [row, ...currentLog];
  // Hard cap — drop oldest
  if (next.length > MAX_AUDIT_ROWS) next.length = MAX_AUDIT_ROWS;
  return next;
}

/**
 * Filter audit log by any combination of: actor, action, resource, project,
 * date range, free-text. Returns a NEW array.
 */
export function filterAudit(log, criteria = {}) {
  if (!Array.isArray(log)) return [];
  const { actor_id, action, resource, project_id, from, to, q } = criteria;
  const qLower = q?.trim().toLowerCase();
  return log.filter(r => {
    if (actor_id && r.actor_id !== actor_id) return false;
    if (action && r.action !== action) return false;
    if (resource && r.resource !== resource) return false;
    if (project_id && r.project_id !== project_id) return false;
    if (from && r.ts < from) return false;
    if (to && r.ts > to) return false;
    if (qLower) {
      const hay = `${r.actor_name} ${r.message} ${r.resource_id || ""}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });
}

/** Export filtered rows to a downloadable CSV string. */
export function exportAuditCsv(rows) {
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

/** Human-friendly summary line for one entry (used in compact list views). */
export function auditSummary(r) {
  if (!r) return "";
  return `${h(r.actor_name)} ${h(r.action.toLowerCase())} ${h(r.resource)}${r.resource_id ? ` #${h(String(r.resource_id))}` : ""}${r.message ? ` — ${h(r.message)}` : ""}`;
}

/** Quick stats — how many actions in last N days, top actors. */
export function auditStats(log, days = 7) {
  if (!Array.isArray(log)) return { total: 0, byAction: {}, byActor: {}, recent: 0 };
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
  let recent = 0;
  const byAction = {};
  const byActor = {};
  for (const r of log) {
    if (r.ts >= cutoff) recent += 1;
    byAction[r.action] = (byAction[r.action] || 0) + 1;
    byActor[r.actor_name] = (byActor[r.actor_name] || 0) + 1;
  }
  return { total: log.length, byAction, byActor, recent };
}
