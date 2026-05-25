// SiteTrack Pro — Government compliance validators + check stubs.
//
// What this is:
//   Format validators (regex-based, instant) PLUS async stubs that pretend to
//   hit external APIs (RERA portal, GST search, EPFO master, PAN verify).
//   Stubs return deterministic mock results so demos work without real keys.
//   When the team gets real API access, swap the stub body — public contract
//   stays the same.
//
// What it solves:
//   Indian builders MUST register every project with RERA, validate every
//   vendor GSTIN before paying, verify EPFO + ESIC for any contractor with
//   20+ labourers, and check PAN for TDS. Today this is manual; many leaks.
//
// Public API:
//   validateRera(num)       → { ok, format_ok, reason? }
//   validateGstin(num)      → { ok, format_ok, state_code?, pan_embedded? }
//   validateEpfo(code)      → { ok }
//   validatePan(num)        → { ok }
//   checkReraStatus(num)    → async { verified, status, registered_until, project_name? }
//   checkGstinStatus(num)   → async { verified, legal_name, status, taxpayer_type? }
//   checkEpfoStatus(code)   → async { verified, employer_name, status }

const RERA_REGEX = /^[A-Z]{1,2}\/?RERA\/?[A-Z0-9/-]{4,}$/i;
const GST_REGEX  = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;
const PAN_REGEX  = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const EPFO_REGEX = /^[A-Z]{2}\/[A-Z]{3}\/\d{7}\/?\d{0,3}$/;

const STATE_CODES = {
  "01":"Jammu & Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh",
  "05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh",
  "10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh","13":"Nagaland","14":"Manipur",
  "15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal",
  "20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh",
  "24":"Gujarat","27":"Maharashtra","29":"Karnataka","30":"Goa","32":"Kerala",
  "33":"Tamil Nadu","34":"Puducherry","36":"Telangana","37":"Andhra Pradesh",
};

// ── format validators (instant) ─────────────────────────────────────────────

export function validateRera(num) {
  if (!num) return { ok: false, format_ok: false, reason: "RERA number is required." };
  const trimmed = String(num).trim();
  const format_ok = RERA_REGEX.test(trimmed);
  return { ok: format_ok, format_ok, reason: format_ok ? "" : "Format mismatch — expected pattern like TS/RERA/PROJECT/12345." };
}

export function validateGstin(num) {
  if (!num) return { ok: false, format_ok: false, reason: "GSTIN is required." };
  const t = String(num).trim().toUpperCase();
  const format_ok = GST_REGEX.test(t);
  if (!format_ok) return { ok: false, format_ok: false, reason: "Invalid GSTIN format (must be 15 chars, state code + PAN + entity + check digit)." };
  return {
    ok: true,
    format_ok: true,
    state_code: t.slice(0, 2),
    state: STATE_CODES[t.slice(0, 2)] || "Unknown state",
    pan_embedded: t.slice(2, 12),
  };
}

export function validatePan(num) {
  if (!num) return { ok: false, format_ok: false, reason: "PAN is required." };
  const t = String(num).trim().toUpperCase();
  const format_ok = PAN_REGEX.test(t);
  return { ok: format_ok, format_ok, reason: format_ok ? "" : "Invalid PAN format (5 letters + 4 digits + 1 letter)." };
}

export function validateEpfo(code) {
  if (!code) return { ok: false, format_ok: false, reason: "EPFO code is required." };
  const t = String(code).trim().toUpperCase();
  const format_ok = EPFO_REGEX.test(t);
  return { ok: format_ok, format_ok, reason: format_ok ? "" : "Invalid EPFO code (e.g. TN/CHN/0123456 or TN/CHN/0123456/000)." };
}

// ── async external-API stubs (mock for now) ────────────────────────────────
// When real API access is added, replace these bodies. Public shape stable.

export async function checkReraStatus(num) {
  const fmt = validateRera(num);
  if (!fmt.format_ok) return { verified: false, ...fmt };
  await new Promise(r => setTimeout(r, 250));
  // Mock — last digit even → registered+active, odd → expired.
  const last = String(num).replace(/\D/g, "").slice(-1);
  const even = Number(last) % 2 === 0;
  return {
    verified: true,
    status: even ? "REGISTERED_ACTIVE" : "REGISTRATION_EXPIRED",
    registered_until: even ? "2027-12-31" : "2024-06-30",
    project_name: even ? "Verified Project" : "Renewal Required",
    fetched_at: new Date().toISOString(),
    mock: true,
  };
}

export async function checkGstinStatus(gstin) {
  const fmt = validateGstin(gstin);
  if (!fmt.format_ok) return { verified: false, ...fmt };
  await new Promise(r => setTimeout(r, 250));
  return {
    verified: true,
    legal_name: `${gstin.slice(2, 7)} Enterprises Pvt Ltd`,
    state: fmt.state,
    status: "ACTIVE",
    taxpayer_type: "REGULAR",
    fetched_at: new Date().toISOString(),
    mock: true,
  };
}

export async function checkEpfoStatus(code) {
  const fmt = validateEpfo(code);
  if (!fmt.format_ok) return { verified: false, ...fmt };
  await new Promise(r => setTimeout(r, 250));
  return {
    verified: true,
    employer_name: "Sample Construction Pvt Ltd",
    status: "COMPLIANT",
    last_contribution: new Date(Date.now() - 25 * 86400 * 1000).toISOString().split("T")[0],
    fetched_at: new Date().toISOString(),
    mock: true,
  };
}

/** Roll up a project's compliance state to a single traffic-light. */
export function projectComplianceStatus(checks) {
  if (!checks) return { color: "stone", label: "Not checked" };
  const reraOk = checks.rera?.verified && checks.rera.status === "REGISTERED_ACTIVE";
  const gstOk  = checks.gst?.verified && checks.gst.status === "ACTIVE";
  const epfoOk = checks.epfo?.verified && checks.epfo.status === "COMPLIANT";
  const required = [reraOk, gstOk, epfoOk];
  const passed = required.filter(Boolean).length;
  if (passed === 3) return { color: "emerald", label: "All compliant" };
  if (passed >= 1)  return { color: "amber",   label: `${passed}/3 compliant` };
  return { color: "red", label: "Action needed" };
}
