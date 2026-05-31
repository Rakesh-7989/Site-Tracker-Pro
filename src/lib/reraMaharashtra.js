// SiteTrack Pro — Maharashtra RERA adapter (scaffold).
//
// MahaRERA (maharera.mahaonline.gov.in) uses different stage codes + filing
// frequency (quarterly vs Telangana's per-stage). This lib codifies the
// MH-specific shape. The real portal scraping ships behind MH_RERA_SCRAPER_ENABLED.

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

// Real MahaRERA reference format: "P" + 11 digits, e.g. P51700000001
const MAHARERA_REGEX = /^P\d{11}$/;

export function validateMaharera(refNo) {
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

export function inferMhQuarter(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const m = d.getMonth();
  if (m >= 3 && m <= 5) return "Q1-Apr-Jun";
  if (m >= 6 && m <= 8) return "Q2-Jul-Sep";
  if (m >= 9 && m <= 11) return "Q3-Oct-Dec";
  return "Q4-Jan-Mar";
}

export function buildMhFilingPayload(project, period, sections = {}) {
  if (!project) throw new Error("buildMhFilingPayload: project required");
  if (!MH_QUARTERLY_PERIODS.includes(period)) {
    throw new Error(`buildMhFilingPayload: unknown period "${period}"`);
  }
  const payload = {
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
  async submit(payload) {
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
  async checkStatus(ackNo) {
    return { ok: true, status: "accepted", ack_no: ackNo };
  },
};

export const mhReraAdapter = {
  async submit(payload, { endpoint, token } = {}) {
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
