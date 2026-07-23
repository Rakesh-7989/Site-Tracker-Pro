const BUILDNOW_BASE = "https://buildnow.telangana.gov.in";

export const APPROVAL_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
] as const;

export const KNOWN_STAGES = [
  "project_registration",
  "commencement_certificate",
  "phase_progress_report",
  "completion_certificate",
  "occupancy_certificate",
] as const;

interface DprPayload {
  client_token?: string;
  org_id?: string;
  project_id?: string;
  supervisor_user_id?: string;
  promoter_phone_e164?: string;
  language?: string;
  transcript_text?: string;
  voice_audio_sha256?: string;
  photo_url?: string;
  photo_lat?: number;
  photo_lon?: number;
  [key: string]: unknown;
}

interface Metadata {
  approval_status?: string;
  fetched_at?: string | number;
  [key: string]: unknown;
}

interface BadgeState {
  badge: "verified" | "stale" | "warning" | "unverified" | "none";
  reason: string;
}

interface Env {
  BUILDNOW_API_TOKEN?: string;
  BUILDNOW_SCRAPE_ENABLED?: string;
  VITEST?: string;
  NODE_ENV?: string;
  [key: string]: unknown;
}

interface EfClient {
  invoke: (name: string, opts: { body: Record<string, unknown> }) => Promise<{ error?: { message: string }; data?: Record<string, unknown> }>;
}

interface FetchOpts {
  env?: Env;
  efClient?: EfClient;
  transport?: string;
}

interface ProjectMetadataResult {
  ok: boolean;
  metadata?: Metadata;
  source?: string;
  error?: string;
}

export function generateBadgeUrl(buildnowProjectId: string, dprId: string): string {
  if (!buildnowProjectId || !dprId) {
    throw new Error("generateBadgeUrl: both buildnowProjectId and dprId required");
  }
  const params = new URLSearchParams({
    p: String(buildnowProjectId),
    d: String(dprId),
  });
  return `${BUILDNOW_BASE}/verify?${params.toString()}`;
}

export function canonicalizeDprPayload(payload: DprPayload): Partial<DprPayload> {
  if (!payload || typeof payload !== "object") return {};
  const KEEP = [
    "client_token",
    "org_id",
    "project_id",
    "supervisor_user_id",
    "promoter_phone_e164",
    "language",
    "transcript_text",
    "voice_audio_sha256",
    "photo_url",
    "photo_lat",
    "photo_lon",
  ] as const;
  const out: Partial<DprPayload> = {};
  for (const k of KEEP) {
    if (payload[k] !== undefined && payload[k] !== null) (out as Record<string, unknown>)[k] = payload[k];
  }
  if (typeof out.photo_lat === "number") out.photo_lat = Math.round(out.photo_lat * 1e6) / 1e6;
  if (typeof out.photo_lon === "number") out.photo_lon = Math.round(out.photo_lon * 1e6) / 1e6;
  return out;
}

export async function computeAnchorHash(payload: DprPayload): Promise<string> {
  const canon = canonicalizeDprPayload(payload);
  const text = JSON.stringify(canon, Object.keys(canon).sort() as (string | number)[]);
  const bytes = new TextEncoder().encode(text);
  if (!(typeof crypto !== "undefined" && crypto.subtle)) {
    throw new Error("computeAnchorHash: SubtleCrypto unavailable");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function pickAcquisitionPath(env: Env = {}): "api" | "scrape" | "mock" | null {
  if (env.BUILDNOW_API_TOKEN) return "api";
  if (env.BUILDNOW_SCRAPE_ENABLED === "true") return "scrape";
  if (env.VITEST || env.NODE_ENV === "test") return "mock";
  return null;
}

export async function mockFetchProjectMetadata(buildnowProjectId: string): Promise<{ ok: true; metadata: Metadata; source: "mock" }> {
  const safeId = String(buildnowProjectId || "unknown");
  return {
    ok: true,
    metadata: {
      buildnow_project_id: safeId,
      approval_status: "approved",
      current_stage: "phase_progress_report",
      expected_completion_date: "2027-06-30",
      promoter_name: "Demo Hyderabad Builder",
      project_address: "8 - Banjara Hills, Hyderabad",
      rera_registration: "P02400001234",
    },
    source: "mock",
  };
}

export async function fetchProjectMetadata(buildnowProjectId: string, opts: FetchOpts = {}): Promise<ProjectMetadataResult> {
  const { env = {}, efClient, transport } = opts;
  if (!buildnowProjectId) {
    return { ok: false, error: "buildnowProjectId required" };
  }
  const path = transport === "mock" ? "mock" : pickAcquisitionPath(env);

  if (path === "mock") {
    return mockFetchProjectMetadata(buildnowProjectId);
  }

  if (efClient && typeof efClient.invoke === "function") {
    try {
      const res = await efClient.invoke("buildnow_anchor", {
        body: { buildnow_project_id: buildnowProjectId, path },
      });
      if (res?.error) return { ok: false, error: res.error.message || "EF error" };
      return (res?.data ?? { ok: false, error: "EF returned no data" }) as unknown as ProjectMetadataResult;
    } catch (err) {
      return { ok: false, error: (err as Error)?.message || String(err) };
    }
  }

  return {
    ok: false,
    error:
      "BuildNow fetch path not configured. Set BUILDNOW_API_TOKEN or BUILDNOW_SCRAPE_ENABLED=true.",
  };
}

export function badgeStateFor(metadata: Metadata | null | undefined, opts: { staleHours?: number } = {}): BadgeState {
  const { staleHours = 24 } = opts;
  if (!metadata) return { badge: "none", reason: "no metadata" };
  if (!APPROVAL_STATUSES.includes(metadata.approval_status as typeof APPROVAL_STATUSES[number])) {
    return { badge: "unverified", reason: "unknown approval_status" };
  }
  if (metadata.approval_status === "rejected") {
    return { badge: "warning", reason: "BuildNow rejected this project" };
  }
  const fetchedAt = metadata.fetched_at;
  if (fetchedAt) {
    const ts = typeof fetchedAt === "string" ? Date.parse(fetchedAt) : Number(fetchedAt);
    if (Number.isFinite(ts)) {
      const ageHours = (Date.now() - ts) / (1000 * 60 * 60);
      if (ageHours > staleHours) {
        return { badge: "stale" as const, reason: `data is ${Math.round(ageHours)}h old; threshold ${staleHours}h` };
      }
    }
  }
  return { badge: "verified" as const, reason: "fresh + approved" };
}
