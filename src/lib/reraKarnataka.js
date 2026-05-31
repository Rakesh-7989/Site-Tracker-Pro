// SiteTrack Pro — Karnataka RERA adapter (scaffold).
//
// Same shape as src/lib/reraTelangana.js but tuned for K-RERA (rera.karnataka.gov.in).
// Stage codes + form fields differ between states; this lib codifies the KA-specific
// mapping. The actual portal-scraping adapter ships behind KA_RERA_SCRAPER_ENABLED.

export const KA_STAGE_CODES = Object.freeze({
  commencement:  { code: "C1", label: "Commencement" },
  excavation:    { code: "C2", label: "Excavation" },
  foundation:    { code: "F1", label: "Foundation" },
  plinth:        { code: "F2", label: "Plinth" },
  ground_slab:   { code: "S0", label: "Ground floor slab" },
  upper_slabs:   { code: "S1", label: "Upper floor slabs" },
  finishing:     { code: "FN", label: "Finishing" },
  occupancy:     { code: "OC", label: "Occupancy certificate" },
  handover:      { code: "HO", label: "Handover" },
});

const STAGE_ALIASES = {
  start: "commencement", begin: "commencement",
  dig: "excavation",
  base: "foundation", footing: "foundation",
  plinth_level: "plinth",
  first_slab: "ground_slab", gf_slab: "ground_slab",
  slabs: "upper_slabs", floor_slab: "upper_slabs",
  fit_out: "finishing", interior: "finishing",
  oc: "occupancy", possession: "handover",
};

export function inferKaReraStage(text) {
  if (!text || typeof text !== "string") return null;
  const key = text.toLowerCase().trim().replace(/\s+/g, "_");
  if (KA_STAGE_CODES[key]) return key;
  if (STAGE_ALIASES[key]) return STAGE_ALIASES[key];
  return null;
}

const KA_RERA_REGEX = /^PRM\/KA\/RERA\/\d{4}\/\d{4}\/\d{6}$/;

export function validateKaRera(refNo) {
  if (!refNo) return { ok: false, format_ok: false, reason: "empty" };
  const trimmed = String(refNo).trim().toUpperCase();
  const formatOk = KA_RERA_REGEX.test(trimmed);
  return {
    ok: formatOk,
    format_ok: formatOk,
    canonical: trimmed,
    reason: formatOk ? "" : "format-mismatch (expected PRM/KA/RERA/yyyy/mmnn/nnnnnn)",
  };
}

export function buildKaFilingPayload(project, stageKey, extras = {}) {
  if (!project) throw new Error("buildKaFilingPayload: project required");
  const stage = KA_STAGE_CODES[stageKey];
  if (!stage) throw new Error(`buildKaFilingPayload: unknown stage "${stageKey}"`);
  return {
    state: "KA",
    rera_no: project.rera_no || null,
    project_name: project.name,
    stage_key: stageKey,
    stage_code: stage.code,
    stage_label: stage.label,
    progress_pct: extras.progress_pct ?? null,
    photos: extras.photos ?? [],
    drawings: extras.drawings ?? [],
    declarations: {
      truthful_disclosure: !!extras.truthful_disclosure,
      compliant_with_act: !!extras.compliant_with_act,
    },
  };
}

/** In-memory mock adapter for tests + demo mode. */
export const mockKaAdapter = {
  async submit(payload) {
    if (!payload?.rera_no) return { ok: false, reason: "missing-rera-no" };
    return {
      ok: true,
      ack_no: `KA-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
      status: "accepted",
      filed_at: new Date().toISOString(),
    };
  },
  async checkStatus(ackNo) {
    return { ok: true, status: "accepted", ack_no: ackNo };
  },
};

/** Real adapter that delegates to the EF; only active when env flag is set. */
export const kaReraAdapter = {
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
