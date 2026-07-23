export interface ProjectRow {
  id: string;
  archived_at?: string;
  [key: string]: unknown;
}

export const PURGE_AFTER_DAYS = 90;

export function archiveProject<T extends ProjectRow>(projects: T[], id: string, now: Date = new Date()): T[] {
  if (!Array.isArray(projects) || !id) return projects || [];
  return projects.map(p =>
    p.id === id ? { ...p, archived_at: now.toISOString() } : p
  );
}

export function restoreProject<T extends ProjectRow>(projects: T[], id: string): T[] {
  if (!Array.isArray(projects) || !id) return projects || [];
  return projects.map(p => {
    if (p.id !== id) return p;
    const { archived_at: _drop, ...rest } = p;
    return rest as T;
  });
}

export function isArchived(project: ProjectRow | null | undefined): boolean {
  return !!project?.archived_at;
}

export function daysSinceArchive(project: ProjectRow, now: Date = new Date()): number | null {
  if (!isArchived(project)) return null;
  const ms = now.getTime() - new Date(project.archived_at!).getTime();
  return Math.floor(ms / 86_400_000);
}

export function daysUntilPurge(project: ProjectRow, now: Date = new Date()): number | null {
  const since = daysSinceArchive(project, now);
  if (since === null) return null;
  return PURGE_AFTER_DAYS - since;
}

export function isPurgeable(project: ProjectRow, now: Date = new Date()): boolean {
  const remaining = daysUntilPurge(project, now);
  return remaining !== null && remaining < 0;
}

export function partitionByArchive<T extends ProjectRow>(projects: T[]): { active: T[]; archived: T[] } {
  if (!Array.isArray(projects)) return { active: [], archived: [] };
  const active: T[] = [];
  const archived: T[] = [];
  for (const p of projects) {
    if (isArchived(p)) archived.push(p); else active.push(p);
  }
  return { active, archived };
}

export function listPurgeCandidates<T extends ProjectRow>(projects: T[], now: Date = new Date()): T[] {
  return (projects || []).filter(p => isPurgeable(p, now));
}
