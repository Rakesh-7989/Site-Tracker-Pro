// SiteTrack Pro — shared CORS helper for Edge Functions.
//
// Reads CORS_ALLOWED_ORIGINS from env (comma-separated) and echoes the
// request Origin back when it matches, falling back to the first allowed
// origin for non-browser / preflight requests.  This is safer than "*"
// while still supporting localhost dev + the deployed app.

const DEFAULT_ORIGINS = "https://sitetrackpro.in,http://localhost:5173";

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? DEFAULT_ORIGINS)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const origin = req.headers.get("origin") ?? "";
  const match = allowed.find(a => a === origin) ?? allowed[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": match,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH, DELETE",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, x-tenant-id",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsResponse(req: Request): Response {
  const headers = corsHeaders(req);
  return new Response("ok", { status: 204, headers });
}
