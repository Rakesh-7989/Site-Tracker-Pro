import { validateRera as checkReraFormat } from "./compliance";

export const SUPPORTED_STATES = ["telangana", "karnataka", "maharashtra"];

export const STAGE_CODES: Record<string, string> = {
  EXC: "Excavation",
  FOU: "Foundation",
  PLI: "Plinth",
  GFL: "Ground Floor",
  SUP: "Superstructure",
  BWK: "Brickwork",
  PLA: "Plastering",
  FLO: "Flooring",
  FIN: "Finishing",
  HND: "Handover",
};

export function inferReraStage(progressPct: number): string {
  if (progressPct >= 95) return "HND";
  if (progressPct >= 85) return "FIN";
  if (progressPct >= 70) return "FLO";
  if (progressPct >= 55) return "PLA";
  if (progressPct >= 40) return "BWK";
  if (progressPct >= 25) return "SUP";
  if (progressPct >= 18) return "GFL";
  if (progressPct >= 12) return "PLI";
  if (progressPct >= 6) return "FOU";
  return "EXC";
}

interface FilingPayload {
  project_id: string;
  rera_number: string | null;
  month: string;
  physical_progress_pct: number;
  primary_stage: string;
  financial: {
    budgeted_inr: number;
    spent_inr: number;
    collected_from_buyers_inr: number;
  };
  workforce: number;
  quality_notes: string;
  submitted_by: string;
  submitted_at: string;
}

interface FilingPayloadOptions {
  month?: string;
  progressOverride?: number;
  spent?: number;
  collected?: number;
  workersOnSite?: number;
  qualityNotes?: string;
  submittedBy?: string;
}

interface ProjectSnapshot {
  id: string;
  rera_number?: string;
  reraNumber?: string;
  progress?: number;
  budget?: number;
}

export function buildFilingPayload(project: ProjectSnapshot, options: FilingPayloadOptions = {}): FilingPayload {
  if (!project?.id) throw new Error("buildFilingPayload: project.id required");
  const month = options.month || new Date().toISOString().slice(0, 7);
  const progress = options.progressOverride ?? project.progress ?? 0;
  const totalBudget = project.budget || 0;
  const spent = options.spent || 0;
  return {
    project_id: project.id,
    rera_number: project.rera_number || project.reraNumber || null,
    month,
    physical_progress_pct: Math.round(progress),
    primary_stage: inferReraStage(progress),
    financial: {
      budgeted_inr: totalBudget,
      spent_inr: spent,
      collected_from_buyers_inr: options.collected || 0,
    },
    workforce: options.workersOnSite ?? 0,
    quality_notes: options.qualityNotes || "Standard build progressing per plan.",
    submitted_by: options.submittedBy || "system",
    submitted_at: new Date().toISOString(),
  };
}

interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateFilingPayload(payload: FilingPayload): ValidationResult {
  const errors: string[] = [];
  if (!payload?.project_id) errors.push("project_id required");
  if (!payload?.rera_number) errors.push("rera_number required");
  else {
    const fmt = checkReraFormat(payload.rera_number);
    if (!fmt.ok) errors.push(`rera_number invalid format: ${fmt.reason}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payload.month || "")) {
    errors.push("month must be YYYY-MM");
  }
  if (typeof payload.physical_progress_pct !== "number" ||
      payload.physical_progress_pct < 0 || payload.physical_progress_pct > 100) {
    errors.push("physical_progress_pct must be 0-100");
  }
  if (!STAGE_CODES[payload.primary_stage]) {
    errors.push(`primary_stage must be one of: ${Object.keys(STAGE_CODES).join(", ")}`);
  }
  if (payload.financial && payload.financial.spent_inr > payload.financial.budgeted_inr) {
    errors.push("spent_inr cannot exceed budgeted_inr");
  }
  return { ok: errors.length === 0, errors };
}

interface CheckStatusResult {
  ok: boolean;
  error?: string;
  rera_number?: string;
  status?: string;
  registered_on?: string;
  promoter?: string;
  notes?: string;
}

interface SubmitFilingResult {
  ok: boolean;
  error?: string;
  errors?: string[];
  ack?: string;
  message?: string;
}

interface MockAdapter {
  state: string;
  checkStatus(reraNumber: string): Promise<CheckStatusResult>;
  submitFiling(payload: FilingPayload): Promise<SubmitFilingResult>;
  _submissions: any[];
}

export function mockAdapter(): MockAdapter {
  const submissions: any[] = [];
  return {
    state: "mock",
    async checkStatus(reraNumber: string) {
      const fmt = checkReraFormat(reraNumber);
      if (!fmt.ok) return { ok: false, error: fmt.reason };
      return {
        ok: true,
        rera_number: reraNumber,
        status: "active",
        registered_on: "2024-04-01",
        promoter: "Mock Builders Pvt Ltd",
        notes: "MOCK adapter — real data needs the tgReraAdapter() + creds.",
      };
    },
    async submitFiling(payload) {
      const v = validateFilingPayload(payload);
      if (!v.ok) return { ok: false, errors: v.errors };
      const ack = `MOCK-${payload.month}-${Date.now().toString(36).toUpperCase()}`;
      const record = { ack, payload, submitted_at: new Date().toISOString() };
      submissions.push(record);
      return { ok: true, ack, message: "MOCK filing recorded (no real submission)." };
    },
    _submissions: submissions,
  };
}

interface TgReraConfig {
  edge_function_url: string;
  portal_username?: string;
  portal_password?: string;
  otp_phone?: string;
}

interface TgReraAdapter {
  state: string;
  checkStatus(reraNumber: string): Promise<CheckStatusResult>;
  submitFiling(payload: FilingPayload): Promise<SubmitFilingResult>;
}

export function tgReraAdapter(cfg: TgReraConfig): TgReraAdapter {
  if (!cfg?.edge_function_url) {
    throw new Error("tgReraAdapter: edge_function_url required (deploy supabase/functions/tg-rera-submit first)");
  }
  return {
    state: "telangana",
    async checkStatus(reraNumber: string) {
      const fmt = checkReraFormat(reraNumber);
      if (!fmt.ok) return { ok: false, error: fmt.reason };
      try {
        const res = await fetch(`${cfg.edge_function_url}/status?rera_number=${encodeURIComponent(reraNumber)}`);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err.message || String(err) };
      }
    },
    async submitFiling(payload) {
      const v = validateFilingPayload(payload);
      if (!v.ok) return { ok: false, errors: v.errors };
      if (!cfg.portal_username || !cfg.portal_password) {
        return { ok: false, error: "RERA portal credentials not configured. Add in Integrations → RERA Telangana." };
      }
      try {
        const res = await fetch(`${cfg.edge_function_url}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portal_username: cfg.portal_username,
            portal_password: cfg.portal_password,
            otp_phone: cfg.otp_phone,
            filing: payload,
          }),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${await res.text().catch(() => "")}` };
        return await res.json();
      } catch (err: any) {
        return { ok: false, error: err.message || String(err) };
      }
    },
  };
}

export function pickAdapter(state: string, cfg: TgReraConfig): MockAdapter | TgReraAdapter {
  if (state === "telangana" && cfg?.edge_function_url) {
    try { return tgReraAdapter(cfg); }
    catch { return mockAdapter(); }
  }
  return mockAdapter();
}
