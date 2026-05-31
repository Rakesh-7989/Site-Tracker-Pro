// SiteTrack Pro — Project archive + restore (Session 25, competitor-gap miss).
//
// Procore has soft-delete with 90-day restore window — once a firm has 50+
// projects, they need to hide completed/cancelled ones from the main list
// without losing the history. We were missing this.
//
// Pure functions. The actual project state lives in App.jsx useLS("projects");
// these helpers return NEW arrays. Caller threads the result back via setProjects.
//
// Data model: add `archived_at` (ISO string) on the project row. When non-null
// the project is archived. Restore = set back to null. Permanent purge runs
// at archived_at + 90 days (a separate cron — for now we just expose
// `isPurgeable()` so callers can prompt the user).

const PURGE_AFTER_DAYS = 90;

/** Archive a project (set archived_at). Returns NEW projects array. */
export function archiveProject(projects, id, now = new Date()) {
  if (!Array.isArray(projects) || !id) return projects || [];
  return projects.map(p =>
    p.id === id ? { ...p, archived_at: now.toISOString() } : p
  );
}

/** Restore a project (clear archived_at). Returns NEW projects array. */
export function restoreProject(projects, id) {
  if (!Array.isArray(projects) || !id) return projects || [];
  return projects.map(p => {
    if (p.id !== id) return p;
    const { archived_at: _drop, ...rest } = p;
    return rest;
  });
}

/** True when a project is currently archived. */
export function isArchived(project) {
  return !!project?.archived_at;
}

/** Days since archive. Returns null when not archived. */
export function daysSinceArchive(project, now = new Date()) {
  if (!isArchived(project)) return null;
  const ms = now.getTime() - new Date(project.archived_at).getTime();
  return Math.floor(ms / 86_400_000);
}

/** Days remaining before permanent purge (90-day window). Negative = past due. */
export function daysUntilPurge(project, now = new Date()) {
  const since = daysSinceArchive(project, now);
  if (since === null) return null;
  return PURGE_AFTER_DAYS - since;
}

/** True when a project is past its purge window and ready for hard delete. */
export function isPurgeable(project, now = new Date()) {
  const remaining = daysUntilPurge(project, now);
  return remaining !== null && remaining < 0;
}

/** Partition a list into { active, archived }. */
export function partitionByArchive(projects) {
  if (!Array.isArray(projects)) return { active: [], archived: [] };
  const active = [];
  const archived = [];
  for (const p of projects) {
    if (isArchived(p)) archived.push(p); else active.push(p);
  }
  return { active, archived };
}

/** List archived projects eligible for permanent purge today. */
export function listPurgeCandidates(projects, now = new Date()) {
  return (projects || []).filter(p => isPurgeable(p, now));
}

export { PURGE_AFTER_DAYS };
