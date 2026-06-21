// SiteTrack Pro — create_org_with_admin (bundled with shared auth code)
// AUTO-GENERATED — do not edit directly. Edit source files and re-run bundle-ef.mjs

// @ts-ignore — npm specifier; resolved at runtime by Deno.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

// ── Shared auth code ──

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

// Deno is the runtime — declared here so this file also typechecks under
// the Node tsconfig used for tests (vitest imports it via dynamic import).

interface OrgMemberRow { org_id: string; role: string }

interface AuthenticatedUser {
  /** auth.users.id */
  id: string;
  /** auth.users.email */
  email: string;
  /** profiles.role (one of the 26 identity roles) */
  identityRole: string;
  /** profiles.is_staff */
  isStaff: boolean;
  /** profiles.staff_tier */
  staffTier: "owner" | "head" | "member" | null;
}

interface AuthSuccess {
  ok: true;
  user: AuthenticatedUser;
  /** org_members rows for THIS user (may be many) */
  orgMemberships: Array<{ org_id: string; role: string }>;
  /** Only populated when requireProjectId was passed */
  projectMembership?: { project_id: string; role: string };
}

interface AuthFailure {
  ok: false;
  response: Response;
}

type AuthResult = AuthSuccess | AuthFailure;

interface AuthenticateOpts {
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



function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isPlatformStaff(user: AuthenticatedUser): boolean {
  return user.identityRole === "superadmin"
    || (user.isStaff && (user.staffTier === "owner" || user.staffTier === "head" || user.staffTier === "member"));
}

/**
 * Authenticate the caller's JWT + enforce optional role/project/org gates.
 *
 * Returns either { ok: true, user, orgMemberships, projectMembership? }
 * or { ok: false, response } where response is a 401 / 403 with structured
 * error body for the browser to surface.
 */
async function authenticate(
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

  // Fetch profile (identity role + staff flags).
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("role, is_staff, staff_tier")
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
    staffTier: profile.staff_tier === "owner" || profile.staff_tier === "head" || profile.staff_tier === "member"
      ? profile.staff_tier
      : null,
  };
  const platformStaff = isPlatformStaff(user);

