// Edge Function: tg-rera-submit  (STUB — Session 24)
//
// Real implementation: wraps a Playwright-on-Deno scraper against the TG RERA
// portal (https://rera.telangana.gov.in). The portal has NO public API — every
// filing goes through an HTML form + OTP. This Edge Function does the scrape
// server-side so customers' portal credentials never live in a browser.
//
// This file is a SCAFFOLD. It defines the request/response contract so the
// src/lib/reraTelangana.js `tgReraAdapter` can POST to a working endpoint
// in dev. The real Playwright logic lands in a follow-up session once we
// have a TG RERA test account.
//
// ENDPOINTS:
//   GET  /status?rera_number=TS/RERA/PROJECT/12345
//        → { ok: true, rera_number, status, registered_on, promoter }
//
//   POST /submit
//        body: { portal_username, portal_password, otp_phone, filing }
//        → { ok: true, ack, message }
//        OR { ok: false, error }
//
// Deploy:
//   supabase functions deploy tg-rera-submit
//
// Required env:
//   TG_RERA_SCRAPER_ENABLED=true   ← gate so this never accidentally runs against
//                                    the real portal until you've explicitly opted in

import { validateRera } from "../../../src/lib/compliance.ts";  // type-only import via Deno
import { authenticate } from "../_shared/auth.ts";

const ALLOWED_ORIGINS = (Deno.env.get("CORS_ALLOWED_ORIGINS") ||
  "https://sitetrackpro.in,https://www.sitetrackpro.in,http://localhost:5173"
).split(",").map(s => s.trim()).filter(Boolean);

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const CORS = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Security gate (Phase 0.5 hardening) ──
  // RERA filings are legally binding — only compliance officers or
  // orgadmins of the project's org may file. site_supervisor may
  // initiate but real submission needs higher authority.
  const auth = await authenticate(req, {
    requireRole: ["orgadmin", "project_admin", "site_inspector", "consultant", "superadmin", "admin"],
  });
  if (!auth.ok) {
    // Preserve CORS so the browser surfaces the 401/403 cleanly.
    const headers = new Headers(auth.response.headers);
    Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
    return new Response(auth.response.body, { status: auth.response.status, headers });
  }

  const url = new URL(req.url);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
    status: s, headers: { ...CORS, "Content-Type": "application/json" },
  });

  const enabled = Deno.env.get("TG_RERA_SCRAPER_ENABLED") === "true";

  // ── GET /status?rera_number=… ─────────────────────────────────────────
  if (req.method === "GET" && url.pathname.endsWith("/status")) {
    const rera = url.searchParams.get("rera_number") || "";
    if (!validateRera(rera).ok) {
      return json({ ok: false, error: "invalid rera_number format" }, 400);
    }
    if (!enabled) {
      // STUB mode — return a fake "active" status so callers can wire the UI.
      return json({
        ok: true,
        rera_number: rera,
        status: "active",
        registered_on: "2024-04-01",
        promoter: "STUB — TG_RERA_SCRAPER_ENABLED=false. Set to true + provide creds for real scrape.",
        notes: "This is a stub. Real scraper ships in a follow-up session once a TG RERA test account is provisioned.",
        stub: true,
      });
    }
    // TODO: real scraper goes here (Playwright on Deno, headless Chrome,
    // navigate to public status endpoint, parse the result table).
    return json({ ok: false, error: "real scraper not yet implemented" }, 501);
  }

  // ── POST /submit ───────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname.endsWith("/submit")) {
    let body;
    try { body = await req.json(); }
    catch { return json({ ok: false, error: "invalid JSON" }, 400); }
    const { portal_username, portal_password, otp_phone, filing } = body || {};
    if (!portal_username || !portal_password) {
      return json({ ok: false, error: "portal credentials required" }, 400);
    }
    if (!filing?.rera_number || !filing?.month) {
      return json({ ok: false, error: "filing payload incomplete" }, 400);
    }
    if (!enabled) {
      // STUB mode — record the attempt + return a fake ack.
      console.log("tg-rera-submit STUB called for", filing.rera_number, filing.month);
      return json({
        ok: true,
        ack: `STUB-${filing.month}-${Date.now().toString(36).toUpperCase()}`,
        message: "STUB filing — set TG_RERA_SCRAPER_ENABLED=true to submit for real.",
        stub: true,
      });
    }
    // TODO: real Playwright scrape — login with portal_username + portal_password,
    // request OTP to otp_phone, prompt user via separate flow (out-of-band), then
    // navigate to the monthly progress form + fill + submit + screenshot the ack page.
    return json({ ok: false, error: "real scraper not yet implemented" }, 501);
  }

  return json({ ok: false, error: "unknown route" }, 404);
});
