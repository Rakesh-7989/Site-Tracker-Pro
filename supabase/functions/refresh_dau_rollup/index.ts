// SiteTrack Pro — DAU/WAU/MAU materialized view refresh cron.
//
// Called by external scheduler (or pg_cron fallback) to keep
// org_dau_rollup fresh. Delegates to the admin_refresh_dau_rollup()
// RPC using the service_role key.
//
// Invocation:
//   curl -X POST $SUPABASE_FUNCTION_URL/refresh_dau_rollup \
//     -H "Authorization: Bearer $CRON_SECRET"
//
// Returns:
//   { ok: true,  tick_at, rows, elapsed_ms }
//   { ok: false, tick_at, error }

import { authenticateCron } from "../_shared/auth.ts";

interface RefreshResponse {
  ok: boolean;
  tick_at: string;
  rows?: number;
  elapsed_ms?: number;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const cronAuth = authenticateCron(req, "CRON_SECRET");
  if (!cronAuth.ok) return cronAuth.response;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return Response.json({
      ok: false,
      tick_at: new Date().toISOString(),
      error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing",
    } satisfies RefreshResponse, { status: 500 });
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/rpc/admin_refresh_dau_rollup`,
    {
      method: "POST",
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return Response.json({
      ok: false,
      tick_at: new Date().toISOString(),
      error: `admin_refresh_dau_rollup RPC failed: ${res.status} ${text.slice(0, 200)}`,
    } satisfies RefreshResponse, { status: 500 });
  }

  const body: { rows?: number; elapsed_ms?: number } = await res.json();
  return Response.json({
    ok: true,
    tick_at: new Date().toISOString(),
    rows: body.rows,
    elapsed_ms: body.elapsed_ms,
  } satisfies RefreshResponse);
});