  // ── Gate 1: required identity role ──
  if (opts.requireRole && opts.requireRole.length > 0) {
    const orgTierRoles = new Set(orgMemberships.map((m: OrgMemberRow) => m.role));
    const hasIdentity = opts.requireRole.includes(user.identityRole);
    const hasOrgTier  = opts.requireRole.some((r: string) => orgTierRoles.has(r));
    // Platform staff bypass role gates, even if an old seed left role != superadmin.
    if (!platformStaff && !hasIdentity && !hasOrgTier) {
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
    if (!platformStaff && !inOrg) {
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
    if (platformStaff) {
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
function authenticateCron(
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

// ── Function code ──

// SiteTrack Pro — owner creates a new org with an admin user.
//
// The owner fills org name, admin email, admin phone, and plan. This EF:
//   1. Validates all mandatory fields
//   2. Generates a random temporary password
//   3. Creates the auth user with that password via Supabase Admin API
//   4. Creates the organization
//   5. Creates the profile row
//   6. Adds the user as org admin (org_members)
//   7. Sends a branded email with org details + temp password
//
// Auth: owner / superadmin only.

// @ts-ignore - Deno URL import; resolved at runtime.


const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status: number): Response =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const esc = (s: string): string => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom", enterprise: "Enterprise" };

function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  let pw = "";
  pw += upper[crypto.getRandomValues(new Uint8Array(1))[0] % upper.length];
  pw += lower[crypto.getRandomValues(new Uint8Array(1))[0] % lower.length];
  pw += digits[crypto.getRandomValues(new Uint8Array(1))[0] % digits.length];
  for (let i = 0; i < 9; i++) {
    pw += all[crypto.getRandomValues(new Uint8Array(1))[0] % all.length];
  }
  return pw.split("").sort(() => crypto.getRandomValues(new Uint8Array(1))[0] - 128).join("");
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "org";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function validateEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function validatePhone(p: string): boolean {
  return /^[\d\s+\-()]{7,20}$/.test(p);
}

async function sendOrgWelcomeEmail(
  to: string,
  orgName: string,
  plan: string,
  adminEmail: string,
  tempPassword: string,
  loginUrl: string,
): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;

  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrack.in>";
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="width:48px;height:48px;border-radius:12px;background:#ea580c;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:700">S</div>
      </div>
      <h2 style="color:#1c1917;text-align:center">Your SiteTrack Pro workspace is ready</h2>
      <p style="color:#57534e">Hi Team <b>${esc(orgName)}</b>,</p>
      <p style="color:#57534e">Your organisation has been created on the <b>${esc(PLAN_LABEL[plan] || plan)}</b> plan. Below are your login credentials:</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fafaf9;border-radius:8px;font-size:14px">
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Workspace</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(orgName)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Plan</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(PLAN_LABEL[plan] || plan)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c;border-bottom:1px solid #e7e5e4">Email</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;border-bottom:1px solid #e7e5e4">${esc(adminEmail)}</td></tr>
        <tr><td style="padding:10px 16px;color:#78716c">Temporary password</td><td style="padding:10px 16px;font-weight:600;color:#1c1917;font-family:monospace;letter-spacing:1px">${esc(tempPassword)}</td></tr>
      </table>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#991b1b">
        <strong>Important:</strong> Please change your password after first login.
      </div>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(loginUrl)}" style="background:#ea580c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Sign in to SiteTrack Pro
        </a>
      </p>
      <p style="color:#78716c;font-size:13px;text-align:center">If the button does not work, copy this URL:<br>${esc(loginUrl)}</p>
      <p style="color:#78716c;font-size:13px;text-align:center">- Team SiteTrack Pro</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to,
        subject: `Your SiteTrack Pro workspace "${orgName}" is ready`,
        html,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  const auth = await authenticate(req, { requireRole: ["superadmin"] });
  if (!auth.ok) return auth.response;

  const isOwner = auth.user.staffTier === "owner";
  if (!isOwner) {
    return json({ ok: false, error: "only-owner", message: "Only the platform owner can create organizations." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  const orgName = String(body.orgName ?? "").trim();
  const adminEmail = String(body.adminEmail ?? "").trim().toLowerCase();
  const adminPhone = String(body.adminPhone ?? "").trim();
  const plan = String(body.plan ?? "basic").trim();
  const adminName = String(body.adminName ?? "").trim() || adminEmail.split("@")[0] || "Admin";

  const missing: string[] = [];
  if (!orgName) missing.push("orgName");
  if (!adminEmail) missing.push("adminEmail");
  if (!adminPhone) missing.push("adminPhone");
  if (!plan) missing.push("plan");
  if (missing.length) {
    return json({ ok: false, error: "missing-fields", fields: missing }, 400);
  }

  if (!validateEmail(adminEmail)) {
    return json({ ok: false, error: "invalid-email" }, 400);
  }
  if (!validatePhone(adminPhone)) {
    return json({ ok: false, error: "invalid-phone" }, 400);
  }

  const validPlans = ["basic", "pro", "business", "enterprise", "custom"];
  if (!validPlans.includes(plan)) {
    return json({ ok: false, error: "invalid-plan", valid: validPlans }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "service-not-configured" }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrack-rakesh.vercel.app").replace(/\/+$/, "");
  const loginUrl = `${siteUrl}/login`;

  const tempPassword = generateTempPassword();

  let userId: string | null = null;
  let userAlreadyExisted = false;

  // 1. Create auth user with temp password
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { name: adminName, phone: adminPhone },
  });

  if (createErr) {
    const msg = (createErr.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      const { data: existingUser, error: lookupErr } = await admin.auth.admin.getUserByEmail(adminEmail);
      if (lookupErr || !existingUser?.user) {
        return json({ ok: false, error: "user-exists-lookup-failed", detail: lookupErr?.message }, 502);
      }
      userId = existingUser.user.id;
      userAlreadyExisted = true;
    } else {
      return json({ ok: false, error: "auth-user-create-failed", detail: createErr.message }, 502);
    }
  } else if (createData?.user) {
    userId = createData.user.id;
  }

  if (!userId) {
    return json({ ok: false, error: "auth-user-missing" }, 502);
  }

  // 2. Create org
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ slug: slugify(orgName), name: orgName, plan, created_by_staff: auth.user.id })
    .select("id, name, slug, plan, created_at")
    .single();

  if (orgErr) {
    if (!userAlreadyExisted) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    return json({ ok: false, error: "org-create-failed", detail: orgErr.message }, 500);
  }

  const orgId = String(org.id);

  // 3. Upsert profile
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert({ id: userId, name: adminName, role: "orgadmin", phone: adminPhone }, { onConflict: "id", ignoreDuplicates: true });

  if (profileErr) {
    await admin.from("organizations").delete().eq("id", orgId).catch(() => {});
    if (!userAlreadyExisted) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    return json({ ok: false, error: "profile-create-failed", detail: profileErr.message }, 500);
  }

  // 4. Add as org admin
  const { error: omErr } = await admin
    .from("org_members")
    .upsert({ org_id: orgId, profile_id: userId, role: "admin", removed_at: null }, { onConflict: "org_id,profile_id" });

  if (omErr) {
    await admin.from("organizations").delete().eq("id", orgId).catch(() => {});
    if (!userAlreadyExisted) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
    return json({ ok: false, error: "org-member-failed", detail: omErr.message }, 500);
  }

  // 5. Send welcome email (best-effort)
  const emailSent = await sendOrgWelcomeEmail(adminEmail, orgName, plan, adminEmail, tempPassword, loginUrl);

  return json({
    ok: true,
    org: {
      id: orgId,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      createdAt: org.created_at,
    },
    user: { id: userId, email: adminEmail },
    tempPassword,
    emailSent,
    userAlreadyExisted,
  }, 200);
});
