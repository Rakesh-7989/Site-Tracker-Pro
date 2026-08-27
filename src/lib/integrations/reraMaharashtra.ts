interface Project {
  rera_no?: string;
  name?: string;
  [key: string]: unknown;
}

interface FilingPayload {
  state: string;
  rera_no: string | null;
  project_name: string | undefined;
  period: string;
  submitted_at: string;
  sections: Record<string, unknown>;
}

interface FilingResult {
  ok: boolean;
  reason?: string;
  ack_no?: string;
  status?: string;
  period?: string;
  filed_at?: string;
}

interface AdapterOpts {
  endpoint?: string;
  token?: string;
}

export const MH_QUARTERLY_PERIODS = ["Q1-Apr-Jun", "Q2-Jul-Sep", "Q3-Oct-Dec", "Q4-Jan-Mar"];

export const MH_STAGE_KEYS = Object.freeze([
  "land_status",
  "approvals",
  "construction_status",
  "financial_status",
  "completion_certificate",
  "occupancy_certificate",
  "fund_utilization",
]);

const MAHARERA_REGEX = /^P\d{11}$/;

export function validateMaharera(refNo: string): { ok: boolean; format_ok: boolean; canonical?: string; reason?: string } {
  if (!refNo) return { ok: false, format_ok: false, reason: "empty" };
  const trimmed = String(refNo).trim().toUpperCase();
  const formatOk = MAHARERA_REGEX.test(trimmed);
  return {
    ok: formatOk,
    format_ok: formatOk,
    canonical: trimmed,
    reason: formatOk ? "" : "format-mismatch (expected Pddddddddddd — 11 digits after P)",
  };
}

export function inferMhQuarter(date: Date | string = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  const m = d.getMonth();
  if (m >= 3 && m <= 5) return "Q1-Apr-Jun";
  if (m >= 6 && m <= 8) return "Q2-Jul-Sep";
  if (m >= 9 && m <= 11) return "Q3-Oct-Dec";
  return "Q4-Jan-Mar";
}

export function buildMhFilingPayload(project: Project, period: string, sections: Record<string, unknown> = {}): FilingPayload {
  if (!project) throw new Error("buildMhFilingPayload: project required");
  if (!MH_QUARTERLY_PERIODS.includes(period)) {
    throw new Error(`buildMhFilingPayload: unknown period "${period}"`);
  }
  const payload: FilingPayload = {
    state: "MH",
    rera_no: project.rera_no || null,
    project_name: project.name,
    period,
    submitted_at: new Date().toISOString(),
    sections: {},
  };
  for (const key of MH_STAGE_KEYS) {
    payload.sections[key] = sections[key] ?? null;
  }
  return payload;
}

export const mockMhAdapter = {
  async submit(payload: FilingPayload): Promise<FilingResult> {
    if (!payload?.rera_no) return { ok: false, reason: "missing-rera-no" };
    if (!payload.period) return { ok: false, reason: "missing-period" };
    return {
      ok: true,
      ack_no: `MH-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
      status: "submitted",
      period: payload.period,
      filed_at: new Date().toISOString(),
    };
  },
  async checkStatus(ackNo: string): Promise<{ ok: boolean; status: string; ack_no: string }> {
    return { ok: true, status: "accepted", ack_no: ackNo };
  },
};

export const mhReraAdapter = {
  async submit(payload: FilingPayload, { endpoint, token }: AdapterOpts = {}): Promise<FilingResult> {
    if (!endpoint) return { ok: false, reason: "endpoint-missing" };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    return await res.json();
  },
};
