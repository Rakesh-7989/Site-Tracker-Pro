// SiteTrack Pro — Edge Function authentication + role helpers.
//
// Closes the 4 critical security gaps the R&D audit found (June 2026):
//   - gstn-einvoice    — accepted ANY caller; could tamper invoices
//   - ka/mh/tg-rera-submit — accepted ANY caller; could file fake returns
//   - promoter_digest_cron — Bearer expected but never verified
//   - voice_transcribe — cache poisoning attack possible
//
// Standard usage at the top of an EF handler:
//
//   const auth = await authenticate(req, {
//     requireRole: ["finance_admin", "orgadmin"],
//     requireProjectId: body.project_id,            // optional
//   });
//   if (!auth.ok) return auth.response;             // 401 or 403
//   // ... auth.user is the verified caller
//
// For cron endpoints that need a static secret:
//   const auth = authenticateCron(req, "CRON_SECRET");
//   if (!auth.ok) return auth.response;
//
// All decisions are tested in tests/efAuth.test.ts.

// @ts-ignore — Deno URL import; Node tsc can't resolve. Runtime works under
// both Deno (EFs) and vitest (where supabase-js is module-mocked).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno is the runtime — declared here so this file also typechecks under
// the Node tsconfig used for tests (vitest imports it via dynamic import).
declare const Deno: { env: { get(name: string): string | undefined } };

interface OrgMemberRow { org_id: string; role: string }

export interface AuthenticatedUser {
  /** auth.users.id */
  id: string;
  /** auth.users.email */
  email: string;
  /** profiles.role (one of the 26 identity roles) */
  identityRole: string;
  /** profiles.is_staff */
  isStaff: boolean;
}

export interface AuthSuccess {
  ok: true;
  user: AuthenticatedUser;
  /** org_members rows for THIS user (may be many) */
  orgMemberships: Array<{ org_id: string; role: string }>;
  /** Only populated when requireProjectId was passed */
  projectMembership?: { project_id: string; role: string };
}

export interface AuthFailure {
  ok: false;
  response: Response;
}

export type AuthResult = AuthSuccess | AuthFailure;

export interface AuthenticateOpts {
  /**
   * If set, the caller MUST hold one of these identity roles
   * (profiles.role) OR org_members.role IN this set. Empty = no role gate.
   */
  requireRole?: string[];
  /**
   * If set, the caller MUST be a project_members row on THIS project_id
   * (unless they are superadmin or orgadmin of the project's org).
   */
  requireProjectId?: string | undefined;
  /**
   * If set, the caller MUST be a member of THIS org_id (org_members row).
   */
  requireOrgId?: string | undefined;
}

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Authenticate the caller's JWT + enforce optional role/project/org gates.
 *
 * Returns either { ok: true, user, orgMemberships, projectMembership? }
 * or { ok: false, response } where response is a 401 / 403 with structured
 * error body for the browser to surface.
 */
