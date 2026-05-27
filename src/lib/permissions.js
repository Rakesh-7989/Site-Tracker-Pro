// SiteTrack Pro — pure permission helpers.
//
// This module mirrors the PERMS object in App.jsx so that role rules can be
// unit-tested without booting React/JSDOM. App.jsx still owns the in-app source
// of truth for now; a follow-up refactor (tracked in BACKLOG.md) should make
// App.jsx import from this module so the two cannot drift.

export const PERMS = {
  // ORG ADMIN — the builder-firm owner. Scoped to a SINGLE org_id (not cross-tenant
  // like superadmin). Manages members, billing, integrations, templates, approval
  // chains, notification rules. Can also operate as a senior architect inside
  // the org's projects.
  orgadmin: {
    createProject: true,
    editProgress: true,
    addUpdate: true,
    manageTeam: true,
    markAttendance: true,
    addExpense: true,
    deleteExpense: true,
    export: true,
    share: true,
    changeMilestone: true,
    addIssue: true,
    resolveIssue: true,
    addMaterial: true,
    deleteMaterial: true,
    manageDrawings: true,
    viewActivity: true,
    // Org-scoped admin caps (NOT cross-tenant like superadmin)
    manageOrgMembers: true,
    manageOrgBilling: true,
    manageOrgIntegrations: true,
    manageOrgTemplates: true,
    manageApprovalChains: true,
    manageNotificationRules: true,
    tabs: [
      "overview", "milestones", "tasks", "updates", "issues", "punchlist",
      "materials", "ledger", "boq", "estimate", "drawings", "rfi", "changeorders",
      "fieldops", "approvals", "inspections", "safety", "team", "attendance",
      "budget", "po", "invoices", "labour", "rabills", "map", "ai", "gantt",
    ],
    nav: [
      // Org Admin tier (the new one)
      "org-dashboard", "org-members", "org-billing", "org-integrations",
      "org-activity", "org-templates", "org-approvals", "org-notifications",
      "org-features", "org-onboarding",
      // Plus most of the tenant nav so they can still operate inside projects
      "dashboard", "projects", "calendar", "vendors", "po", "analytics",
      "activity", "messages", "notifications",
      "hierarchy", "material-prices", "compliance", "forecast", "delegations",
      "snapshot", "kiosk-labour", "kiosk-site", "ar-overlay",
      "admin-branding",
    ],
  },
  superadmin: {
    createProject: true,
    editProgress: true,
    addUpdate: true,
    manageTeam: true,
    markAttendance: true,
    addExpense: true,
    deleteExpense: true,
    export: true,
    share: true,
    changeMilestone: true,
    addIssue: true,
    resolveIssue: true,
    addMaterial: true,
    deleteMaterial: true,
    manageDrawings: true,
    viewActivity: true,
    // Cross-tenant admin-only capabilities
    manageUsers: true,
    manageOrgs: true,
    manageBilling: true,
    manageSettings: true,
    impersonate: true,
    // Sees every tab inside any project, plus admin-only top-level nav
    tabs: [
      "overview", "milestones", "tasks", "updates", "issues", "punchlist",
      "materials", "ledger", "boq", "estimate", "drawings", "rfi", "changeorders",
      "fieldops", "approvals", "inspections", "safety", "team", "attendance",
      "budget", "po", "invoices", "labour", "rabills", "map", "ai", "gantt",
    ],
    nav: [
      "admin-dashboard", "admin-users", "admin-orgs", "admin-billing",
      "admin-audit", "admin-usage", "admin-support", "admin-settings",
      "admin-audit-log", "admin-branding",
      "activity", "dashboard", "projects", "calendar",
      "vendors", "po", "analytics", "messages", "notifications",
      "hierarchy", "material-prices", "compliance", "forecast", "delegations",
      "snapshot", "kiosk-labour", "kiosk-site", "ar-overlay",
    ],
  },
  architect: {
    createProject: true,
    editProgress: true,
    addUpdate: true,
    manageTeam: true,
    markAttendance: true,
    addExpense: true,
    deleteExpense: true,
    export: true,
    share: true,
    changeMilestone: true,
    addIssue: true,
    resolveIssue: true,
    addMaterial: true,
    deleteMaterial: true,
    manageDrawings: true,
    viewActivity: true,
    tabs: [
      "overview", "milestones", "tasks", "updates", "issues", "punchlist",
      "materials", "ledger", "boq", "estimate", "drawings", "rfi", "changeorders",
      "fieldops", "approvals", "inspections", "safety", "team", "attendance",
      "budget", "po", "invoices", "labour", "rabills", "map", "ai", "gantt",
    ],
    nav: [
      "dashboard", "projects", "calendar", "vendors", "po", "analytics",
      "activity", "messages", "notifications",
      "hierarchy", "material-prices", "compliance", "forecast", "delegations",
      "snapshot", "kiosk-labour", "kiosk-site", "ar-overlay",
    ],
  },
  pm: {
    createProject: false,
    editProgress: false,
    addUpdate: true,
    manageTeam: false,
    markAttendance: true,
    addExpense: false,
    deleteExpense: false,
    export: true,
    share: false,
    changeMilestone: true,
    addIssue: true,
    resolveIssue: true,
    addMaterial: true,
    deleteMaterial: false,
    manageDrawings: false,
    viewActivity: false,
    tabs: [
      "overview", "milestones", "tasks", "updates", "issues", "punchlist",
      "materials", "ledger", "boq", "estimate", "drawings", "rfi", "changeorders",
      "fieldops", "approvals", "inspections", "safety", "team", "attendance",
      "budget", "po", "labour", "rabills", "map", "ai", "gantt",
    ],
    nav: [
      "dashboard", "projects", "calendar", "vendors", "po", "pm",
      "messages", "notifications",
      "hierarchy", "material-prices", "compliance",
      "snapshot", "kiosk-labour", "kiosk-site",
    ],
  },
  contractor: {
    createProject: false,
    editProgress: false,
    addUpdate: true,
    manageTeam: false,
    markAttendance: false,
    addExpense: false,
    deleteExpense: false,
    export: false,
    share: false,
    changeMilestone: false,
    addIssue: true,
    resolveIssue: false,
    addMaterial: true,
    deleteMaterial: false,
    manageDrawings: false,
    viewActivity: false,
    tabs: [
      "overview", "updates", "issues", "materials", "ledger", "drawings",
      "rfi", "fieldops", "approvals", "rabills", "map", "ai", "gantt",
    ],
    nav: ["dashboard", "projects", "messages", "notifications", "material-prices"],
  },
  client: {
    createProject: false,
    editProgress: false,
    addUpdate: false,
    manageTeam: false,
    markAttendance: false,
    addExpense: false,
    deleteExpense: false,
    export: false,
    share: false,
    changeMilestone: false,
    addIssue: false,
    resolveIssue: false,
    addMaterial: false,
    deleteMaterial: false,
    manageDrawings: false,
    viewActivity: false,
    tabs: ["overview", "milestones", "updates", "drawings", "boq", "estimate", "changeorders", "approvals", "invoices", "map", "ai", "gantt"],
    nav: ["dashboard", "calendar", "client", "notifications"],
  },
};

