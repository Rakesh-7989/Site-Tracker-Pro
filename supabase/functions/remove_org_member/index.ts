// SiteTrack Pro — permanently remove a member from an org, deleting their auth
// account so the email can be re-invited fresh.
//
// This is a destructive action:
//   1. Deletes the auth user (auth.users) — cascades to profiles, org_members,
//      project_members, and all related rows.
//   2. Only callable by an active org admin of the target org (or superadmin).
//   3. Self-deletion is blocked.
//
// The frontend calls this when the org admin clicks "Delete" in the member
// list and confirms the dialog.
//
// Deploy: `supabase functions deploy remove_org_member`

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

declare const Deno: {
  env: { get(n: string): string | undefined };
  serve(h: (req: Request) => Promise<Response> | Response): void;
};

const ALLOWED = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "https://sitetrackpro.in,http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
const ALLOWED_SET = new Set(ALLOWED);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_SET.has(origin) ? origin : (ALLOWED[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const json = (data: unknown, status: number, req: Request): Response => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  return new Response(JSON.stringify(data), { status, headers });
};

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405, req);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400, req); }

  const orgId = String(body.orgId ?? "");
  const profileId = String(body.profileId ?? "");

  if (!orgId || !profileId) return json({ ok: false, error: "missing-fields" }, 400, req);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500, req);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const auth = await authenticate(req, { requireOrgId: orgId });
  if (!auth.ok) {
    const body = await auth.response.text();
    const h = new Headers(auth.response.headers);
    for (const [k, v] of Object.entries(cors)) h.set(k, v);
    return new Response(body, { status: auth.response.status, statusText: auth.response.statusText, headers: h });
  }

  const isAdmin = auth.user.identityRole === "superadmin"
    || auth.orgMemberships.some(m => m.org_id === orgId && m.role === "admin");
  if (!isAdmin) return json({ ok: false, error: "not-org-admin" }, 403, req);

  if (auth.user.id === profileId) return json({ ok: false, error: "cannot-delete-self" }, 400, req);

  const { data: targetMembership, error: membershipErr } = await admin
    .from("org_members")
    .select("org_id")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (membershipErr) return json({ ok: false, error: "lookup-failed", detail: membershipErr.message }, 500, req);
  if (!targetMembership) return json({ ok: false, error: "not-org-member" }, 404, req);

  const { error: deleteErr } = await admin.auth.admin.deleteUser(profileId);
  if (deleteErr) {
    if (deleteErr.message?.toLowerCase().includes("not found")) {
      return json({ ok: false, error: "user-not-found" }, 404, req);
    }
    return json({ ok: false, error: "delete-failed", detail: deleteErr.message }, 502, req);
  }

  return json({ ok: true, profileId, removed: true }, 200, req);
});
