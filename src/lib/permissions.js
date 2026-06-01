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

  // ── v2 Phase B: 12 new roles from ROLE_MODEL_V2.md ──────────────────────
  // Strict superset — v1 roles above keep working unchanged. Each new role
  // gets sane defaults that map to its real-world scope.

  // Org tier additions ────────────────────────────────────────────────────
  // Project Admin — org-scoped PM; less power than orgadmin, more than per-project pm.
  // Sees all projects in the org but can't change billing / integrations.
  project_admin: {
    createProject: true, editProgress: true, addUpdate: true, manageTeam: true,
    markAttendance: true, addExpense: true, deleteExpense: false, export: true,
    share: true, changeMilestone: true, addIssue: true, resolveIssue: true,
    addMaterial: true, deleteMaterial: false, manageDrawings: false, viewActivity: true,
    tabs: [
      "overview","milestones","tasks","updates","issues","punchlist","materials",
      "ledger","boq","estimate","drawings","rfi","changeorders","fieldops","approvals",
      "inspections","safety","team","attendance","budget","po","labour","rabills","map","ai","gantt",
    ],
    nav: [
      "dashboard","projects","calendar","vendors","po","analytics","activity","messages","notifications",
      "hierarchy","material-prices","compliance","forecast","delegations","snapshot",
    ],
  },

  // Prospector — sales / lead-gen. Sees org-level pipeline only, no project data.
  prospector: {
    createProject: false, editProgress: false, addUpdate: false, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: false,
    share: false, changeMilestone: false, addIssue: false, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview"], // minimal — read-only project summary if invited
    nav: ["dashboard", "vendors", "messages", "notifications"],
  },

  // Construction-discipline roles ─────────────────────────────────────────
  // Project Head — explicit project lead; like architect but scope is one project.
  project_head: {
    createProject: false, editProgress: true, addUpdate: true, manageTeam: true,
    markAttendance: true, addExpense: true, deleteExpense: false, export: true,
    share: true, changeMilestone: true, addIssue: true, resolveIssue: true,
    addMaterial: true, deleteMaterial: false, manageDrawings: false, viewActivity: true,
    tabs: [
      "overview","milestones","tasks","updates","issues","punchlist","materials",
      "ledger","boq","drawings","rfi","changeorders","fieldops","approvals",
      "inspections","safety","team","attendance","po","labour","rabills","map","ai","gantt",
    ],
    nav: ["dashboard","projects","calendar","vendors","po","analytics","messages","notifications","hierarchy","snapshot"],
  },

  // MEP Consultant — sees MEP-relevant tabs only.
  mep_consultant: {
    createProject: false, editProgress: false, addUpdate: true, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: true,
    share: false, changeMilestone: false, addIssue: true, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","updates","issues","drawings","rfi","changeorders","fieldops","approvals","inspections","map","ai"],
    nav: ["dashboard","projects","messages","notifications","material-prices"],
  },

  // Site Engineer — execution surface. Heavy daily ops.
  site_engineer: {
    createProject: false, editProgress: true, addUpdate: true, manageTeam: false,
    markAttendance: true, addExpense: false, deleteExpense: false, export: false,
    share: false, changeMilestone: true, addIssue: true, resolveIssue: true,
    addMaterial: true, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","tasks","updates","issues","punchlist","materials","ledger","drawings","rfi","fieldops","inspections","safety","team","attendance","labour","map","gantt"],
    nav: ["dashboard","projects","calendar","messages","notifications","kiosk-labour","kiosk-site"],
  },

  // Civil / Structural Engineer (combined per the sheet's "Civil OR Structural" notation).
  civil_engineer: {
    createProject: false, editProgress: false, addUpdate: true, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: false,
    share: false, changeMilestone: false, addIssue: true, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","updates","issues","drawings","rfi","changeorders","fieldops","inspections","map","ai"],
    nav: ["dashboard","projects","messages","notifications"],
  },

  // Site Inspector — quality / statutory. Read-heavy + inspection writes.
  site_inspector: {
    createProject: false, editProgress: false, addUpdate: false, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: true,
    share: false, changeMilestone: false, addIssue: true, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","issues","drawings","inspections","safety","approvals","map"],
    nav: ["dashboard","projects","messages","notifications","compliance"],
  },

  // Interior / Design / Consultant roles ──────────────────────────────────
  // Interior Designer — fit-out projects.
  interior_designer: {
    createProject: false, editProgress: true, addUpdate: true, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: true,
    share: false, changeMilestone: true, addIssue: true, resolveIssue: true,
    addMaterial: true, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","tasks","updates","issues","materials","drawings","rfi","changeorders","fieldops","approvals","ai"],
    nav: ["dashboard","projects","calendar","vendors","messages","notifications","material-prices"],
  },

  // Design Architect (Interior) — DA per the sheet. Lead designer with architect background.
  design_architect_interior: {
    createProject: false, editProgress: true, addUpdate: true, manageTeam: true,
    markAttendance: false, addExpense: true, deleteExpense: false, export: true,
    share: true, changeMilestone: true, addIssue: true, resolveIssue: true,
    addMaterial: true, deleteMaterial: false, manageDrawings: true, viewActivity: true,
    tabs: ["overview","milestones","tasks","updates","issues","materials","drawings","rfi","changeorders","fieldops","approvals","inspections","team","ai","gantt"],
    nav: ["dashboard","projects","calendar","vendors","messages","notifications","material-prices","snapshot"],
  },

  // Designer — pure-design projects (3D / detailing).
  designer: {
    createProject: false, editProgress: true, addUpdate: true, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: true,
    share: false, changeMilestone: true, addIssue: true, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","updates","drawings","rfi","changeorders","ai"],
    nav: ["dashboard","projects","calendar","messages","notifications"],
  },

  // Consultant — specialist engagement projects.
  consultant: {
    createProject: false, editProgress: false, addUpdate: true, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: true,
    share: false, changeMilestone: false, addIssue: true, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","milestones","updates","drawings","rfi","ai"],
    nav: ["dashboard","projects","messages","notifications","compliance"],
  },

  // Sub-contractor — child of a contractor, scoped to specific work packages.
  // Same surface as contractor for tabs they touch, but no contractor-management rights.
  sub_contractor: {
    createProject: false, editProgress: false, addUpdate: true, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: false,
    share: false, changeMilestone: false, addIssue: true, resolveIssue: false,
    addMaterial: true, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview","updates","issues","materials","drawings","rfi","fieldops","rabills","map"],
    nav: ["dashboard","projects","messages","notifications"],
  },

  // Session 24: VENDOR portal role (from the hand-drawn sheet — vendors get
  // a login, not just records). Sees ONLY the POs + materials assigned to
  // them across orgs they supply. No project-detail access, no team data.
  vendor: {
    createProject: false, editProgress: false, addUpdate: false, manageTeam: false,
    markAttendance: false, addExpense: false, deleteExpense: false, export: false,
    share: false, changeMilestone: false, addIssue: false, resolveIssue: false,
    addMaterial: false, deleteMaterial: false, manageDrawings: false, viewActivity: false,
    tabs: ["overview"],   // bare minimum — vendor portal renders its own view, tabs not used
    nav: ["dashboard","po","messages","notifications","material-prices"],
  },
};

