// SiteTrack Pro — Sprint 2 (Session 30.3): BuildNow Telangana anchor Edge Function.
//
// Sync a project's BuildNow Telangana status into our DB. Two paths:
//   1. API path — when BUILDNOW_API_TOKEN is set (granted by TG IT dept).
//   2. Scrape path — Playwright on Deno against the public portal.
//   3. Mock — for tests + Sprint 2 Day 16 demo until real access lands.
//
// Idempotent — same project_id on same day = single upserted snapshot row.
// See docs/SPRINT_2_ARCHITECTURE.md for the contract.

// deno-lint-ignore-file no-explicit-any

interface AnchorRequest {
  project_id?: string;             // our internal projects.id (optional — if missing, we just fetch)
  buildnow_project_id: string;     // the ID from the state portal
  path?: "api" | "scrape" | "mock";
}

interface AnchorResponse {
  ok: boolean;
  metadata?: {
    buildnow_project_id: string;
    approval_status: string;
    current_stage: string;
    expected_completion_date?: string;
    promoter_name?: string;
    project_address?: string;
    rera_registration?: string;
    fetched_at: string;
  };
  source?: string;
  anchor_hash?: string;
  error?: string;
}

function validate(req: AnchorRequest): string | null {
  if (!req.buildnow_project_id) return "buildnow_project_id required";
  if (req.path && !["api", "scrape", "mock"].includes(req.path)) {
    return `unknown path: ${req.path}`;
  }
  return null;
}

// ── Shared canonical hash (matches src/lib/buildnowAnchor.js algorithm) ─
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function canonicalize(metadata: Record<string, unknown>): string {
  const keep = [
    "buildnow_project_id",
    "approval_status",
    "current_stage",
    "expected_completion_date",
    "promoter_name",
    "project_address",
    "rera_registration",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) {
    if (metadata[k] !== undefined && metadata[k] !== null) out[k] = metadata[k];
  }
  return JSON.stringify(out, Object.keys(out).sort());
}

// ── Path implementations ───────────────────────────────────────────────────

async function fetchViaApi(
  buildnowProjectId: string,
  env: Record<string, string>,
): Promise<AnchorResponse> {
  if (!env.BUILDNOW_API_TOKEN) {
    return { ok: false, error: "BUILDNOW_API_TOKEN missing" };
  }
  // TODO Sprint 2 mid-cycle: real API endpoint TBD per TG IT dept handoff.
  // Reference docs from buildnow.telangana.gov.in once API agreement signed.
  return {
    ok: false,
    error: "BuildNow API integration pending TG IT dept access (Sprint 2 mid-cycle)",
  };
}

async function fetchViaScrape(
  buildnowProjectId: string,
  env: Record<string, string>,
): Promise<AnchorResponse> {
  if (env.BUILDNOW_SCRAPE_ENABLED !== "true") {
    return { ok: false, error: "BUILDNOW_SCRAPE_ENABLED not set" };
  }
  // TODO Sprint 2 mid-cycle: Playwright-on-Deno scraping against
  //   https://buildnow.telangana.gov.in/project/{buildnowProjectId}
  // Note: scraping is allowed for public-info pages per the portal's robots.txt
  // (verified June 2026 — re-verify each sprint).
  return {
    ok: false,
    error: "BuildNow scraper not implemented yet",
  };
}

function fetchViaMock(buildnowProjectId: string): AnchorResponse {
  return {
    ok: true,
    metadata: {
      buildnow_project_id: buildnowProjectId,
      approval_status: "approved",
      current_stage: "phase_progress_report",
      expected_completion_date: "2027-06-30",
      promoter_name: "Demo Hyderabad Builder",
      project_address: "8 - Banjara Hills, Hyderabad",
      rera_registration: "P02400001234",
      fetched_at: new Date().toISOString(),
    },
    source: "mock",
  };
}

Deno.serve(async (httpReq: Request) => {
  if (httpReq.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  let req: AnchorRequest;
  try {
    req = await httpReq.json();
  } catch {
    return Response.json(
      { ok: false, error: "invalid JSON" } satisfies AnchorResponse,
      { status: 400 },
    );
  }
  const invalid = validate(req);
  if (invalid) {
    return Response.json(
      { ok: false, error: invalid } satisfies AnchorResponse,
      { status: 400 },
    );
  }

  const env = Deno.env.toObject();
  const path = req.path ?? (env.BUILDNOW_API_TOKEN
    ? "api"
    : env.BUILDNOW_SCRAPE_ENABLED === "true"
      ? "scrape"
      : "mock");

  let result: AnchorResponse;
  if (path === "api") result = await fetchViaApi(req.buildnow_project_id, env);
  else if (path === "scrape") result = await fetchViaScrape(req.buildnow_project_id, env);
  else result = fetchViaMock(req.buildnow_project_id);

  if (!result.ok || !result.metadata) {
    return Response.json(result satisfies AnchorResponse, { status: 502 });
  }

  // Compute anchor hash (matches src/lib/buildnowAnchor.js algorithm)
  const anchorHash = await sha256Hex(canonicalize(result.metadata as any));

  // Upsert into buildnow_anchors (per-day idempotent via composite PK)
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (req.project_id && supabaseUrl && serviceKey) {
    const row = {
      project_id: req.project_id,
      sync_date: new Date().toISOString().slice(0, 10),
      buildnow_project_id: req.buildnow_project_id,
      approval_status: result.metadata.approval_status,
      current_stage: result.metadata.current_stage,
      expected_completion_date: result.metadata.expected_completion_date ?? null,
      promoter_name: result.metadata.promoter_name ?? null,
      project_address: result.metadata.project_address ?? null,
      rera_registration: result.metadata.rera_registration ?? null,
      source: result.source,
      raw_payload: result.metadata,
      anchor_hash: anchorHash,
    };
    await fetch(`${supabaseUrl}/rest/v1/buildnow_anchors?on_conflict=project_id,sync_date`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
  }

  return Response.json({ ...result, anchor_hash: anchorHash } satisfies AnchorResponse);
});
