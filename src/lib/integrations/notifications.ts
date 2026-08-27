export interface NotifRow {
  id: string;
  pid?: string;
  title?: string;
  [key: string]: unknown;
}

export interface NotifUser {
  id: string;
  email?: string;
  role: string;
  [key: string]: unknown;
}

export interface NotifProject {
  id: string;
  client_email?: string;
  [key: string]: unknown;
}

export function notifsForUser(
  allNotifs: NotifRow[] | null | undefined,
  user: NotifUser | null | undefined,
  projects: NotifProject[] | null | undefined,
): NotifRow[] {
  if (!user) return [];
  const visibleProjects = (projects || []).filter(p => {
    if (user.role === "client") {
      return p.client_email === user.email;
    }
    return true;
  });
  const visible = new Set(visibleProjects.map(p => p.id));
  if (user.role === "client") {
    return (allNotifs || []).filter(n => n.pid && visible.has(n.pid));
  }
  return (allNotifs || []).filter(n => !n.pid || visible.has(n.pid));
}