export const isSuperAdmin = user => user?.role === "superadmin";
export const isOrgAdmin = user => user?.role === "orgadmin";

export const can = (user, p) => !!(user && PERMS[user.role]?.[p]);

export const visibleProjectsForUser = (projects, user) => {
  if (isSuperAdmin(user)) return projects;
  if (isOrgAdmin(user)) return projects.filter(p => !p.org_id || p.org_id === user.org_id);
  if (user?.role === "client") return projects.filter(p => p.client_email === user.email);
  return projects;
};

export const canAccessProject = (user, project) => {
  if (!user || !project) return false;
  if (isSuperAdmin(user)) return true;
  if (isOrgAdmin(user)) return !project.org_id || project.org_id === user.org_id;
  if (user.role === "client") return project.client_email === user.email;
  return true;
};

export const fallbackViewForUser = user => {
  if (isSuperAdmin(user)) return "admin-dashboard";
  if (isOrgAdmin(user)) return "org-dashboard";
  if (user?.role === "client") return "client";
  return "dashboard";
};

export const canOpenView = (user, view) => {
  if (!user) return false;
  if (view === "logout" || view === "detail") return true;
  if (view === "create") return can(user, "createProject");
  return PERMS[user.role]?.nav.includes(view);
};

export const canUseQuickCapture = user => ["architect", "pm", "contractor", "superadmin", "orgadmin"].includes(user?.role);

export const drawingKey = d => {
  const title = (d?.title || "").trim().toLowerCase();
  const type = (d?.type || "").trim().toLowerCase();
  // Return null for blank inputs so callers can refuse to treat empty drawings
  // as collidable. Previously this returned "::" and every blank drawing would
  // appear to supersede every other blank drawing.
  if (!title || !type) return null;
  return `${title}::${type}`;
};

export const isReleasedCurrentDrawing = (d, role) =>
  d?.status === "current" && (d.released_to || []).includes(role);
