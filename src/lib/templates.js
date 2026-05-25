// SiteTrack Pro — Org-level templates.
//
// Builder firms re-use the same BOQ structure across multiple projects (same
// trades, same line items, same default rates). Same for safety checklists
// and project kick-off templates. This module is the data + helpers behind
// the OrgTemplatesView panel.
//
// State shape (lives in App.jsx as useLS "templates"):
//   {
//     [org_id]: {
//       project:   Template[],  // project kick-off (milestones + teams + checklists)
//       boq:       Template[],  // bill-of-quantities snapshots
//       checklist: Template[],  // inspection / safety / handover checklists
//     }
//   }
//
// A template is { id, name, description, kind, payload, created, updated }.
// `kind` matches the bucket; `payload` is the snapshot itself.

export const INIT_TEMPLATES = {};

export const TEMPLATE_KINDS = ["project", "boq", "checklist"];

/** Return all templates for an org+kind. */
export function listTemplates(store, orgId, kind) {
  if (!orgId || !TEMPLATE_KINDS.includes(kind)) return [];
  return store?.[orgId]?.[kind] || [];
}

/** Add or replace a template. Returns new store. */
export function upsertTemplate(store, orgId, kind, template) {
  if (!orgId || !TEMPLATE_KINDS.includes(kind) || !template?.name) return store;
  const next = { ...(store || {}) };
  const orgRec = { ...(next[orgId] || {}) };
  const bucket = [...(orgRec[kind] || [])];
  const now = new Date().toISOString();
  const id = template.id || `tpl_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const idx = bucket.findIndex(t => t.id === id);
  const row = {
    id,
    name: template.name,
    description: template.description || "",
    kind,
    payload: template.payload ?? null,
    created: template.created || now,
    updated: now,
  };
  if (idx >= 0) bucket[idx] = row;
  else bucket.push(row);
  orgRec[kind] = bucket;
  next[orgId] = orgRec;
  return next;
}

/** Delete a template by id. Returns new store. */
export function removeTemplate(store, orgId, kind, id) {
  if (!orgId || !TEMPLATE_KINDS.includes(kind) || !id) return store;
  if (!store?.[orgId]?.[kind]) return store;
  const next = { ...store };
  const orgRec = { ...next[orgId] };
  orgRec[kind] = (orgRec[kind] || []).filter(t => t.id !== id);
  next[orgId] = orgRec;
  return next;
}

/** Get one template by id (across all kinds for the org). */
export function getTemplate(store, orgId, id) {
  if (!orgId || !id) return null;
  const orgRec = store?.[orgId] || {};
  for (const kind of TEMPLATE_KINDS) {
    const t = (orgRec[kind] || []).find(x => x.id === id);
    if (t) return t;
  }
  return null;
}

/**
 * Build a project-kickoff template from an existing project.
 * Captures: name, description, default milestones list, default checklists.
 * Excludes: timestamps, project-specific IDs.
 */
export function templateFromProject(project, milestones, checklists) {
  if (!project) return null;
  return {
    name: `${project.name} — template`,
    description: `Generated from "${project.name}" on ${new Date().toLocaleDateString()}`,
    payload: {
      project: {
        name_template: project.name,
        budget_baseline: project.budget,
        duration_days: project.start_date && project.expected_end_date
          ? Math.round((new Date(project.expected_end_date) - new Date(project.start_date)) / 86400000)
          : null,
      },
      milestones: (milestones || []).map(m => ({
        title: m.title,
        offset_days: project.start_date
          ? Math.round((new Date(m.due_date) - new Date(project.start_date)) / 86400000)
          : 0,
      })),
      checklists: (checklists || []).map(cl => ({
        title: cl.title,
        type: cl.type,
        items: cl.items,
      })),
    },
  };
}

/**
 * Apply a project template to create the seed shape for a new project.
 * Returns { project, milestones, checklists } — caller wires into setProjects etc.
 */
export function applyProjectTemplate(template, overrides = {}) {
  if (!template || template.kind !== "project") return null;
  const payload = template.payload || {};
  const startDate = overrides.start_date || new Date().toISOString().slice(0, 10);
  const baseStart = new Date(startDate);
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const project = {
    id,
    name: overrides.name || payload.project?.name_template || "New project",
    client_name: overrides.client_name || "",
    client_email: overrides.client_email || "",
    location: overrides.location || "",
    status: "active",
    start_date: startDate,
    expected_end_date: overrides.expected_end_date
      || (payload.project?.duration_days
        ? new Date(baseStart.getTime() + payload.project.duration_days * 86400000).toISOString().slice(0, 10)
        : ""),
    budget: overrides.budget || payload.project?.budget_baseline || 0,
    description: overrides.description || "",
    progress: 0,
  };
  const milestones = (payload.milestones || []).map((m, i) => ({
    id: `m_${id}_${i}`,
    title: m.title,
    status: "pending",
    due_date: new Date(baseStart.getTime() + (m.offset_days || 0) * 86400000).toISOString().slice(0, 10),
    completed_date: null,
  }));
  const checklists = (payload.checklists || []).map((cl, i) => ({
    id: `cl_${id}_${i}`,
    title: cl.title,
    type: cl.type,
    milestone_ref: "",
    status: "pending",
    items: cl.items || [],
    checked_by: "",
    date: "",
    attachments: [],
  }));
  return { project, milestones, checklists };
}

/** Apply a BOQ template — returns array of BOQ rows. */
export function applyBoqTemplate(template) {
  if (!template || template.kind !== "boq") return [];
  return (template.payload || []).map((row, i) => ({
    ...row,
    id: `bq_${Date.now()}_${i}`,
    sort: typeof row.sort === "number" ? row.sort : i + 1,
  }));
}