export const isSuperAdmin = user => user?.role === "superadmin";
export const isOrgAdmin = user => user?.role === "orgadmin";

// v2 Phase B helpers — group new roles by tier for UI grouping + access checks.
export const PLATFORM_ROLES = ["superadmin"];
export const ORG_ROLES = ["orgadmin", "project_admin", "prospector"];
export const CONSTRUCTION_ROLES = [
  "architect", "project_head", "pm", "mep_consultant",
  "site_engineer", "civil_engineer", "site_inspector",
  "contractor", "sub_contractor",
];
export const DESIGN_ROLES = ["interior_designer", "design_architect_interior", "designer", "consultant"];
export const EXTERNAL_ROLES = ["client", "vendor"];
export const ALL_ROLES = [
  ...PLATFORM_ROLES, ...ORG_ROLES, ...CONSTRUCTION_ROLES, ...DESIGN_ROLES, ...EXTERNAL_ROLES,
];

// Session 24: architect seniority — cleanest way to handle the sheet's
// "Senior Architect / Junior Architect" split without bloating PERMS with two
// roles whose tabs + nav are identical. Use this on the profile + UI displays
// the chip. Used by team templates + UI labels only — does NOT gate access.
export const ARCHITECT_SENIORITIES = [
  { id: "senior", label: "Senior Architect" },
  { id: "junior", label: "Junior Architect" },
  { id: "associate", label: "Associate" },
  { id: "principal", label: "Principal" },
];
export function architectSeniority(user) {
  if (user?.role !== "architect") return null;
  return user.seniority || "senior";
}

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
  // Session 28.5: in-app User Guide reachable from every role (no exception).
  if (view === "help") return true;
  // Sprint 1 (Session 30.2): Daily Progress Report placeholder is the primary
  // workflow surfaced to every role. See docs/FEATURE_FREEZE.md.
  if (view === "dpr") return true;
  if (view === "create") return can(user, "createProject");
  return PERMS[user.role]?.nav.includes(view);
};

// Session 24 fix: previously only the 5 v1 site-team roles. Now every role
// that has field-execution duties can use quick-capture (Updates / Issues /
// Materials / Worklog). Excludes pure-design roles (designer / consultant)
// and read-only roles (client / prospector / site_inspector).
export const canUseQuickCapture = user => [
  // v1
  "architect", "pm", "contractor", "superadmin", "orgadmin",
  // v2 — anyone who's on a site can log a quick update
  "project_admin", "project_head", "site_engineer", "civil_engineer",
  "mep_consultant", "interior_designer", "design_architect_interior",
  "sub_contractor",
].includes(user?.role);

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
