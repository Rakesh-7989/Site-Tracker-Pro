interface User {
  is_staff?: boolean;
  role?: string;
  email?: string;
  [key: string]: unknown;
}

export const STUB_VIEWS = new Set([
  "ar-overlay",
  "kiosk-labour",
  "kiosk-site",
  "snapshot",
  "admin-audit-log",
  "admin-branding",
]);

export const STUB_TABS = new Set<string>();

export const PRIMARY_WORKFLOW = "dpr";

export function isStubView(viewId: string): boolean {
  return STUB_VIEWS.has(viewId);
}

export function isStubTab(tabId: string): boolean {
  return STUB_TABS.has(tabId);
}

export function isStaffUser(user: User): boolean {
  if (!user || typeof user !== "object") return false;
  if (user.is_staff === true) return true;
  if (user.role === "superadmin") return true;
  try {
    const env = (typeof import.meta !== "undefined" ? import.meta.env : {}) as Record<string, unknown>;
    const allow = (env.VITE_STAFF_EMAILS as string) || "";
    if (!allow) return false;
    const list = String(allow).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const email = String(user.email || "").trim().toLowerCase();
    return !!(email && list.includes(email));
  } catch {
    return false;
  }
}

export function isViewStubBlocked(user: User, viewId: string): boolean {
  return isStubView(viewId) && !isStaffUser(user);
}

export function isTabStubBlocked(user: User, tabId: string): boolean {
  return isStubTab(tabId) && !isStaffUser(user);
}
