// SiteTrack Pro — pure permission helpers.
//
// This module mirrors the PERMS object in App.jsx so that role rules can be
// unit-tested without booting React/JSDOM. App.jsx still owns the in-app source
// of truth for now; a follow-up refactor (tracked in BACKLOG.md) should make
// App.jsx import from this module so the two cannot drift.

export const PERMS = {
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
      "materials", "ledger", "boq", "drawings", "rfi", "changeorders",
      "fieldops", "approvals", "inspections", "safety", "team", "attendance",
      "budget", "po", "invoices", "labour", "rabills", "map", "ai", "gantt",
    ],
    nav: ["dashboard", "projects", "calendar", "vendors", "po", "analytics", "activity", "messages", "notifications"],
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
      "materials", "ledger", "boq", "drawings", "rfi", "changeorders",
      "fieldops", "approvals", "inspections", "safety", "team", "attendance",
      "budget", "po", "labour", "rabills", "map", "ai", "gantt",
    ],
    nav: ["dashboard", "projects", "calendar", "vendors", "po", "pm", "messages", "notifications"],
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
    nav: ["dashboard", "projects", "messages", "notifications"],
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
    tabs: ["overview", "milestones", "updates", "drawings", "boq", "changeorders", "approvals", "invoices", "map", "ai", "gantt"],
    nav: ["dashboard", "calendar", "client", "notifications"],
  },
};

export const can = (user, p) => !!(user && PERMS[user.role]?.[p]);

export const visibleProjectsForUser = (projects, user) =>
  user?.role === "client" ? projects.filter(p => p.client_email === user.email) : projects;

export const canAccessProject = (user, project) =>
  !!(user && project && (user.role !== "client" || project.client_email === user.email));

export const fallbackViewForUser = user => (user?.role === "client" ? "client" : "dashboard");

export const canOpenView = (user, view) => {
  if (!user) return false;
  if (view === "logout" || view === "detail") return true;
  if (view === "create") return can(user, "createProject");
  return PERMS[user.role]?.nav.includes(view);
};

export const canUseQuickCapture = user => ["architect", "pm", "contractor"].includes(user?.role);

export const drawingKey = d =>
  `${(d?.title || "").trim().toLowerCase()}::${(d?.type || "").trim().toLowerCase()}`;

export const isReleasedCurrentDrawing = (d, role) =>
  d?.status === "current" && (d.released_to || []).includes(role);
