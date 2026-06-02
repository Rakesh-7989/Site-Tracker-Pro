// SiteTrack Pro — Sprint 2 (Session 30.3): BuildNow Telangana anchor.
//
// Mirrors a project's BuildNow status into our DB so the DPR detail
// view can show a "state-government-verified" badge AND the Sprint 4
// handover packet can include current approval state.
//
// The actual fetch lives in supabase/functions/buildnow_anchor — this
// module only contains the SHAPED INTERFACE + pure hash + URL helpers
// shared between browser (badge UI) + Deno (sync job). Same 3-way
// invariant pattern as src/lib/blockchainAnchor.js.
//
// Two acquisition paths:
//   1. Official API — when TG IT dept grants access (Sprint 2 Day 22
//      founder action). Uses BUILDNOW_API_TOKEN env.
//   2. Scrape fallback — Playwright on Deno scraping the public
//      buildnow.telangana.gov.in pages. Slower; fragile to UI changes.
//
// See docs/SPRINT_2_ARCHITECTURE.md for the full contract.

const BUILDNOW_BASE = 'https://buildnow.telangana.gov.in';

export const APPROVAL_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
];

export const KNOWN_STAGES = [
  'project_registration',
  'commencement_certificate',
  'phase_progress_report',
  'completion_certificate',
  'occupancy_certificate',
];

/**
 * Generate the public verification URL for a BuildNow-anchored DPR.
 *
 * @param {string} buildnowProjectId - the ID issued by BuildNow Telangana
 * @param {string} dprId             - our internal DPR message id
 * @returns {string}
 */
export function generateBadgeUrl(buildnowProjectId, dprId) {
  if (!buildnowProjectId || !dprId) {
    throw new Error('generateBadgeUrl: both buildnowProjectId and dprId required');
  }
  const params = new URLSearchParams({
    p: String(buildnowProjectId),
    d: String(dprId),
  });
  return `${BUILDNOW_BASE}/verify?${params.toString()}`;
}

/**
 * Canonicalize a DPR payload for hashing. Sorts keys + drops volatile
 * fields (timestamps that vary between sender + receiver clocks). Same
 * algorithm used in the buildnow_anchor EF so the hash matches both
 * sides — auditor can reproduce.
 *
 * @param {object} payload
 * @returns {object}
 */
export function canonicalizeDprPayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const KEEP = [
    'client_token',
    'org_id',
    'project_id',
    'supervisor_user_id',
    'promoter_phone_e164',
    'language',
    'transcript_text',
    'voice_audio_sha256',
    'photo_url',
    'photo_lat',
    'photo_lon',
  ];
  const out = {};
  for (const k of KEEP) {
    if (payload[k] !== undefined && payload[k] !== null) out[k] = payload[k];
  }
  // Numeric round-down on lat/lon to 6 decimal places (BuildNow may
  // round to 5 — keep them consistent).
  if (typeof out.photo_lat === 'number') out.photo_lat = Math.round(out.photo_lat * 1e6) / 1e6;
  if (typeof out.photo_lon === 'number') out.photo_lon = Math.round(out.photo_lon * 1e6) / 1e6;
  return out;
}

/**
 * Compute sha256 hex of canonical DPR payload. Pure + deterministic.
 *
 * @param {object} payload
 * @returns {Promise<string>}
 */
export async function computeAnchorHash(payload) {
  const canon = canonicalizeDprPayload(payload);
  const text = JSON.stringify(canon, Object.keys(canon).sort());
  const bytes = new TextEncoder().encode(text);
  if (!(typeof crypto !== 'undefined' && crypto.subtle)) {
    throw new Error('computeAnchorHash: SubtleCrypto unavailable');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Determine which acquisition path to use based on env.
 *
 * @param {object} env
 * @returns {'api' | 'scrape' | 'mock' | null}
 */
export function pickAcquisitionPath(env = {}) {
  if (env.BUILDNOW_API_TOKEN) return 'api';
  if (env.BUILDNOW_SCRAPE_ENABLED === 'true') return 'scrape';
  if (env.VITEST || env.NODE_ENV === 'test') return 'mock';
  return null;
}

/**
 * Mock fetcher used by tests. Deterministic output keyed on
 * buildnowProjectId so test assertions are stable.
 *
 * @param {string} buildnowProjectId
 * @returns {Promise<{ok: true, metadata: object, source: 'mock'}>}
 */
export async function mockFetchProjectMetadata(buildnowProjectId) {
  const safeId = String(buildnowProjectId || 'unknown');
  return {
    ok: true,
    metadata: {
      buildnow_project_id: safeId,
      approval_status: 'approved',
      current_stage: 'phase_progress_report',
      expected_completion_date: '2027-06-30',
      promoter_name: 'Demo Hyderabad Builder',
      project_address: '8 - Banjara Hills, Hyderabad',
      rera_registration: 'P02400001234',
    },
    source: 'mock',
  };
}

/**
 * Public fetcher — the browser calls this; it hits the EF in
 * production OR mock in tests.
 *
 * @param {string} buildnowProjectId
 * @param {object} opts
 * @returns {Promise<{ok: boolean, metadata?: object, source?: string, error?: string}>}
 */
export async function fetchProjectMetadata(buildnowProjectId, opts = {}) {
  const { env = {}, efClient, transport } = opts;
  if (!buildnowProjectId) {
    return { ok: false, error: 'buildnowProjectId required' };
  }
  const path = transport === 'mock' ? 'mock' : pickAcquisitionPath(env);

  if (path === 'mock') {
    return mockFetchProjectMetadata(buildnowProjectId);
  }

  // EF transport — the browser hits buildnow_anchor.
  if (efClient && typeof efClient.invoke === 'function') {
    try {
      const res = await efClient.invoke('buildnow_anchor', {
        body: { buildnow_project_id: buildnowProjectId, path },
      });
      if (res?.error) return { ok: false, error: res.error.message || 'EF error' };
      return res?.data ?? { ok: false, error: 'EF returned no data' };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  return {
    ok: false,
    error:
      'BuildNow fetch path not configured. Set BUILDNOW_API_TOKEN or BUILDNOW_SCRAPE_ENABLED=true.',
  };
}

/**
 * Lint a BuildNow metadata blob. Used by the badge component to decide
 * whether to render "Verified by BuildNow" or "BuildNow data stale /
 * unverified". Pure + testable.
 */
export function badgeStateFor(metadata, opts = {}) {
  const { staleHours = 24 } = opts;
  if (!metadata) return { badge: 'none', reason: 'no metadata' };
  if (!APPROVAL_STATUSES.includes(metadata.approval_status)) {
    return { badge: 'unverified', reason: 'unknown approval_status' };
  }
  if (metadata.approval_status === 'rejected') {
    return { badge: 'warning', reason: 'BuildNow rejected this project' };
  }
  const fetchedAt = metadata.fetched_at;
  if (fetchedAt) {
    const ts = typeof fetchedAt === 'string' ? Date.parse(fetchedAt) : Number(fetchedAt);
    if (Number.isFinite(ts)) {
      const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
      if (ageHours > staleHours) {
        return { badge: 'stale', reason: `data is ${Math.round(ageHours)}h old; threshold ${staleHours}h` };
      }
    }
  }
  return { badge: 'verified', reason: 'fresh + approved' };
}
