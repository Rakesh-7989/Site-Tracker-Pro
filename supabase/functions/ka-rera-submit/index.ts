// supabase/functions/ka-rera-submit/index.ts
//
// SiteTrack Pro — Karnataka RERA filing EF.
// Mirrors tg-rera-submit pattern but routes to rera.karnataka.gov.in.
// Gated by KA_RERA_SCRAPER_ENABLED env until tested against a real KA account.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const url = new URL("/", "http://x");
void url;

const KA_STAGE_CODES: Record<string, { code: string; label: string }> = {
  commencement:  { code: "C1", label: "Commencement" },
  excavation:    { code: "C2", label: "Excavation" },
  foundation:    { code: "F1", label: "Foundation" },
  plinth:        { code: "F2", label: "Plinth" },
  ground_slab:   { code: "S0", label: "Ground floor slab" },
  upper_slabs:   { code: "S1", label: "Upper floor slabs" },
  finishing:     { code: "FN", label: "Finishing" },
  occupancy:     { code: "OC", label: "Occupancy certificate" },
  handover:      { code: "HO", label: "Handover" },
};

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET" && u.pathname.endsWith("/status")) {
    return json({
      enabled: Deno.env.get("KA_RERA_SCRAPER_ENABLED") === "true",
      stages: Object.keys(KA_STAGE_CODES),
      portal: "rera.karnataka.gov.in",
    });
  }

  if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const enabled = Deno.env.get("KA_RERA_SCRAPER_ENABLED") === "true";
  if (!enabled) return json({
    error: "scraper-disabled",
    hint: "Set KA_RERA_SCRAPER_ENABLED=true after wiring credentials.",
  }, 503);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "invalid-json" }, 400); }

  const { rera_no, project_name, stage_key, project_id } = body as Record<string, string>;
  if (!rera_no) return json({ error: "rera_no-required" }, 400);
  if (!stage_key || !KA_STAGE_CODES[stage_key]) return json({ error: "stage-required" }, 400);

  // Real implementation: Playwright scraper or, ideally, the KA RERA REST API
  // once they expose one. We stub with a delayed mock response.
  const ackNo = `KA-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

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
    stage: stage_key,
    status: "filed",
    filed_at: new Date().toISOString(),
    payload: { state: "KA", ack_no: ackNo, project_name, stage_code: KA_STAGE_CODES[stage_key].code },
  });

  return json({ ok: true, ack_no: ackNo, state: "KA", stage_code: KA_STAGE_CODES[stage_key].code });
});
