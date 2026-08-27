interface StageCode {
  code: string;
  label: string;
}

interface Project {
  rera_no?: string;
  name?: string;
  [key: string]: unknown;
}

interface FilingPayload {
  state: string;
  rera_no: string | null;
  project_name: string | undefined;
  stage_key: string;
  stage_code: string;
  stage_label: string;
  progress_pct: number | null;
  photos: unknown[];
  drawings: unknown[];
  declarations: {
    truthful_disclosure: boolean;
    compliant_with_act: boolean;
  };
}

interface FilingResult {
  ok: boolean;
  reason?: string;
  ack_no?: string;
  status?: string;
  filed_at?: string;
}

interface AdapterOpts {
  endpoint?: string;
  token?: string;
}

export const KA_STAGE_CODES: Record<string, StageCode> = Object.freeze({
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

const STAGE_ALIASES: Record<string, string> = {
  start: "commencement", begin: "commencement",
  dig: "excavation",
  base: "foundation", footing: "foundation",
  plinth_level: "plinth",
  first_slab: "ground_slab", gf_slab: "ground_slab",
  slabs: "upper_slabs", floor_slab: "upper_slabs",
  fit_out: "finishing", interior: "finishing",
  oc: "occupancy", possession: "handover",
};

export function inferKaReraStage(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const key = text.toLowerCase().trim().replace(/\s+/g, "_");
  if (KA_STAGE_CODES[key]) return key;
  if (STAGE_ALIASES[key]) return STAGE_ALIASES[key];
  return null;
}

const KA_RERA_REGEX = /^PRM\/KA\/RERA\/\d{4}\/\d{4}\/\d{6}$/;

export function validateKaRera(refNo: string): { ok: boolean; format_ok: boolean; canonical?: string; reason?: string } {
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

export function buildKaFilingPayload(project: Project, stageKey: string, extras: Record<string, unknown> = {}): FilingPayload {
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
    progress_pct: (extras.progress_pct as number) ?? null,
    photos: (extras.photos as unknown[]) ?? [],
    drawings: (extras.drawings as unknown[]) ?? [],
    declarations: {
      truthful_disclosure: !!extras.truthful_disclosure,
      compliant_with_act: !!extras.compliant_with_act,
    },
  };
}

export const mockKaAdapter = {
  async submit(payload: FilingPayload): Promise<FilingResult> {
    if (!payload?.rera_no) return { ok: false, reason: "missing-rera-no" };
    return {
      ok: true,
      ack_no: `KA-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`,
      status: "accepted",
      filed_at: new Date().toISOString(),
    };
  },
  async checkStatus(ackNo: string): Promise<{ ok: boolean; status: string; ack_no: string }> {
    return { ok: true, status: "accepted", ack_no: ackNo };
  },
};

export const kaReraAdapter = {
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