export async function authenticate(
  req: Request,
  opts: AuthenticateOpts = {},
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearer) {
    return {
      ok: false,
      response: json({ ok: false, error: "missing-bearer-token" }, 401),
    };
  }
  const token = bearer[1].trim();

  // Verify the JWT against Supabase Auth.
  const sb = getServiceClient();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) {
    return {
      ok: false,
      response: json({ ok: false, error: "invalid-token", detail: userErr?.message }, 401),
    };
  }
  const authUser = userData.user;

  // Fetch profile (identity role + is_staff).
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("role, is_staff")
    .eq("id", authUser.id)
    .maybeSingle();

  if (profileErr) {
    return {
      ok: false,
      response: json({ ok: false, error: "profile-lookup-failed", detail: profileErr.message }, 500),
    };
  }
  if (!profile) {
    return {
      ok: false,
      response: json({ ok: false, error: "no-profile-row" }, 403),
    };
  }

  // Fetch all org memberships.
  const { data: orgRows } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("profile_id", authUser.id);
  const orgMemberships = (orgRows ?? []).map((r: OrgMemberRow) => ({ org_id: String(r.org_id), role: String(r.role) }));

  const user: AuthenticatedUser = {
    id: authUser.id,
    email: authUser.email || "",
    identityRole: String(profile.role),
    isStaff: Boolean(profile.is_staff),
  };

  // ── Gate 1: required identity role ──
  if (opts.requireRole && opts.requireRole.length > 0) {
    const orgTierRoles = new Set(orgMemberships.map((m: OrgMemberRow) => m.role));
    const hasIdentity = opts.requireRole.includes(user.identityRole);
    const hasOrgTier  = opts.requireRole.some((r: string) => orgTierRoles.has(r));
    // superadmin bypasses all role gates (cross-tenant staff).
    if (user.identityRole !== "superadmin" && !hasIdentity && !hasOrgTier) {
      return {
        ok: false,
        response: json({
          ok: false,
          error: "insufficient-role",
          required: opts.requireRole,
          actual: user.identityRole,
        }, 403),
      };
    }
  }

  // ── Gate 2: required org membership ──
  if (opts.requireOrgId) {
    const inOrg = orgMemberships.some((m: OrgMemberRow) => m.org_id === opts.requireOrgId);
    if (user.identityRole !== "superadmin" && !inOrg) {
      return {
        ok: false,
        response: json({
          ok: false,
          error: "not-org-member",
          required_org_id: opts.requireOrgId,
        }, 403),
      };
    }
  }

  // ── Gate 3: required project_members row ──
  let projectMembership: { project_id: string; role: string } | undefined;
  if (opts.requireProjectId) {
    if (user.identityRole === "superadmin") {
      projectMembership = { project_id: opts.requireProjectId, role: "superadmin" };
    } else {
      // First, allow orgadmin of the project's org.
      const { data: project } = await sb
        .from("projects")
        .select("id, org_id")
        .eq("id", opts.requireProjectId)
        .maybeSingle();
      if (!project) {
        return {
          ok: false,
          response: json({ ok: false, error: "project-not-found" }, 404),
        };
      }
      const isOrgAdmin = orgMemberships.some(
        (m: OrgMemberRow) => m.org_id === project.org_id && m.role === "admin",
      );

      if (isOrgAdmin) {
        projectMembership = { project_id: String(project.id), role: "admin" };
      } else {
        const { data: pm } = await sb
          .from("project_members")
          .select("role")
          .eq("project_id", opts.requireProjectId)
          .eq("profile_id", authUser.id)
          .is("removed_at", null)
          .maybeSingle();
        if (!pm) {
          return {
            ok: false,
            response: json({
              ok: false,
              error: "not-project-member",
              required_project_id: opts.requireProjectId,
            }, 403),
          };
        }
        projectMembership = { project_id: opts.requireProjectId, role: String(pm.role) };
      }
    }
  }

  return {
    ok: true,
    user,
    orgMemberships,
    ...(projectMembership ? { projectMembership } : {}),
  };
}

/**
 * Verify a static cron secret. Cheaper than JWT-based authenticate() for
 * pg_cron / scheduled-task endpoints.
 *
 * Usage:
 *   const auth = authenticateCron(req, "CRON_SECRET");
 *   if (!auth.ok) return auth.response;
 *   // proceed
 */
export function authenticateCron(
  req: Request,
  envVarName: string,
): { ok: true } | { ok: false; response: Response } {
  const expected = Deno.env.get(envVarName);
  if (!expected) {
    return {
      ok: false,
      response: json({ ok: false, error: "cron-secret-not-configured" }, 500),
    };
  }
  const got = req.headers.get("Authorization") || "";
  const bearer = got.match(/^Bearer\s+(.+)$/i);
  if (!bearer || bearer[1].trim() !== expected) {
    return {
      ok: false,
      response: json({ ok: false, error: "invalid-cron-secret" }, 401),
    };
  }
  return { ok: true };
}
