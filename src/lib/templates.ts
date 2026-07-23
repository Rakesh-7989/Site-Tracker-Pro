interface Template {
  id: string;
  name: string;
  description: string;
  kind: string;
  payload: Record<string, unknown> | null;
  created: string;
  updated: string;
  [key: string]: unknown;
}

interface TemplatesStore {
  [orgId: string]: {
    [kind: string]: Template[];
  };
}

export const INIT_TEMPLATES: TemplatesStore = {};

export const TEMPLATE_KINDS = ["project", "boq", "checklist"];

export function listTemplates(store: TemplatesStore | null | undefined, orgId: string, kind: string): Template[] {
  if (!orgId || !TEMPLATE_KINDS.includes(kind)) return [];
  return store?.[orgId]?.[kind] || [];
}

export function upsertTemplate(store: TemplatesStore | null | undefined, orgId: string, kind: string, template: Partial<Template>): TemplatesStore | null | undefined {
  if (!orgId || !TEMPLATE_KINDS.includes(kind) || !template?.name) return store;
  const next = { ...(store || {}) };
  const orgRec = { ...(next[orgId] || {}) };
  const bucket = [...(orgRec[kind] || [])];
  const now = new Date().toISOString();
  const id = template.id || `tpl_${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const idx = bucket.findIndex((t: Template) => t.id === id);
  const row: Template = {
    id,
    name: template.name!,
    description: template.description || "",
    kind,
    payload: (template.payload as Record<string, unknown>) ?? null,
    created: template.created || now,
    updated: now,
  };
  if (idx >= 0) bucket[idx] = row;
  else bucket.push(row);
  orgRec[kind] = bucket;
  next[orgId] = orgRec;
  return next;
}

export function removeTemplate(store: TemplatesStore | null | undefined, orgId: string, kind: string, id: string): TemplatesStore | null | undefined {
  if (!orgId || !TEMPLATE_KINDS.includes(kind) || !id) return store;
  if (!store?.[orgId]?.[kind]) return store;
  const next = { ...store };
  const orgRec = { ...next[orgId] };
  orgRec[kind] = (orgRec[kind] || []).filter((t: Template) => t.id !== id);
  next[orgId] = orgRec;
  return next;
}

export function getTemplate(store: TemplatesStore | null | undefined, orgId: string, id: string): Template | null {
  if (!orgId || !id) return null;
  const orgRec = store?.[orgId] || {};
  for (const kind of TEMPLATE_KINDS) {
    const t = ((orgRec[kind] || []) as Template[]).find(x => x.id === id);
    if (t) return t;
  }
  return null;
}

interface Milestone {
  title?: string;
  due_date?: string;
  [key: string]: unknown;
}

interface Checklist {
  title?: string;
  type?: string;
  items?: unknown[];
  [key: string]: unknown;
}

export function templateFromProject(project: Record<string, unknown> | null | undefined, milestones: Milestone[] | null | undefined, checklists: Checklist[] | null | undefined): Record<string, unknown> | null {
  if (!project) return null;
  return {
    name: `${project.name} — template`,
    description: `Generated from "${project.name}" on ${new Date().toLocaleDateString()}`,
    payload: {
      project: {
        name_template: project.name,
        budget_baseline: project.budget,
        duration_days: project.start_date && project.expected_end_date
          ? Math.round((new Date(project.expected_end_date as string).getTime() - new Date(project.start_date as string).getTime()) / 86400000)
          : null,
      },
      milestones: (milestones || []).map(m => ({
        title: m.title,
        offset_days: project.start_date
          ? Math.round((new Date(m.due_date!).getTime() - new Date(project.start_date as string).getTime()) / 86400000)
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

export function applyProjectTemplate(template: Template | null | undefined, overrides: Record<string, unknown> = {}): Record<string, unknown> | null {
  if (!template || template.kind !== "project") return null;
  const payload = template.payload || {};
  const startDate = (overrides.start_date as string) || new Date().toISOString().slice(0, 10);
  const baseStart = new Date(startDate);
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const projectPayload = payload.project as Record<string, unknown> | undefined;
  const project = {
    id,
    name: overrides.name || (projectPayload?.name_template as string) || "New project",
    client_name: overrides.client_name || "",
    client_email: overrides.client_email || "",
    location: overrides.location || "",
    status: "active",
    start_date: startDate,
    expected_end_date: overrides.expected_end_date as string
      || (projectPayload?.duration_days
        ? new Date(baseStart.getTime() + (projectPayload.duration_days as number) * 86400000).toISOString().slice(0, 10)
        : ""),
    budget: overrides.budget || projectPayload?.budget_baseline || 0,
    description: overrides.description || "",
    progress: 0,
  };
  const payloadMilestones = (payload.milestones as Array<Record<string, unknown>>) || [];
  const milestones = payloadMilestones.map((m, i) => ({
    id: `m_${id}_${i}`,
    title: m.title,
    status: "pending",
    due_date: new Date(baseStart.getTime() + ((m.offset_days as number) || 0) * 86400000).toISOString().slice(0, 10),
    completed_date: null,
  }));
  const payloadChecklists = (payload.checklists as Array<Record<string, unknown>>) || [];
  const checklists = payloadChecklists.map((cl, i) => ({
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

export function applyBoqTemplate(template: Template | null | undefined): Record<string, unknown>[] {
  if (!template || template.kind !== "boq") return [];
  const payload = (template.payload as unknown as Record<string, unknown>[]) || [];
  return payload.map((row, i) => ({
    ...row,
    id: `bq_${Date.now()}_${i}`,
    sort: typeof row.sort === "number" ? row.sort : i + 1,
  }));
}
