import { PROJECT_TYPE_IDS, DEFAULT_PROJECT_TYPE, CONSTRUCTION_INDUSTRIES } from "../data/lookups";
import type { ConstructionIndustry } from "../auth/roles";

export type ProjectType = "construction" | "interior" | "design" | "consultant";

interface TeamTemplateEntry {
  role: string;
  required: boolean;
  desc: string;
}

export const TYPE_TABS: Record<ProjectType, string[]> = {
  construction: [
    "overview", "milestones", "tasks", "updates", "issues", "punchlist",
    "materials", "ledger", "boq", "estimate", "drawings", "rfi", "changeorders",
    "fieldops", "approvals", "inspections", "safety", "team", "attendance",
    "budget", "po", "invoices", "labour", "rabills", "map", "ai", "gantt",
  ],
  interior: [
    "overview", "milestones", "tasks", "updates", "issues",
    "materials", "drawings", "rfi", "changeorders",
    "fieldops", "approvals", "inspections", "safety",
    "team", "map", "ai",
  ],
  design: [
    "overview", "milestones", "updates", "drawings", "rfi", "changeorders", "ai",
  ],
  consultant: [
    "overview", "milestones", "updates", "drawings", "rfi", "ai",
  ],
};

export const TYPE_TEAM_TEMPLATES: Record<ProjectType, TeamTemplateEntry[]> = {
  construction: [
    { role: "project_head",   required: true,  desc: "Project lead \u2014 single accountable owner" },
    { role: "architect",      required: true,  desc: "Senior architect \u2014 design + permits" },
    { role: "mep_consultant", required: false, desc: "Mechanical / Electrical / Plumbing consultant" },
    { role: "site_engineer",  required: true,  desc: "Daily execution + field-ops" },
    { role: "civil_engineer", required: false, desc: "Structural design verification" },
    { role: "site_inspector", required: false, desc: "Quality + statutory inspections" },
    { role: "contractor",     required: true,  desc: "Main contractor (parent of sub-contractors)" },
    { role: "client",         required: true,  desc: "End client \u2014 read-only view" },
  ],
  interior: [
    { role: "design_architect_interior", required: true,  desc: "Lead designer with architect background (DA)" },
    { role: "architect",                 required: false, desc: "Permits liaison if required" },
    { role: "interior_designer",         required: true,  desc: "Interior decoration + fit-out designer" },
    { role: "site_engineer",             required: true,  desc: "Site supervision" },
    { role: "contractor",                required: true,  desc: "Fit-out contractor" },
    { role: "client",                    required: true,  desc: "End client" },
  ],
  design: [
    { role: "architect", required: true,  desc: "Project architect" },
    { role: "designer",  required: true,  desc: "3D / detailing designer" },
    { role: "client",    required: true,  desc: "End client" },
  ],
  consultant: [
    { role: "architect",  required: true,  desc: "Architect liaison" },
    { role: "consultant", required: true,  desc: "Specialist consultant (structural / MEP / vastu / etc.)" },
    { role: "client",     required: true,  desc: "End client" },
  ],
};

export const TYPE_BOQ_PRESETS: Record<ProjectType, string[]> = {
  construction: ["Civil", "MEP", "Finishing", "External", "Other"],
  interior: ["Finishing", "MEP", "Other"],
  design: [],
  consultant: [],
};

export function projectTypeOf(project: { type?: string } | null | undefined): ProjectType {
  if (!project) return DEFAULT_PROJECT_TYPE;
  if (project.type && PROJECT_TYPE_IDS.includes(project.type)) return project.type as ProjectType;
  return DEFAULT_PROJECT_TYPE;
}

export function isTabApplicableToProjectType(
  typeOrProject: string | { type?: string } | null | undefined,
  tabId: string,
): boolean {
  const type = typeof typeOrProject === "string"
    ? typeOrProject
    : projectTypeOf(typeOrProject);
  const tabs = TYPE_TABS[type as ProjectType];
  if (!tabs) return true;
  return tabs.includes(tabId);
}

export function recommendedTeam(type: string): TeamTemplateEntry[] {
  const t = PROJECT_TYPE_IDS.includes(type) ? type : DEFAULT_PROJECT_TYPE;
  return TYPE_TEAM_TEMPLATES[t as ProjectType] || [];
}

export function boqPresets(type: string): string[] {
  const t = PROJECT_TYPE_IDS.includes(type) ? type : DEFAULT_PROJECT_TYPE;
  return TYPE_BOQ_PRESETS[t as ProjectType] || [];
}

export function industryLabel(industry: ConstructionIndustry | string | null | undefined): string {
  if (!industry) return "";
  const entry = CONSTRUCTION_INDUSTRIES.find(i => i.id === industry);
  return entry?.label ?? industry;
}

export function canProjectHaveIndustry(type: string, industry: ConstructionIndustry | string): boolean {
  if (type !== "construction") return false;
  return CONSTRUCTION_INDUSTRIES.some(i => i.id === industry);
}

export function isTabVisible(
  user: { role?: string } | null | undefined,
  project: { type?: string } | null | undefined,
  tabId: string,
  opts: { roleTabs?: string[]; isFeatureOn?: (id: string) => boolean } = {},
): boolean {
  if (!user || !project) return false;
  const roleTabs = opts.roleTabs || [];
  if (!roleTabs.includes(tabId)) return false;
  if (typeof opts.isFeatureOn === "function" && !opts.isFeatureOn(tabId)) return false;
  if (!isTabApplicableToProjectType(project, tabId)) return false;
  return true;
}

export function tabHiddenByType(type: string, tabId: string): boolean {
  return !isTabApplicableToProjectType(type, tabId);
}

export function typeChip(type: string): { label: string; icon: string } {
  switch (type) {
    case "construction": return { label: "Construction", icon: "\u{1F3D7}\uFE0F" };
    case "interior":     return { label: "Interior",     icon: "\u{1F6CB}\uFE0F" };
    case "design":       return { label: "Design",       icon: "\u270F\uFE0F" };
    case "consultant":   return { label: "Consultant",   icon: "\u{1F4A1}" };
    default:             return { label: "Project",      icon: "\u{1F4C1}" };
  }
}
