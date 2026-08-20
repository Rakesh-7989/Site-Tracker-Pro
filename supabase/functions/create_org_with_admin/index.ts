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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate } from "../_shared/auth.ts";

declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

const ALLOWED = (Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "https://sitetrackpro.in,http://localhost:5173")
  .split(",").map(s => s.trim()).filter(Boolean);
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED[0] ?? "*",
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
  const smtpHost = Deno.env.get("SMTP_HOST");
  const smtpPort = Deno.env.get("SMTP_PORT");
  const smtpUser = Deno.env.get("SMTP_USER");
  const smtpPassword = Deno.env.get("SMTP_PASSWORD");

  if (smtpHost && smtpPort && smtpUser && smtpPassword) {
    // Send via SMTP
    try {
      const from = `"SiteTrack Pro" <${smtpUser}>`;
      const socket = await Deno.net.connect({
        hostname: smtpHost,
        port: parseInt(smtpPort),
      });

      // Start TLS
      await new Promise<void>((resolve, reject) => {
        socket.secureAsyncResolve = resolve;
        socket.secureAsyncReject = reject;
        socket.startTLS({ hostname: smtpHost });
      });

      // Authenticate
      const write = (data: string) => new Promise<void>((resolve, reject) => {
        socket.write(new TextEncoder().encode(data + "\r\n"));
        setTimeout(resolve, 1000);
      });

      const readLine = (): Promise<string> => new Promise((resolve) => {
        let data = "";
        socket.ondata = (event: any) => {
          data += new TextDecoder().decode(event.data);
          if (data.includes("\n")) {
            const line = data.substring(0, data.indexOf("\n"));
            socket.ondata = undefined;
            resolve(line);
          }
        };
      });

      await readLine(); // 220
      await write(`EHLO ${smtpHost}`);
      await readLine(); // 250
      await write(`AUTH LOGIN`);
      await readLine(); // 334
      await write(Buffer.from(smtpUser).toString("base64"));
      await readLine(); // 334
      await write(Buffer.from(smtpPassword).toString("base64"));
      await readLine(); // 235

      // Mail from
      await write(`MAIL FROM:<${smtpUser}>`);
      await readLine(); // 250

      // RCPT TO
      await write(`RCPT TO:<${to}>`);
      await readLine(); // 250

      // DATA
      await write(`DATA`);
      await readLine(); // 354

      await write(`${html}\r\n.\r\n`);
      await readLine(); // 250
      await write(`QUIT`);
      await readLine(); // 221

      socket.close();
      return true;
    } catch (e) {
      console.error("SMTP send failed, falling back to REST API", e);
      // Fall through to REST API below
    }
  }

  // Fall back to REST API
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "SiteTrack <hello@sitetrackpro.in>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject: `Your SiteTrack Pro workspace "${orgName}" is ready`, html }),
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

  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") || "https://sitetrackpro.in").replace(/\/+$/, "");
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
