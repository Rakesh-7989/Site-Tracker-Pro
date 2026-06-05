// SiteTrack Pro — invite a BRAND-NEW user to an org by email (HRMS Phase B).
//
// Org admin enters an email that has no SiteTrack account yet. This function:
//   1. verifies the caller is an admin of the target org (or superadmin)
//   2. invites the email via Supabase Auth (creates the auth user + sends a
//      set-password email through the project SMTP — Resend, free tier)
//      WITHOUT firm_name, so the migration-34 trigger creates a profile-only
//      row (role='client'), NOT a new org
//   3. adds the new user to the org at the chosen tier (org_members)
//
// Existing accounts are handled by the in-app "Find" flow (lookup_user_for_
// invite RPC) — this EF is only for new emails. Zero new spend.
//
// Deploy: `node scripts/deploy-edge-functions.mjs` (needs `supabase login`).

// @ts-ignore — Deno URL import; resolved at runtime, not by Node tsc.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

// @ts-ignore — Deno global.
declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ORG_TIER_ROLES = ["admin", "pm", "architect", "contractor", "client", "vendor"];

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }

  const orgId = String(body.orgId ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const orgRole = String(body.orgRole ?? "architect");
  const name = body.name ? String(body.name) : undefined;

  if (!orgId || !email || !email.includes("@")) return json({ ok: false, error: "missing-fields" }, 400);
  if (!ORG_TIER_ROLES.includes(orgRole)) return json({ ok: false, error: "bad-role" }, 400);

  // ── Authorize: caller must be an admin of this org (or superadmin) ──
  const auth = await authenticate(req, { requireOrgId: orgId });
  if (!auth.ok) return auth.response;
  const isAdmin = auth.user.identityRole === "superadmin"
    || auth.orgMemberships.some(m => m.org_id === orgId && m.role === "admin");
  if (!isAdmin) return json({ ok: false, error: "not-org-admin" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrack-rakesh.vercel.app";

  // ── 1. Invite (creates auth user + profile via the mig-34 trigger) ──
  // No firm_name → trigger takes the invited-member path (profile only).
  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: name ? { name } : {},
    redirectTo: `${siteUrl}/?shell=v3`,
  });

  if (invErr || !inv?.user) {
    const msg = (invErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({ ok: false, error: "already-exists", message: "This email already has an account — use Find to add them." }, 409);
    }
    return json({ ok: false, error: "invite-failed", detail: invErr?.message }, 502);
  }

  const newUserId = inv.user.id;

  // ── 2. Add them to the org at the chosen tier ──
  const { error: omErr } = await admin
    .from("org_members")
    .upsert({ org_id: orgId, profile_id: newUserId, role: orgRole, removed_at: null }, { onConflict: "org_id,profile_id" });
  if (omErr) {
    return json({ ok: false, error: "org-member-insert-failed", detail: omErr.message }, 500);
  }

  return json({ ok: true, invited: true, userId: newUserId, email }, 200);
});
