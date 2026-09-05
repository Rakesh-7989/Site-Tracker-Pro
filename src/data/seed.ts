export { MOCK_USERS, PLAN_META } from "./seed.demo";

export const INIT_PROJECTS: unknown[] = [];
export const INIT_MILESTONES: Record<string, unknown[]> = {};
export const INIT_UPDATES: Record<string, unknown[]> = {};
export const INIT_EXPENSES: Record<string, unknown[]> = {};
export const INIT_TEAMS: Record<string, unknown[]> = {};
export const INIT_ATTENDANCE: Record<string, unknown> = {};
export const INIT_ISSUES: Record<string, unknown[]> = {};
export const INIT_MATERIALS: Record<string, unknown[]> = {};
export const INIT_DRAWINGS: Record<string, unknown[]> = {};
export const INIT_ACTIVITY: unknown[] = [];
export const INIT_NOTIFS: unknown[] = [];
export const INIT_TASKS: Record<string, unknown[]> = {};
export const INIT_PUNCH: Record<string, unknown[]> = {};
export const INIT_RFI: Record<string, unknown[]> = {};
export const INIT_CO: Record<string, unknown[]> = {};
export const INIT_INSPECTIONS: Record<string, unknown[]> = {};
export const INIT_SAFETY: Record<string, unknown[]> = {};
export const INIT_VENDORS: unknown[] = [];
export const INIT_POS: Record<string, unknown[]> = {};
export const INIT_INVOICES: Record<string, unknown[]> = {};
export const INIT_LABOUR: Record<string, unknown[]> = {};
export const INIT_RA: Record<string, unknown[]> = {};
export const INIT_COMMENTS: unknown[] = [];
export const INIT_BOQ: Record<string, unknown[]> = {};
export const INIT_ESTIMATE: Record<string, unknown> = {};
export const INIT_LEDGER: Record<string, unknown[]> = {};
export const INIT_EQUIPMENT: Record<string, unknown[]> = {};
export const INIT_DIARY: Record<string, unknown[]> = {};
export const INIT_WORKLOGS: Record<string, unknown[]> = {};
export const INIT_CHECKLISTS: Record<string, unknown[]> = {};
export const INIT_SUBMITTALS: Record<string, unknown[]> = {};
export const INIT_PERMITS: Record<string, unknown[]> = {};
export const INIT_MESSAGES: Record<string, unknown[]> = {};
export const INIT_ORGS: unknown[] = [];
export const INIT_ADMIN_USERS: unknown[] = [];
export const INIT_SUPPORT: unknown[] = [];

export const INIT_BLOCKS: Record<string, unknown[]> = {};
export const INIT_FLOORS: Record<string, unknown[]> = {};
export const INIT_UNITS: Record<string, unknown[]> = {};

export const INIT_BRANDING: { org: Record<string, unknown>; project: Record<string, unknown> } = { org: {}, project: {} };

export const INIT_AUDIT_LOG: unknown[] = [];

export const INIT_DELEGATIONS: unknown[] = [];

export const INIT_DAILY_SNAPSHOTS: Record<string, Record<string, unknown>> = {};

export const INIT_MATERIAL_PRICES: Record<string, unknown[]> = {};

export const INIT_COMPLIANCE: Record<string, unknown> = {};

export const INIT_FORECAST: Record<string, unknown> = {};

export const INIT_APPROVAL_CHAINS: Record<string, unknown> = {};

export const INIT_ORG_INTEGRATIONS: Record<string, unknown> = {};

export const INIT_TEMPLATES: Record<string, unknown> = {};

export const INIT_NOTIFICATION_RULES: Record<string, unknown> = {};

export const INIT_OPS_TOGGLES: Record<string, unknown> = {
  demoLoaderEnabled: true,
  demoModePermanent: false,
  kioskLabourEnabled: true,
  kioskSiteEnabled: true,
  kioskArEnabled: true,
  tenantOnboardingMode: "guided",
};

export const INIT_PLATFORM_FEATURE_FLAGS: Record<string, boolean> = {};
export const INIT_ORG_FEATURE_FLAGS: Record<string, boolean> = {};
