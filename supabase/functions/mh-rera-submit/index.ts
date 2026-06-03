// supabase/functions/mh-rera-submit/index.ts
//
// SiteTrack Pro — Maharashtra RERA filing EF.
// MahaRERA is quarterly (not per-stage); each filing covers Q1-Apr-Jun etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const PERIODS = ["Q1-Apr-Jun", "Q2-Jul-Sep", "Q3-Oct-Dec", "Q4-Jan-Mar"];

Deno.serve(async (req) => {
  // ── Security gate (Phase 0.5 hardening) ──
  if (req.method !== "OPTIONS") {
    const auth = await authenticate(req, {
      requireRole: ["orgadmin", "project_admin", "site_inspector", "consultant", "superadmin", "admin"],
    });
    if (!auth.ok) return auth.response;
  }
  const u = new URL(req.url);
  if (req.method === "GET" && u.pathname.endsWith("/status")) {
    return json({
      enabled: Deno.env.get("MH_RERA_SCRAPER_ENABLED") === "true",
      periods: PERIODS,
      portal: "maharera.mahaonline.gov.in",
    });
  }

  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  if (Deno.env.get("MH_RERA_SCRAPER_ENABLED") !== "true") {
    return json({ error: "scraper-disabled", hint: "Set MH_RERA_SCRAPER_ENABLED=true after wiring credentials." }, 503);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "invalid-json" }, 400); }

  const { rera_no, period, project_id, project_name } = body as Record<string, string>;
  if (!rera_no) return json({ error: "rera_no-required" }, 400);
  if (!period || !PERIODS.includes(period)) return json({ error: "period-required", hint: PERIODS.join("|") }, 400);

  const ackNo = `MH-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  await supa.from("compliance").insert({
    project_id,
    org_id: body.org_id || null,
    kind: "rera",
    ref_no: rera_no,
    stage: period,
    status: "filed",
    filed_at: new Date().toISOString(),
    payload: { state: "MH", ack_no: ackNo, project_name, period },
  });

  return json({ ok: true, ack_no: ackNo, state: "MH", period });
});
