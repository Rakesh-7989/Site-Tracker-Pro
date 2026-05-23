// SiteTrack Pro — Notification visibility filter
//
// Why this exists: notifications live in a single flat list (sitetrack_v2
// "notifs" key in localStorage, or `notifications` table in Supabase). The
// list is shared by all roles, but each role can only see notifications for
// projects they have access to.
//
// Tech Lead Review finding HIGH-2 (2026-05-22): ClientPortal previously
// showed every notification without project filtering — a client could see
// "Update on Project Belonging To Different Org" in their bell badge.

import { visibleProjectsForUser } from "./permissions.js";

/**
 * Filter notifications by which projects the user can access.
 *
 * Rules:
 *  - Super admin / Architect / PM / Contractor: see notifications for any
 *    project in `visibleProjectsForUser(projects, user)`. Notifications
 *    without `pid` are treated as system/global and are kept (these are
 *    things like "Welcome", "New feature" — non-tenant-data).
 *  - Client: see ONLY notifications with `pid` matching a project where
 *    `project.client_email === user.email`. Notifications without `pid` are
 *    DROPPED for clients (defense in depth: a stray global notif must never
 *    appear in a client portal).
 *
 * @param {Array} allNotifs raw notification rows
 * @param {Object} user current user
 * @param {Array} projects all projects the app has loaded
 * @returns filtered notification array (does not mutate input)
 */
export function notifsForUser(allNotifs, user, projects) {
  if (!user) return [];
  const visible = new Set(
    (visibleProjectsForUser(projects || [], user) || []).map(p => p.id)
  );
  if (user.role === "client") {
    return (allNotifs || []).filter(n => n.pid && visible.has(n.pid));
  }
  return (allNotifs || []).filter(n => !n.pid || visible.has(n.pid));
}
