/**
 * SiteTrack Pro — Cloudflare Workers API Gateway
 *
 * Implements Auth, Tenant Security, and Payment Services natively on Cloudflare Workers.
 */

import { hashPassword, verifyPassword, signJwt, verifyJwt } from "./services/authService";
import { mintRazorpayPaymentLink, verifyRazorpaySignature } from "./services/paymentService";
import { uploadToR2, getFromR2, deleteFromR2 } from "./services/storageService";
import { assertTenantContext, assertWriteRole, TenantSecurityError, type SecurityContext } from "./middleware/tenant";
import {
  checkAuthRateLimit,
  consumeOneTimeToken,
  isTokenRevoked,
  issueOneTimeToken,
  revokeToken,
  verifySvixSignature,
} from "./middleware/authSecurity";
import {
  MAX_UPLOAD_BYTES,
  assertStorageDeleteAccess,
  assertStorageReadAccess,
  buildTenantStorageKey,
} from "./middleware/storageAuth";
import { assertProjectOwnerOrg } from "./repositories/projectAccess";
import { PaymentSettlementRepository, type RazorpayWebhookPayload } from "./repositories/paymentSettlementRepository";
import { ProjectRepository } from "./repositories/projectRepository";
import { SiteOpsRepository } from "./repositories/siteOpsRepository";
import { FinanceRepository } from "./repositories/financeRepository";
import { ProcurementAndDesignRepository } from "./repositories/procurementAndDesignRepository";
import { OrgAdminRepository } from "./repositories/orgAdminRepository";
import { TaskAndMilestoneRepository } from "./repositories/taskAndMilestoneRepository";
import { SiteOpsExtendedRepository } from "./repositories/siteOpsExtendedRepository";
import { CrmAndPortalRepository } from "./repositories/crmAndPortalRepository";
import { Phase7OperationsRepository, type AttendanceKind, type AttendanceStatus, type BoqStatus, type InventoryDirection } from "./repositories/phase7OperationsRepository";
import {
  Phase8SiteControlsRepository,
  type ChangeOrderStatus,
  type CorrectivePriority,
  type CorrectiveStatus,
  type RaBillStatus,
  type RfiStatus,
  type ShiftName,
} from "./repositories/phase8SiteControlsRepository";

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  CACHE?: KVNamespace;
  NOTIFICATION_QUEUE?: Queue;
  JWT_SECRET?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RESEND_WEBHOOK_SECRET?: string;
  EMAIL?: SendEmail;
}

async function sendTransactionalEmail(
  env: Env,
  params: { to: string | string[]; subject: string; html?: string; text?: string }
): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  if (!env.EMAIL) {
    if (env.NOTIFICATION_QUEUE) {
      await env.NOTIFICATION_QUEUE.send({ type: "transactional_email", ...params });
      return { ok: true, queued: true };
    }
    console.error("[Email Service] Neither EMAIL binding nor NOTIFICATION_QUEUE configured", {
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, error: "email-transport-not-configured" };
  }
  await env.EMAIL.send({
    from: { email: "notifications@sitetrackpro.in", name: "SiteTrack Pro" },
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
  return { ok: true };
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Razorpay-Signature, X-Org-Id",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Fail-closed: JWT_SECRET must be configured; never fall back to a
    // hardcoded development value that an attacker could guess from source.
    if (!env.JWT_SECRET) {
      return json({ ok: false, error: "server misconfigured" }, 500);
    }
    const jwtSecret: string = env.JWT_SECRET;

    // ── Auth helpers ──────────────────────────────────────────────────────────

    async function authenticateRequest(req: Request): Promise<{
      sub: string;
      email: string;
      org_id: string | null;
      role: string;
    } | null> {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return null;
      if (await isTokenRevoked(env.CACHE, token)) return null;
      const claims = await verifyJwt(token, jwtSecret);
      if (!claims || !claims.sub) return null;
      return {
        sub: String(claims.sub),
        email: String(claims.email || ""),
        org_id: claims.org_id ? String(claims.org_id) : null,
        role: String(claims.role || "user"),
      };
    }

    const clientIp = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";

    // 2. Health & Status
    if (url.pathname === "/api/health" || url.pathname === "/health") {
      return json({
        status: "healthy",
        runtime: "cloudflare-workers",
        timestamp: new Date().toISOString(),
      });
    }

    // ── AUTHENTICATION ROUTES ────────────────────────────────────────────────

    // POST /api/auth/register
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const rl = await checkAuthRateLimit(env.CACHE, `reg:${clientIp}`, 5, 600);
        if (!rl.allowed) {
          return json({ ok: false, error: "Too many registration attempts. Please try again later." }, 429);
        }
        const body = (await request.json()) as {
          email?: string;
          password?: string;
          fullName?: string;
          orgName?: string;
          orgSlug?: string;
          orgType?: string;
        };

        if (!body.email || !body.password || !body.orgName || !body.orgSlug) {
          return json({ ok: false, error: "Missing required fields" }, 400);
        }

        const userId = `usr_${crypto.randomUUID()}`;
        const orgId = `org_${crypto.randomUUID()}`;
        const pwdHash = await hashPassword(body.password);

        // Transactional creation in D1
        const batch = await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`
          ).bind(userId, body.email.toLowerCase().trim(), pwdHash, body.fullName || ""),
          env.DB.prepare(
            `INSERT INTO organizations (id, slug, name, org_type) VALUES (?, ?, ?, ?)`
          ).bind(orgId, body.orgSlug.toLowerCase().trim(), body.orgName.trim(), body.orgType || "builder"),
          env.DB.prepare(
            `INSERT INTO org_members (org_id, profile_id, role, is_admin) VALUES (?, ?, 'admin', 1)`
          ).bind(orgId, userId),
        ]);

        if (!batch.every((r) => r.success)) {
          return json({ ok: false, error: "Failed to persist registration" }, 500);
        }

        const token = await signJwt(
          { sub: userId, email: body.email, org_id: orgId, role: "admin" },
          jwtSecret
        );

        return json(
          {
            ok: true,
            user: { id: userId, email: body.email, fullName: body.fullName },
            organization: { id: orgId, slug: body.orgSlug, name: body.orgName },
            token,
          },
          201
        );
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /api/auth/login
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = (await request.json()) as { email?: string; password?: string };
        if (!body.email || !body.password) {
          return json({ ok: false, error: "Email and password required" }, 400);
        }
        const normalizedEmail = body.email.toLowerCase().trim();
        const rl = await checkAuthRateLimit(env.CACHE, `login:${clientIp}:${normalizedEmail}`, 10, 300);
        if (!rl.allowed) {
          return json({ ok: false, error: "Too many login attempts. Please try again in 5 minutes." }, 429);
        }

        const user = await env.DB.prepare(
          `SELECT id, email, password_hash, full_name, is_platform_admin FROM users WHERE email = ?`
        )
          .bind(normalizedEmail)
          .first<{ id: string; email: string; password_hash: string; full_name: string; is_platform_admin: number }>();

        if (!user || !user.password_hash) {
          return json({ ok: false, error: "Invalid email or password" }, 401);
        }

        const valid = await verifyPassword(body.password, user.password_hash);
        if (!valid) {
          return json({ ok: false, error: "Invalid email or password" }, 401);
        }

        // Fetch user's organizations
        const orgs = await env.DB.prepare(
          `SELECT o.id, o.slug, o.name, o.plan, om.role, om.is_admin
           FROM organizations o
           JOIN org_members om ON om.org_id = o.id
           WHERE om.profile_id = ? AND om.status = 'active'`
        )
          .bind(user.id)
          .all();

        const primaryOrg = orgs.results?.[0] as { id: string; role: string } | undefined;
        const token = await signJwt(
          {
            sub: user.id,
            email: user.email,
            org_id: primaryOrg?.id || null,
            role: primaryOrg?.role || "user",
          },
          jwtSecret
        );

        return json({
          ok: true,
          user: { id: user.id, email: user.email, fullName: user.full_name, is_platform_admin: Boolean(user.is_platform_admin) },
          organizations: orgs.results || [],
          token,
        });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /api/auth/me
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const claims = await authenticateRequest(request);
      if (!claims) {
        return json({ ok: false, error: "Invalid or expired token" }, 401);
      }

      const user = await env.DB.prepare(
        `SELECT id, email, full_name, phone, is_platform_admin FROM users WHERE id = ?`
      )
        .bind(claims.sub)
        .first();

      if (!user) return json({ ok: false, error: "User not found" }, 404);

      const orgs = await env.DB.prepare(
        `SELECT o.id, o.slug, o.name, o.plan, om.role, om.is_admin
         FROM organizations o
         JOIN org_members om ON om.org_id = o.id
         WHERE om.profile_id = ? AND om.status = 'active'`
      )
        .bind(claims.sub)
        .all();

      return json({ ok: true, user, organizations: orgs.results || [] });
    }

    // POST /api/auth/logout (revokes current JWT in KV)
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token) {
        await revokeToken(env.CACHE, token);
      }
      return json({ ok: true });
    }

    // POST /api/auth/magic-link (request single-use login link)
    if (url.pathname === "/api/auth/magic-link" && request.method === "POST") {
      try {
        const body = (await request.json()) as { email?: string; redirectTo?: string };
        const email = body.email?.toLowerCase().trim();
        if (!email) return json({ ok: false, error: "Email required" }, 400);

        const rl = await checkAuthRateLimit(env.CACHE, `magic:${clientIp}:${email}`, 5, 600);
        if (!rl.allowed) return json({ ok: false, error: "Too many requests" }, 429);

        const user = await env.DB.prepare(`SELECT id, email FROM users WHERE email = ?`)
          .bind(email)
          .first<{ id: string; email: string }>();

        if (user) {
          const token = await issueOneTimeToken(env.CACHE, "magic", { userId: user.id, email: user.email }, 900);
          const allowedOrigins = new Set(["https://sitetrackpro.in", "https://www.sitetrackpro.in", "http://localhost:5173"]);
          let origin = "https://sitetrackpro.in";
          if (body.redirectTo) {
            try {
              const parsedOrigin = new URL(body.redirectTo).origin;
              if (allowedOrigins.has(parsedOrigin)) origin = parsedOrigin;
            } catch { /* fallback to default */ }
          }
          const link = `${origin}/login?magic_token=${encodeURIComponent(token)}`;
          const sent = await sendTransactionalEmail(env, {
            to: user.email,
            subject: "Your SiteTrack Pro sign-in link",
            html: `<p>Click to sign in (valid for 15 minutes): <a href="${link}">${link}</a></p>`,
          });
          if (!sent.ok) {
            return json({ ok: false, error: sent.error || "Failed to send magic link" }, 503);
          }
        }
        return json({ ok: true, message: "If an account exists, a sign-in link has been sent." });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /api/auth/verify-magic-link
    if (url.pathname === "/api/auth/verify-magic-link" && request.method === "POST") {
      try {
        const body = (await request.json()) as { token?: string };
        if (!body.token) return json({ ok: false, error: "Token required" }, 400);

        const data = await consumeOneTimeToken<{ userId: string; email: string }>(env.CACHE, "magic", body.token);
        if (!data) return json({ ok: false, error: "Invalid or expired magic link" }, 401);

        const user = await env.DB.prepare(
          `SELECT id, email, full_name, is_platform_admin FROM users WHERE id = ?`
        )
          .bind(data.userId)
          .first<{ id: string; email: string; full_name: string; is_platform_admin: number }>();
        if (!user) return json({ ok: false, error: "User not found" }, 404);

        const orgs = await env.DB.prepare(
          `SELECT o.id, o.slug, o.name, o.plan, om.role, om.is_admin
           FROM organizations o
           JOIN org_members om ON om.org_id = o.id
           WHERE om.profile_id = ? AND om.status = 'active'`
        )
          .bind(user.id)
          .all();

        const primaryOrg = orgs.results?.[0] as { id: string; role: string } | undefined;
        const jwt = await signJwt(
          { sub: user.id, email: user.email, org_id: primaryOrg?.id || null, role: primaryOrg?.role || "user" },
          jwtSecret
        );
        return json({
          ok: true,
          user: { id: user.id, email: user.email, fullName: user.full_name },
          organizations: orgs.results || [],
          token: jwt,
        });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /api/auth/reset-password (request reset OR confirm with token + newPassword)
    if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
      try {
        const body = (await request.json()) as { email?: string; token?: string; newPassword?: string };
        if (body.token && body.newPassword) {
          if (body.newPassword.length < 8) {
            return json({ ok: false, error: "Password must be at least 8 characters" }, 400);
          }
          const data = await consumeOneTimeToken<{ userId: string }>(env.CACHE, "reset", body.token);
          if (!data) return json({ ok: false, error: "Invalid or expired reset token" }, 401);
          const pwdHash = await hashPassword(body.newPassword);
          await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(pwdHash, data.userId)
            .run();
          return json({ ok: true });
        }

        const email = body.email?.toLowerCase().trim();
        if (!email) return json({ ok: false, error: "Email required" }, 400);
        const rl = await checkAuthRateLimit(env.CACHE, `reset:${clientIp}:${email}`, 5, 600);
        if (!rl.allowed) return json({ ok: false, error: "Too many requests" }, 429);

        const user = await env.DB.prepare(`SELECT id, email FROM users WHERE email = ?`)
          .bind(email)
          .first<{ id: string; email: string }>();
        if (user) {
          const token = await issueOneTimeToken(env.CACHE, "reset", { userId: user.id }, 900);
          const link = `https://sitetrackpro.in/reset-password?token=${encodeURIComponent(token)}`;
          const sent = await sendTransactionalEmail(env, {
            to: user.email,
            subject: "Reset your SiteTrack Pro password",
            html: `<p>Reset your password (valid for 15 minutes): <a href="${link}">${link}</a></p>`,
          });
          if (!sent.ok) {
            return json({ ok: false, error: sent.error || "Failed to send reset email" }, 503);
          }
        }
        return json({ ok: true, message: "If an account exists, a password reset link has been sent." });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── PAYMENTS & WEBHOOKS (RAZORPAY) ───────────────────────────────────────

    // POST /api/payments/razorpay-link
    if (url.pathname === "/api/payments/razorpay-link" && request.method === "POST") {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return json({ ok: false, error: "authentication required" }, 401);
      }
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        return json({ ok: false, error: "Razorpay credentials not configured in Workers environment" }, 500);
      }

      const body = (await request.json()) as {
        amountInPaisa: number;
        description: string;
        customer?: { name?: string; email?: string; contact?: string };
        notes?: Record<string, string>;
        org_id?: string;
      };

      // Scoped payment link: caller may only mint links for their own org.
      if (body.org_id && body.org_id !== auth.org_id) {
        return json({ ok: false, error: "org scope mismatch" }, 403);
      }

      const result = await mintRazorpayPaymentLink({
        keyId: env.RAZORPAY_KEY_ID,
        secret: env.RAZORPAY_KEY_SECRET,
        amountInPaisa: body.amountInPaisa,
        description: body.description,
        customer: body.customer,
        notes: body.notes,
      });

      return json(result, result.ok ? 200 : 400);
    }

    // POST /api/webhooks/razorpay
    if (url.pathname === "/api/webhooks/razorpay" && request.method === "POST") {
      const rawBody = await request.text();
      const signature = request.headers.get("x-razorpay-signature") || "";
      const eventId = request.headers.get("x-razorpay-event-id") || "";
      const secret = env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET || "";

      if (!secret || !(await verifyRazorpaySignature({ rawBody, signature, secret }))) {
        return json({ ok: false, error: "Invalid signature" }, 401);
      }

      let parsed: RazorpayWebhookPayload;
      try {
        parsed = JSON.parse(rawBody) as RazorpayWebhookPayload;
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }

      const result = await new PaymentSettlementRepository(env.DB).settleWebhook(parsed, eventId);
      return json(result);
    }

    // POST /api/payments/razorpay-plan-link (ports razorpay-plan-link EF)
    if (url.pathname === "/api/payments/razorpay-plan-link" && request.method === "POST") {
      const auth = await authenticateRequest(request);
      if (!auth) return json({ ok: false, error: "authentication required" }, 401);
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        return json({ ok: false, error: "Razorpay credentials not configured in Workers environment" }, 500);
      }
      const orgId = request.headers.get("X-Org-Id") || auth.org_id;
      if (!orgId) return json({ ok: false, error: "org_id required" }, 400);

      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgId);
        if (!ctx.isAdmin) {
          return json({ ok: false, error: "Forbidden: Only organization admins can initiate plan upgrades." }, 403);
        }
        const body = (await request.json()) as { plan?: "basic" | "pro" | "business"; period?: "monthly" | "annual" };
        const plan = body.plan;
        const period = body.period || "monthly";
        if (!plan || !["basic", "pro", "business"].includes(plan)) {
          return json({ ok: false, error: "Valid plan (basic|pro|business) required" }, 400);
        }
        const amountPaise = await new PaymentSettlementRepository(env.DB).resolvePlanAmountPaise(plan, period);
        const ppId = `pp_${crypto.randomUUID()}`;
        const result = await mintRazorpayPaymentLink({
          keyId: env.RAZORPAY_KEY_ID,
          secret: env.RAZORPAY_KEY_SECRET,
          amountInPaisa: amountPaise,
          description: `SiteTrack Pro ${plan.toUpperCase()} (${period})`,
          customer: { email: ctx.email },
          notes: { sitetrack_plan_payment_id: ppId, org_id: ctx.orgId, plan, period },
        });
        if (!result.ok || !result.id) return json(result, 400);

        await new OrgAdminRepository(env.DB).recordPlanPayment(ctx, {
          id: ppId,
          plan,
          period,
          amountPaise,
          linkId: result.id,
        });
        return json({ ok: true, linkId: result.id, shortUrl: result.shortUrl });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /api/webhooks/resend (ports resend-webhook EF)
    if (url.pathname === "/api/webhooks/resend" && request.method === "POST") {
      try {
        const rawBody = await request.text();
        if (env.RESEND_WEBHOOK_SECRET) {
          const valid = await verifySvixSignature({
            msgId: request.headers.get("svix-id") || "",
            timestamp: request.headers.get("svix-timestamp") || "",
            signature: request.headers.get("svix-signature") || "",
            rawBody,
            secret: env.RESEND_WEBHOOK_SECRET,
          });
          if (!valid) {
            return json({ ok: false, error: "Invalid webhook signature" }, 401);
          }
        }
        const body = JSON.parse(rawBody) as {
          type?: string;
          data?: { email_id?: string; to?: string[]; subject?: string };
        };
        const rawType = body.type || "email.sent";
        const shortEvent = rawType.replace(/^email\./, "");
        await new OrgAdminRepository(env.DB).recordResendEvent({
          id: `rde_${crypto.randomUUID()}`,
          event: shortEvent,
          rawEvent: rawType,
          messageId: body.data?.email_id,
          toEmail: body.data?.to?.[0],
          subject: body.data?.subject,
          payload: body,
        });
        return json({ ok: true, received: true });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /api/public/signup-requests (ports submit_signup_request EF)
    if (url.pathname === "/api/public/signup-requests" && request.method === "POST") {
      try {
        const rl = await checkAuthRateLimit(env.CACHE, `signup:${clientIp}`, 5, 600);
        if (!rl.allowed) {
          return json({ ok: false, error: "Too many signup requests. Please try again later." }, 429);
        }
        const body = (await request.json()) as {
          firmName?: string;
          contactName?: string;
          email?: string;
          phone?: string;
          plan?: string;
          message?: string;
        };
        if (!body.firmName || !body.contactName || !body.email) {
          return json({ ok: false, error: "firmName, contactName, and email are required" }, 400);
        }
        const id = `sr_${crypto.randomUUID()}`;
        await new OrgAdminRepository(env.DB).submitSignupRequest({
          id,
          firmName: body.firmName,
          contactName: body.contactName,
          email: body.email,
          phone: body.phone,
          plan: body.plan,
          message: body.message,
        });
        return json({ ok: true, id }, 201);
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── STORAGE & MEDIA (CLOUDFLARE R2) ─────────────────────────────────────

    // POST /api/storage/upload
    if (url.pathname === "/api/storage/upload" && request.method === "POST") {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return json({ ok: false, error: "authentication required" }, 401);
      }
      const orgId = request.headers.get("X-Org-Id") || url.searchParams.get("org_id") || auth.org_id;
      if (!orgId) {
        return json({ ok: false, error: "org_id required" }, 400);
      }
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgId);
        const projectId = request.headers.get("x-project-id") || url.searchParams.get("project_id");
        if (projectId) {
          await assertProjectOwnerOrg(env.DB, ctx, projectId, "Forbidden: Only the owner organization can upload project files.");
        }

        const contentType = request.headers.get("content-type") || "application/octet-stream";
        const filename = request.headers.get("x-filename") || `file_${crypto.randomUUID()}`;
        if (/(\.\.|\\|%2f|%2F)/i.test(filename)) {
          return json({ ok: false, error: "invalid filename" }, 400);
        }
        const arrayBuffer = await request.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
          return json({ ok: false, error: "Payload too large (max 25 MB)" }, 413);
        }

        const folder = request.headers.get("x-folder") || "uploads";
        const key = buildTenantStorageKey({
          orgId: ctx.orgId,
          projectId,
          folder,
          filename,
        });

        const uploaded = await uploadToR2({
          bucket: env.STORAGE,
          key,
          data: arrayBuffer,
          contentType,
          metadata: {
            org_id: ctx.orgId,
            ...(projectId ? { project_id: projectId } : {}),
            uploaded_by: ctx.userId,
          },
        });

        return json({
          ok: true,
          key: uploaded.key,
          size: uploaded.size,
          url: `/api/storage/files/${uploaded.key}`,
        });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /api/storage/files/*
    if (url.pathname.startsWith("/api/storage/files/") && request.method === "GET") {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return json({ ok: false, error: "authentication required" }, 401);
      }
      const orgId = request.headers.get("X-Org-Id") || url.searchParams.get("org_id") || auth.org_id;
      if (!orgId) {
        return json({ ok: false, error: "org_id required" }, 400);
      }
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgId);
        let key: string;
        try {
          key = decodeURIComponent(url.pathname.replace(/^\/api\/storage\/files\//, ""));
        } catch {
          return json({ ok: false, error: "Invalid storage key encoding" }, 400);
        }
        await assertStorageReadAccess(env.DB, ctx, key);
        const file = await getFromR2(env.STORAGE, key);

        if (!file) {
          return json({ ok: false, error: "File not found" }, 404);
        }

        return new Response(file.body, {
          headers: {
            "Content-Type": file.contentType,
            "Content-Length": String(file.size),
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // DELETE /api/storage/files/*
    if (url.pathname.startsWith("/api/storage/files/") && request.method === "DELETE") {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return json({ ok: false, error: "authentication required" }, 401);
      }
      const orgId = request.headers.get("X-Org-Id") || url.searchParams.get("org_id") || auth.org_id;
      if (!orgId) {
        return json({ ok: false, error: "org_id required" }, 400);
      }
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgId);
        const key = decodeURIComponent(url.pathname.replace(/^\/api\/storage\/files\//, ""));
        await assertStorageDeleteAccess(env.DB, ctx, key);
        await deleteFromR2(env.STORAGE, key);
        return json({ ok: true, deleted: key });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── TENANT-SCOPED DOMAIN ROUTES (PROJECTS, SITE OPS, FINANCE) ────────────

    async function requireTenantContext(): Promise<{ ctx: SecurityContext } | { errorResponse: Response }> {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return { errorResponse: json({ ok: false, error: "authentication required" }, 401) };
      }
      const orgId = request.headers.get("X-Org-Id") || url.searchParams.get("org_id") || auth.org_id;
      if (!orgId) {
        return { errorResponse: json({ ok: false, error: "org_id required" }, 400) };
      }
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgId);
        return { ctx };
      } catch (err) {
        if (err instanceof TenantSecurityError) {
          return { errorResponse: json({ ok: false, error: err.message }, 403) };
        }
        throw err;
      }
    }

    // GET /api/projects & POST /api/projects
    if (url.pathname === "/api/projects") {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const repo = new ProjectRepository(env.DB);

      if (request.method === "GET") {
        const projects = await repo.listProjects(resolved.ctx);
        return json({ ok: true, projects });
      }
      if (request.method === "POST") {
        try {
          assertWriteRole(resolved.ctx);
          const body = (await request.json()) as { name?: string; type?: string; budget?: number };
          if (!body.name) return json({ ok: false, error: "name is required" }, 400);
          const id = `prj_${crypto.randomUUID()}`;
          await repo.createProject(resolved.ctx, { id, name: body.name, type: body.type || "construction", budget: body.budget });
          return json({ ok: true, id }, 201);
        } catch (err) {
          if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }
    }

    // GET /api/vendors & POST /api/vendors
    if (url.pathname === "/api/vendors") {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const procurement = new ProcurementAndDesignRepository(env.DB);
      if (request.method === "GET") {
        return json({ ok: true, vendors: await procurement.listVendors(resolved.ctx) });
      }
      if (request.method === "POST") {
        try {
          assertWriteRole(resolved.ctx);
          const body = (await request.json()) as {
            name?: string;
            contactPerson?: string;
            phone?: string;
            email?: string;
            gstin?: string;
            category?: string;
          };
          if (!body.name) return json({ ok: false, error: "name is required" }, 400);
          const id = `vnd_${crypto.randomUUID()}`;
          await procurement.createVendor(resolved.ctx, { id, name: body.name, ...body });
          return json({ ok: true, id }, 201);
        } catch (err) {
          if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
        }
      }
    }

    // GET /api/notifications & PATCH /api/notifications/:id/read
    if (url.pathname === "/api/notifications" && request.method === "GET") {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const procurement = new ProcurementAndDesignRepository(env.DB);
      return json({ ok: true, notifications: await procurement.listNotifications(resolved.ctx) });
    }
    const notifReadMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && request.method === "PATCH") {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const procurement = new ProcurementAndDesignRepository(env.DB);
      const ok = await procurement.markNotificationRead(resolved.ctx, notifReadMatch[1]);
      if (!ok) return json({ ok: false, error: "Notification not found" }, 404);
      return json({ ok: true, id: notifReadMatch[1], read: true });
    }

    // GET/POST /api/drawings/:drawingId/comments & PATCH /api/drawings/:drawingId/comments/:commentId
    const drawingCommentsMatch = url.pathname.match(/^\/api\/drawings\/([^/]+)\/comments(?:\/([^/]+))?$/);
    if (drawingCommentsMatch) {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const [, drawingId, commentId] = drawingCommentsMatch;
      const crmAndPortal = new CrmAndPortalRepository(env.DB);
      try {
        if (!commentId && request.method === "GET") {
          return json({ ok: true, comments: await crmAndPortal.listDrawingComments(resolved.ctx, drawingId) });
        }
        if (!commentId && request.method === "POST") {
          const body = (await request.json()) as {
            parentId?: string;
            x?: number;
            y?: number;
            body?: string;
            status?: "open" | "in_progress" | "resolved" | "closed";
          };
          if (!body.body) return json({ ok: false, error: "body is required" }, 400);
          const id = `dcm_${crypto.randomUUID()}`;
          await crmAndPortal.createDrawingComment(resolved.ctx, drawingId, {
            id,
            parentId: body.parentId,
            x: body.x,
            y: body.y,
            body: body.body,
            status: body.status,
          });
          return json({ ok: true, id }, 201);
        }
        if (commentId && request.method === "PATCH") {
          const body = (await request.json()) as {
            body?: string;
            status?: "open" | "in_progress" | "resolved" | "closed";
          };
          const updated = await crmAndPortal.updateDrawingComment(resolved.ctx, drawingId, commentId, body);
          if (!updated) return json({ ok: false, error: "Drawing comment not found" }, 404);
          return json({ ok: true, id: commentId });
        }
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET/POST /api/crm/leads
    if (url.pathname === "/api/crm/leads") {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const crmAndPortal = new CrmAndPortalRepository(env.DB);
      try {
        if (request.method === "GET") {
          const stage = url.searchParams.get("stage") || undefined;
          return json({ ok: true, leads: await crmAndPortal.listLeads(resolved.ctx, stage) });
        }
        if (request.method === "POST") {
          const body = (await request.json()) as {
            name?: string;
            company?: string;
            phone?: string;
            email?: string;
            source?: string;
            budget?: number;
            stage?: string;
            notes?: string;
            ownerId?: string;
          };
          if (!body.name) return json({ ok: false, error: "name is required" }, 400);
          const id = `led_${crypto.randomUUID()}`;
          await crmAndPortal.createLead(resolved.ctx, {
            id,
            name: body.name,
            company: body.company,
            phone: body.phone,
            email: body.email,
            source: body.source,
            budget: body.budget,
            stage: body.stage,
            notes: body.notes,
            ownerId: body.ownerId,
          });
          return json({ ok: true, id }, 201);
        }
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // PATCH /api/crm/leads/:leadId
    const crmLeadMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)$/);
    if (crmLeadMatch && request.method === "PATCH") {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const crmAndPortal = new CrmAndPortalRepository(env.DB);
      try {
        const body = (await request.json()) as {
          name?: string;
          company?: string | null;
          phone?: string | null;
          email?: string | null;
          source?: string | null;
          budget?: number | null;
          stage?: string;
          notes?: string | null;
          ownerId?: string | null;
          wonAmount?: number | null;
          lostReason?: string | null;
        };
        const updated = await crmAndPortal.updateLead(resolved.ctx, crmLeadMatch[1], body);
        if (!updated) return json({ ok: false, error: "Lead not found" }, 404);
        return json({ ok: true, id: crmLeadMatch[1] });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET/POST /api/crm/leads/:leadId/quotations & PATCH /api/crm/leads/:leadId/quotations/:quotationId
    const crmQuotationsMatch = url.pathname.match(/^\/api\/crm\/leads\/([^/]+)\/quotations(?:\/([^/]+))?$/);
    if (crmQuotationsMatch) {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const [, leadId, quotationId] = crmQuotationsMatch;
      const crmAndPortal = new CrmAndPortalRepository(env.DB);
      try {
        if (!quotationId && request.method === "GET") {
          return json({ ok: true, quotations: await crmAndPortal.listLeadQuotations(resolved.ctx, leadId) });
        }
        if (!quotationId && request.method === "POST") {
          const body = (await request.json()) as {
            amount?: number;
            status?: string;
            validUntil?: string;
          };
          if (typeof body.amount !== "number") return json({ ok: false, error: "amount is required" }, 400);
          const id = `qtn_${crypto.randomUUID()}`;
          await crmAndPortal.createLeadQuotation(resolved.ctx, leadId, {
            id,
            amount: body.amount,
            status: body.status,
            validUntil: body.validUntil,
          });
          return json({ ok: true, id }, 201);
        }
        if (quotationId && request.method === "PATCH") {
          const body = (await request.json()) as {
            amount?: number;
            status?: string;
            validUntil?: string | null;
          };
          const updated = await crmAndPortal.updateLeadQuotation(resolved.ctx, leadId, quotationId, body);
          if (!updated) return json({ ok: false, error: "Quotation not found" }, 404);
          return json({ ok: true, id: quotationId });
        }
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /api/orgs/:orgId/members
    const orgMembersMatch = url.pathname.match(/^\/api\/orgs\/([^/]+)\/members$/);
    if (orgMembersMatch && request.method === "GET") {
      const auth = await authenticateRequest(request);
      if (!auth) return json({ ok: false, error: "authentication required" }, 401);
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgMembersMatch[1]);
        const { results } = await env.DB.prepare(
          `SELECT om.org_id, om.profile_id, om.role, om.is_admin, om.status, u.email, u.full_name
           FROM org_members om
           JOIN users u ON u.id = om.profile_id
           WHERE om.org_id = ? AND om.status != 'removed'
           ORDER BY om.is_admin DESC, u.full_name ASC`
        )
          .bind(ctx.orgId)
          .all();
        return json({ ok: true, members: results || [] });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // POST /api/orgs/:orgId/invitations (ports invite_org_member EF)
    const orgInviteMatch = url.pathname.match(/^\/api\/orgs\/([^/]+)\/invitations$/);
    if (orgInviteMatch && request.method === "POST") {
      const auth = await authenticateRequest(request);
      if (!auth) return json({ ok: false, error: "authentication required" }, 401);
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgInviteMatch[1]);
        const body = (await request.json()) as { email?: string; role?: string };
        if (!body.email || !body.role) return json({ ok: false, error: "email and role are required" }, 400);
        const id = `invt_${crypto.randomUUID()}`;
        const token = crypto.randomUUID().replace(/-/g, "");
        await new OrgAdminRepository(env.DB).inviteOrgMember(ctx, { id, email: body.email, role: body.role, token });
        return json({ ok: true, id, token }, 201);
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // DELETE /api/orgs/:orgId/members/:profileId (ports remove_org_member EF)
    const orgMemberRemoveMatch = url.pathname.match(/^\/api\/orgs\/([^/]+)\/members\/([^/]+)$/);
    if (orgMemberRemoveMatch && request.method === "DELETE") {
      const auth = await authenticateRequest(request);
      if (!auth) return json({ ok: false, error: "authentication required" }, 401);
      try {
        const ctx = await assertTenantContext(env.DB, auth.sub, orgMemberRemoveMatch[1]);
        const removed = await new OrgAdminRepository(env.DB).removeOrgMember(ctx, orgMemberRemoveMatch[2]);
        if (!removed) return json({ ok: false, error: "Member not found" }, 404);
        return json({ ok: true, removed: orgMemberRemoveMatch[2] });
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // Project-scoped routes: /api/projects/:projectId[/subresource[/id]]
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?$/);
    if (projectMatch) {
      const resolved = await requireTenantContext();
      if ("errorResponse" in resolved) return resolved.errorResponse;
      const ctx = resolved.ctx;
      const [, projectId, subresource, itemId] = projectMatch;

      try {
        const projectRepo = new ProjectRepository(env.DB);
        const siteOps = new SiteOpsRepository(env.DB);
        const finance = new FinanceRepository(env.DB);
        const procurement = new ProcurementAndDesignRepository(env.DB);
        const taskAndMilestone = new TaskAndMilestoneRepository(env.DB);
        const siteOpsExtended = new SiteOpsExtendedRepository(env.DB);
        const crmAndPortal = new CrmAndPortalRepository(env.DB);

        if (!subresource && request.method === "GET") {
          const project = await projectRepo.getProjectById(ctx, projectId);
          if (!project) return json({ ok: false, error: "Project not found" }, 404);
          return json({ ok: true, project });
        }

        if (subresource === "tasks") {
          if (request.method === "GET") {
            return json({ ok: true, tasks: await taskAndMilestone.listTasks(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              title?: string;
              description?: string;
              milestoneId?: string;
              assigneeId?: string;
              priority?: "low" | "medium" | "high" | "critical";
              dueDate?: string;
            };
            if (!body.title) return json({ ok: false, error: "title is required" }, 400);
            const id = `tsk_${crypto.randomUUID()}`;
            await taskAndMilestone.createTask(ctx, projectId, {
              id,
              title: body.title,
              description: body.description,
              milestoneId: body.milestoneId,
              assigneeId: body.assigneeId,
              priority: body.priority,
              dueDate: body.dueDate,
            });
            return json({ ok: true, id }, 201);
          }
          if (request.method === "PATCH" && itemId) {
            const body = (await request.json()) as { status?: "todo" | "in_progress" | "review" | "done" };
            if (!body.status) return json({ ok: false, error: "status is required" }, 400);
            const updated = await taskAndMilestone.updateTaskStatus(ctx, projectId, itemId, body.status);
            if (!updated) return json({ ok: false, error: "Task not found" }, 404);
            return json({ ok: true, id: itemId, status: body.status });
          }
        }

        if (subresource === "milestones") {
          if (request.method === "GET") {
            return json({ ok: true, milestones: await taskAndMilestone.listMilestones(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              title?: string;
              description?: string;
              dueDate?: string;
              weight?: number;
              orderIndex?: number;
            };
            if (!body.title) return json({ ok: false, error: "title is required" }, 400);
            const id = `mst_${crypto.randomUUID()}`;
            await taskAndMilestone.createMilestone(ctx, projectId, {
              id,
              title: body.title,
              description: body.description,
              dueDate: body.dueDate,
              weight: body.weight,
              orderIndex: body.orderIndex,
            });
            return json({ ok: true, id }, 201);
          }
          if (request.method === "PATCH" && itemId) {
            const body = (await request.json()) as { status?: "pending" | "in_progress" | "completed" | "blocked" };
            if (!body.status) return json({ ok: false, error: "status is required" }, 400);
            const updated = await taskAndMilestone.updateMilestoneStatus(ctx, projectId, itemId, body.status);
            if (!updated) return json({ ok: false, error: "Milestone not found" }, 404);
            return json({ ok: true, id: itemId, status: body.status });
          }
        }

        if (subresource === "risk-signals" && request.method === "GET") {
          const signals = await taskAndMilestone.listRiskSignals(ctx, projectId);
          return json({ ok: true, signals, riskSignals: signals });
        }

        if (subresource === "material-requests") {
          if (request.method === "GET") {
            return json({ ok: true, materialRequests: await siteOpsExtended.listMaterialRequests(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              item?: string;
              unit?: string;
              qty?: number;
              needDate?: string;
              reason?: string;
              notes?: string;
            };
            if (!body.item || typeof body.qty !== "number") {
              return json({ ok: false, error: "item and qty are required" }, 400);
            }
            const id = `mrq_${crypto.randomUUID()}`;
            await siteOpsExtended.createMaterialRequest(ctx, projectId, {
              id,
              item: body.item,
              unit: body.unit,
              qty: body.qty,
              needDate: body.needDate,
              reason: body.reason,
              notes: body.notes,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "safety") {
          if (request.method === "GET") {
            return json({ ok: true, incidents: await siteOpsExtended.listSafetyIncidents(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              description?: string;
              severity?: "near_miss" | "first_aid" | "minor" | "major" | "fatal";
              category?: string;
              location?: string;
              actionTaken?: string;
              incidentDate?: string;
            };
            if (!body.description || !body.severity) {
              return json({ ok: false, error: "description and severity are required" }, 400);
            }
            const id = `saf_${crypto.randomUUID()}`;
            await siteOpsExtended.createSafetyIncident(ctx, projectId, {
              id,
              description: body.description,
              severity: body.severity,
              category: body.category,
              location: body.location,
              actionTaken: body.actionTaken,
              incidentDate: body.incidentDate,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "inspections") {
          if (request.method === "GET") {
            return json({ ok: true, inspections: await siteOpsExtended.listInspections(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              type?: string;
              scope?: string;
              scheduledDate?: string;
              inspectorName?: string;
              observations?: string;
            };
            if (!body.type) return json({ ok: false, error: "type is required" }, 400);
            const id = `ins_${crypto.randomUUID()}`;
            await siteOpsExtended.createInspection(ctx, projectId, {
              id,
              type: body.type,
              scope: body.scope,
              scheduledDate: body.scheduledDate,
              inspectorName: body.inspectorName,
              observations: body.observations,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "punch") {
          if (request.method === "GET") {
            return json({ ok: true, punchItems: await siteOpsExtended.listPunchItems(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              location?: string;
              defect?: string;
              trade?: string;
              severity?: string;
              unitId?: string;
              assignedTo?: string;
              dueDate?: string;
            };
            if (!body.location || !body.defect) {
              return json({ ok: false, error: "location and defect are required" }, 400);
            }
            const id = `pnc_${crypto.randomUUID()}`;
            await siteOpsExtended.createPunchItem(ctx, projectId, {
              id,
              location: body.location,
              defect: body.defect,
              trade: body.trade,
              severity: body.severity,
              unitId: body.unitId,
              assignedTo: body.assignedTo,
              dueDate: body.dueDate,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "measurement-book") {
          if (request.method === "GET") {
            return json({ ok: true, entries: await siteOpsExtended.listMeasurementBook(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              mbNo?: string;
              pageNo?: number;
              boqItemId?: string;
              description?: string;
              location?: string;
              blockId?: string;
              floorId?: string;
              unit?: string;
              length?: number;
              breadth?: number;
              depth?: number;
              qty?: number;
              rate?: number;
              notes?: string;
            };
            if (!body.mbNo || !body.description || typeof body.qty !== "number") {
              return json({ ok: false, error: "mbNo, description, and qty are required" }, 400);
            }
            const id = `mb_${crypto.randomUUID()}`;
            await siteOpsExtended.createMeasurementBookEntry(ctx, projectId, {
              id,
              mbNo: body.mbNo,
              pageNo: body.pageNo,
              boqItemId: body.boqItemId,
              description: body.description,
              location: body.location,
              blockId: body.blockId,
              floorId: body.floorId,
              unit: body.unit,
              length: body.length,
              breadth: body.breadth,
              depth: body.depth,
              qty: body.qty,
              rate: body.rate,
              notes: body.notes,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "share-links") {
          if (request.method === "GET") {
            return json({ ok: true, shareLinks: await crmAndPortal.listShareLinks(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              token?: string;
              label?: string;
              passwordHash?: string;
              expiresAt?: string;
              allowDownload?: boolean;
              maxViews?: number;
            };
            const id = `shl_${crypto.randomUUID()}`;
            const token = body.token || crypto.randomUUID().replace(/-/g, "");
            await crmAndPortal.createShareLink(ctx, projectId, {
              id,
              token,
              label: body.label,
              passwordHash: body.passwordHash,
              expiresAt: body.expiresAt,
              allowDownload: body.allowDownload,
              maxViews: body.maxViews,
            });
            return json({ ok: true, id, token }, 201);
          }
          if (request.method === "PATCH" && itemId) {
            const body = (await request.json()) as {
              label?: string | null;
              expiresAt?: string | null;
              allowDownload?: boolean;
              maxViews?: number | null;
              revokedAt?: string | null;
            };
            const updated = await crmAndPortal.updateShareLink(ctx, projectId, itemId, body);
            if (!updated) return json({ ok: false, error: "Share link not found" }, 404);
            return json({ ok: true, id: itemId });
          }
        }

        if (subresource === "handover-signatures") {
          if (request.method === "GET") {
            return json({ ok: true, signatures: await crmAndPortal.listHandoverSignatures(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { signatureData?: string };
            if (!body.signatureData) return json({ ok: false, error: "signatureData is required" }, 400);
            const id = `hnd_${crypto.randomUUID()}`;
            await crmAndPortal.createHandoverSignature(ctx, projectId, { id, signatureData: body.signatureData });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "dpr") {
          if (request.method === "GET") {
            return json({ ok: true, dprs: await siteOps.listDprMessages(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { transcriptText?: string; voiceAudioUrl?: string; photoLat?: number; photoLon?: number };
            const id = `dpr_${crypto.randomUUID()}`;
            await siteOps.createDprMessage(ctx, projectId, { id, ...body });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "invoices") {
          if (request.method === "GET") {
            return json({ ok: true, invoices: await finance.listInvoices(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              invoiceNumber?: string;
              issueDate?: string;
              dueDate?: string;
              subtotal?: number;
              gstRate?: number;
              tdsRate?: number;
            };
            if (!body.invoiceNumber || !body.issueDate || typeof body.subtotal !== "number") {
              return json({ ok: false, error: "invoiceNumber, issueDate, and subtotal are required" }, 400);
            }
            const id = `inv_${crypto.randomUUID()}`;
            await finance.createInvoice(ctx, projectId, {
              id,
              invoiceNumber: body.invoiceNumber,
              issueDate: body.issueDate,
              dueDate: body.dueDate,
              subtotal: body.subtotal,
              gstRate: body.gstRate,
              tdsRate: body.tdsRate,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "expenses") {
          if (request.method === "GET") {
            return json({ ok: true, expenses: await finance.listExpenses(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              category?: string;
              description?: string;
              amount?: number;
              gst?: number;
              paidTo?: string;
              paidVia?: string;
              refNo?: string;
              expenseDate?: string;
            };
            if (!body.category || !body.description || typeof body.amount !== "number") {
              return json({ ok: false, error: "category, description, and amount are required" }, 400);
            }
            const id = `exp_${crypto.randomUUID()}`;
            await finance.createExpense(ctx, projectId, {
              id,
              category: body.category,
              description: body.description,
              amount: body.amount,
              gst: body.gst,
              paidTo: body.paidTo,
              paidVia: body.paidVia,
              refNo: body.refNo,
              expenseDate: body.expenseDate,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "purchase-orders") {
          if (request.method === "GET") {
            return json({ ok: true, purchaseOrders: await procurement.listPurchaseOrders(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { vendorId?: string; poNumber?: string; totalAmount?: number; taxAmount?: number };
            if (!body.vendorId || !body.poNumber || typeof body.totalAmount !== "number") {
              return json({ ok: false, error: "vendorId, poNumber, and totalAmount are required" }, 400);
            }
            const id = `po_${crypto.randomUUID()}`;
            await procurement.createPurchaseOrder(ctx, projectId, {
              id,
              vendorId: body.vendorId,
              poNumber: body.poNumber,
              totalAmount: body.totalAmount,
              taxAmount: body.taxAmount,
            });
            return json({ ok: true, id }, 201);
          }
        }

        if (subresource === "drawings") {
          if (request.method === "GET") {
            return json({ ok: true, drawings: await procurement.listDrawings(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              title?: string;
              discipline?: string;
              drawingNumber?: string;
              currentFileKey?: string;
              fileFormat?: string;
              status?: string;
            };
            if (!body.title || !body.drawingNumber || !body.currentFileKey) {
              return json({ ok: false, error: "title, drawingNumber, and currentFileKey are required" }, 400);
            }
            const id = `drw_${crypto.randomUUID()}`;
            await procurement.createDrawing(ctx, projectId, {
              id,
              title: body.title,
              discipline: body.discipline,
              drawingNumber: body.drawingNumber,
              currentFileKey: body.currentFileKey,
              fileFormat: body.fileFormat,
              status: body.status,
            });
            return json({ ok: true, id }, 201);
          }
        }
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── PHASE 7 OPERATIONS ROUTES (BOQ, INVENTORY, LABOUR, ATTENDANCE, CHAT) ─

    if (
      url.pathname.startsWith("/api/chat/") ||
      /^\/api\/projects\/[^/]+\/(boq|inventory|labour|attendance)(\/|$)/.test(url.pathname)
    ) {
      const tenant = await requireTenantContext();
      if ("errorResponse" in tenant) return tenant.errorResponse;
      const { ctx } = tenant;
      const ops7 = new Phase7OperationsRepository(env.DB);

      try {
        if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
          assertWriteRole(ctx);
        }
        if (url.pathname === "/api/chat/channels") {
          if (request.method === "GET") {
            return json({ ok: true, channels: await ops7.listChatChannels(ctx) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { name?: string; description?: string };
            if (!body.name) return json({ ok: false, error: "name required" }, 400);
            const created = await ops7.createChatChannel(ctx, {
              id: `ch_${crypto.randomUUID()}`,
              name: body.name,
              description: body.description,
            });
            return json({ ok: true, ...created }, 201);
          }
        }

        const chatMsgMatch = url.pathname.match(/^\/api\/chat\/channels\/([^/]+)\/messages$/);
        if (chatMsgMatch) {
          const channelId = chatMsgMatch[1];
          if (request.method === "GET") {
            return json({ ok: true, messages: await ops7.listChatMessages(ctx, channelId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { body?: string; parentId?: string; senderName?: string; mentions?: string[] };
            if (!body.body) return json({ ok: false, error: "body required" }, 400);
            const posted = await ops7.postChatMessage(ctx, channelId, {
              id: `msg_${crypto.randomUUID()}`,
              body: body.body,
              parentId: body.parentId,
              senderName: body.senderName,
              mentions: body.mentions,
            });
            return json({ ok: true, ...posted }, 201);
          }
        }

        const boqMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/boq(?:\/([^/]+))?$/);
        if (boqMatch) {
          const [, projectId, itemId] = boqMatch;
          if (!itemId && request.method === "GET") {
            return json({ ok: true, items: await ops7.listBoqItems(ctx, projectId) });
          }
          if (!itemId && request.method === "POST") {
            const body = (await request.json()) as { itemCode?: string; itemName?: string; unit?: string; qty?: number; rate?: number; status?: BoqStatus };
            if (!body.itemName || body.qty === undefined || body.rate === undefined) {
              return json({ ok: false, error: "itemName, qty, and rate required" }, 400);
            }
            const created = await ops7.createBoqItem(ctx, projectId, {
              id: `boq_${crypto.randomUUID()}`,
              itemCode: body.itemCode,
              itemName: body.itemName,
              unit: body.unit,
              qty: Number(body.qty),
              rate: Number(body.rate),
              status: body.status,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (itemId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: BoqStatus };
            if (!body.status) return json({ ok: false, error: "status required" }, 400);
            const updated = await ops7.updateBoqItemStatus(ctx, projectId, itemId, body.status);
            return json({ ok: true, updated });
          }
        }

        const invMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/inventory$/);
        if (invMatch) {
          const projectId = invMatch[1];
          if (request.method === "GET") {
            return json({ ok: true, transactions: await ops7.listInventoryTransactions(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              txnDate?: string;
              material?: string;
              unit?: string;
              qty?: number;
              direction?: InventoryDirection;
              source?: string;
              refNo?: string;
              poId?: string;
              notes?: string;
            };
            if (!body.material || !body.qty || !body.direction) {
              return json({ ok: false, error: "material, qty, and direction required" }, 400);
            }
            const created = await ops7.recordInventoryTransaction(ctx, projectId, {
              id: `invtx_${crypto.randomUUID()}`,
              txnDate: body.txnDate,
              material: body.material,
              unit: body.unit,
              qty: Number(body.qty),
              direction: body.direction,
              source: body.source,
              refNo: body.refNo,
              poId: body.poId,
              notes: body.notes,
            });
            return json({ ok: true, ...created }, 201);
          }
        }

        const labMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/labour$/);
        if (labMatch) {
          const projectId = labMatch[1];
          if (request.method === "GET") {
            return json({ ok: true, workers: await ops7.listLabourRegister(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { name?: string; trade?: string; wage?: number; joined?: string };
            if (!body.name) return json({ ok: false, error: "name required" }, 400);
            const created = await ops7.createLabourWorker(ctx, projectId, {
              id: `lab_${crypto.randomUUID()}`,
              name: body.name,
              trade: body.trade,
              wage: body.wage,
              joined: body.joined,
            });
            return json({ ok: true, ...created }, 201);
          }
        }

        const attMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/attendance$/);
        if (attMatch) {
          const projectId = attMatch[1];
          if (request.method === "GET") {
            const date = url.searchParams.get("date") || undefined;
            return json({ ok: true, records: await ops7.listAttendance(ctx, projectId, date) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              attendeeKind?: AttendanceKind;
              labourId?: string;
              profileId?: string;
              attendeeName?: string;
              date?: string;
              status?: AttendanceStatus;
              inTime?: string;
              outTime?: string;
              hours?: number;
              source?: string;
            };
            if (!body.attendeeKind || !body.attendeeName) {
              return json({ ok: false, error: "attendeeKind and attendeeName required" }, 400);
            }
            const created = await ops7.recordAttendance(ctx, projectId, {
              id: `att_${crypto.randomUUID()}`,
              attendeeKind: body.attendeeKind,
              labourId: body.labourId,
              profileId: body.profileId,
              attendeeName: body.attendeeName,
              date: body.date,
              status: body.status,
              inTime: body.inTime,
              outTime: body.outTime,
              hours: body.hours,
              source: body.source,
            });
            return json({ ok: true, ...created }, 201);
          }
        }
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // ── PHASE 8 SITE CONTROLS ROUTES (RFI, CHANGE ORDERS, RA BILLS) ─────────

    if (
      url.pathname === "/api/delegations" ||
      /^\/api\/delegations\/[^/]+\/revoke$/.test(url.pathname) ||
      /^\/api\/access-requests\/[^/]+\/(approve|reject)$/.test(url.pathname) ||
      url.pathname === "/api/dpr" ||
      /^\/api\/dpr\/[^/]+(\/delivery-log)?$/.test(url.pathname) ||
      /^\/api\/projects\/[^/]+\/(rfi|change-orders|ra-bills|corrective-actions|shifts|issues|time-entries|deliverables|members|access-requests)(\/|$)/.test(url.pathname)
    ) {
      const tenant = await requireTenantContext();
      if ("errorResponse" in tenant) return tenant.errorResponse;
      const { ctx } = tenant;
      const sc8 = new Phase8SiteControlsRepository(env.DB);

      try {
        const isAccessRequestPost =
          request.method === "POST" &&
          /^\/api\/projects\/[^/]+\/access-requests$/.test(url.pathname);
        if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS" && !isAccessRequestPost) {
          assertWriteRole(ctx);
        }

        if (url.pathname === "/api/delegations") {
          if (request.method === "GET") {
            return json({ ok: true, delegations: await sc8.listDelegations(ctx) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { toUser?: string; resource?: string; startAt?: string; endAt?: string; reason?: string };
            if (!body.toUser || !body.resource || !body.startAt || !body.endAt) {
              return json({ ok: false, error: "toUser, resource, startAt, and endAt required" }, 400);
            }
            const created = await sc8.createDelegation(ctx, {
              id: `dlg_${crypto.randomUUID()}`,
              toUser: body.toUser,
              resource: body.resource,
              startAt: body.startAt,
              endAt: body.endAt,
              reason: body.reason,
            });
            return json({ ok: true, ...created }, 201);
          }
        }

        const dlgRevokeMatch = url.pathname.match(/^\/api\/delegations\/([^/]+)\/revoke$/);
        if (dlgRevokeMatch && request.method === "POST") {
          const revoked = await sc8.revokeDelegation(ctx, dlgRevokeMatch[1]);
          return json({ ok: true, revoked });
        }

        const rfiMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/rfi(?:\/([^/]+))?$/);
        if (rfiMatch) {
          const [, projectId, rfiId] = rfiMatch;
          if (!rfiId && request.method === "GET") {
            return json({ ok: true, rfis: await sc8.listRfis(ctx, projectId) });
          }
          if (!rfiId && request.method === "POST") {
            const body = (await request.json()) as { no?: string; subject?: string; question?: string; category?: string; dueDate?: string };
            if (!body.no || !body.subject || !body.question) {
              return json({ ok: false, error: "no, subject, and question required" }, 400);
            }
            const created = await sc8.createRfi(ctx, projectId, {
              id: `rfi_${crypto.randomUUID()}`,
              no: body.no,
              subject: body.subject,
              question: body.question,
              category: body.category,
              dueDate: body.dueDate,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (rfiId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: RfiStatus; response?: string };
            const updated = await sc8.updateRfi(ctx, projectId, rfiId, body);
            return json({ ok: true, updated });
          }
        }

        const coMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/change-orders(?:\/([^/]+))?$/);
        if (coMatch) {
          const [, projectId, coId] = coMatch;
          if (!coId && request.method === "GET") {
            return json({ ok: true, changeOrders: await sc8.listChangeOrders(ctx, projectId) });
          }
          if (!coId && request.method === "POST") {
            const body = (await request.json()) as { no?: string; description?: string; scopeChange?: string; costImpact?: number; scheduleImpact?: number; reason?: string };
            if (!body.no || !body.description) {
              return json({ ok: false, error: "no and description required" }, 400);
            }
            const created = await sc8.createChangeOrder(ctx, projectId, {
              id: `co_${crypto.randomUUID()}`,
              no: body.no,
              description: body.description,
              scopeChange: body.scopeChange,
              costImpact: body.costImpact,
              scheduleImpact: body.scheduleImpact,
              reason: body.reason,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (coId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: ChangeOrderStatus };
            if (!body.status) return json({ ok: false, error: "status required" }, 400);
            const updated = await sc8.updateChangeOrderStatus(ctx, projectId, coId, body.status);
            return json({ ok: true, updated });
          }
        }

        const raMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/ra-bills(?:\/([^/]+))?$/);
        if (raMatch) {
          const [, projectId, billId] = raMatch;
          if (!billId && request.method === "GET") {
            return json({ ok: true, raBills: await sc8.listRaBills(ctx, projectId) });
          }
          if (!billId && request.method === "POST") {
            const body = (await request.json()) as { no?: string; subcontractor?: string; scope?: string; billAmount?: number; cumulative?: number; retentionPct?: number; billDate?: string };
            if (!body.no || typeof body.billAmount !== "number") {
              return json({ ok: false, error: "no and billAmount required" }, 400);
            }
            const created = await sc8.createRaBill(ctx, projectId, {
              id: `ra_${crypto.randomUUID()}`,
              no: body.no,
              subcontractor: body.subcontractor,
              scope: body.scope,
              billAmount: body.billAmount,
              cumulative: body.cumulative,
              retentionPct: body.retentionPct,
              billDate: body.billDate,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (billId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: RaBillStatus; paidAmount?: number };
            if (!body.status) return json({ ok: false, error: "status required" }, 400);
            const updated = await sc8.updateRaBillStatus(ctx, projectId, billId, {
              status: body.status,
              paidAmount: body.paidAmount,
            });
            return json({ ok: true, updated });
          }
        }

        const caMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/corrective-actions(?:\/([^/]+))?$/);
        if (caMatch) {
          const [, projectId, actionId] = caMatch;
          if (!actionId && request.method === "GET") {
            return json({ ok: true, actions: await sc8.listCorrectiveActions(ctx, projectId) });
          }
          if (!actionId && request.method === "POST") {
            const body = (await request.json()) as { description?: string; priority?: CorrectivePriority; assignedTo?: string; dueDate?: string; inspectionId?: string };
            if (!body.description) return json({ ok: false, error: "description required" }, 400);
            const created = await sc8.createCorrectiveAction(ctx, projectId, {
              id: `ca_${crypto.randomUUID()}`,
              description: body.description,
              priority: body.priority,
              assignedTo: body.assignedTo,
              dueDate: body.dueDate,
              inspectionId: body.inspectionId,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (actionId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: CorrectiveStatus };
            if (!body.status) return json({ ok: false, error: "status required" }, 400);
            const updated = await sc8.updateCorrectiveActionStatus(ctx, projectId, actionId, body.status);
            return json({ ok: true, updated });
          }
        }

        const shiftMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/shifts$/);
        if (shiftMatch) {
          const projectId = shiftMatch[1];
          if (request.method === "GET") {
            const date = url.searchParams.get("date") || undefined;
            return json({ ok: true, shifts: await sc8.listShifts(ctx, projectId, date) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { labourId?: string; workerName?: string; shiftDate?: string; shiftName?: ShiftName; startTime?: string; endTime?: string; notes?: string };
            const created = await sc8.createShift(ctx, projectId, {
              id: `shf_${crypto.randomUUID()}`,
              labourId: body.labourId,
              workerName: body.workerName,
              shiftDate: body.shiftDate,
              shiftName: body.shiftName,
              startTime: body.startTime,
              endTime: body.endTime,
              notes: body.notes,
            });
            return json({ ok: true, ...created }, 201);
          }
        }

        const issueMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/issues(?:\/([^/]+))?$/);
        if (issueMatch) {
          const [, projectId, issueId] = issueMatch;
          if (!issueId && request.method === "GET") {
            return json({ ok: true, issues: await sc8.listIssues(ctx, projectId) });
          }
          if (!issueId && request.method === "POST") {
            const body = (await request.json()) as { title?: string; description?: string; severity?: string };
            if (!body.title) return json({ ok: false, error: "title required" }, 400);
            const created = await sc8.createIssue(ctx, projectId, {
              id: `iss_${crypto.randomUUID()}`,
              title: body.title,
              description: body.description,
              severity: body.severity,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (issueId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: string };
            if (!body.status) return json({ ok: false, error: "status required" }, 400);
            const updated = await sc8.updateIssueStatus(ctx, projectId, issueId, body.status);
            return json({ ok: true, updated });
          }
        }

        const timeMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/time-entries$/);
        if (timeMatch) {
          const projectId = timeMatch[1];
          if (request.method === "GET") {
            return json({ ok: true, entries: await sc8.listTimeEntries(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { date?: string; activity?: string; hours?: number; billable?: boolean; rate?: number; notes?: string };
            if (!body.activity || typeof body.hours !== "number") {
              return json({ ok: false, error: "activity and hours required" }, 400);
            }
            const created = await sc8.createTimeEntry(ctx, projectId, {
              id: `te_${crypto.randomUUID()}`,
              date: body.date,
              activity: body.activity,
              hours: body.hours,
              billable: body.billable,
              rate: body.rate,
              notes: body.notes,
            });
            return json({ ok: true, ...created }, 201);
          }
        }

        const delivMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/deliverables(?:\/([^/]+))?$/);
        if (delivMatch) {
          const [, projectId, delivId] = delivMatch;
          if (!delivId && request.method === "GET") {
            return json({ ok: true, deliverables: await sc8.listDeliverables(ctx, projectId) });
          }
          if (!delivId && request.method === "POST") {
            const body = (await request.json()) as { phaseId?: string; title?: string; docType?: string; dueDate?: string };
            if (!body.title || !body.docType) {
              return json({ ok: false, error: "title and docType required" }, 400);
            }
            const created = await sc8.createDeliverable(ctx, projectId, {
              id: `dlv_${crypto.randomUUID()}`,
              phaseId: body.phaseId,
              title: body.title,
              docType: body.docType,
              dueDate: body.dueDate,
            });
            return json({ ok: true, ...created }, 201);
          }
          if (delivId && request.method === "PATCH") {
            const body = (await request.json()) as { status?: string };
            if (!body.status) return json({ ok: false, error: "status required" }, 400);
            const updated = await sc8.updateDeliverableStatus(ctx, projectId, delivId, body.status);
            return json({ ok: true, updated });
          }
        }

        const membersMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/members(?:\/([^/]+))?$/);
        if (membersMatch) {
          const [, projectId, profileId] = membersMatch;
          if (!profileId && request.method === "POST") {
            const body = (await request.json()) as { profileId?: string; role?: string };
            if (!body.profileId || !body.role) {
              return json({ ok: false, error: "profileId and role required" }, 400);
            }
            await sc8.addProjectMember(ctx, projectId, body.profileId, body.role);
            return json({ ok: true }, 201);
          }
          if (profileId && request.method === "DELETE") {
            const removed = await sc8.removeProjectMember(ctx, projectId, profileId);
            return json({ ok: true, removed });
          }
        }

        const accessReqMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/access-requests$/);
        if (accessReqMatch) {
          const [, projectId] = accessReqMatch;
          if (request.method === "GET") {
            return json({ ok: true, requests: await sc8.listPendingAccessRequests(ctx, projectId) });
          }
          if (request.method === "POST") {
            const id = `par_${crypto.randomUUID()}`;
            await sc8.requestProjectAccess(ctx, projectId, id);
            return json({ ok: true, id }, 201);
          }
        }

        const reviewAccessMatch = url.pathname.match(/^\/api\/access-requests\/([^/]+)\/(approve|reject)$/);
        if (reviewAccessMatch && request.method === "POST") {
          const [, requestId, action] = reviewAccessMatch;
          const updated = await sc8.reviewAccessRequest(ctx, requestId, action === "approve" ? "approved" : "rejected");
          return json({ ok: true, updated });
        }

        if (url.pathname === "/api/dpr" && request.method === "GET") {
          const limit = Number(url.searchParams.get("limit") || "50");
          return json({ ok: true, messages: await sc8.listDprMessages(ctx, Number.isFinite(limit) ? limit : 50) });
        }

        const dprLogMatch = url.pathname.match(/^\/api\/dpr\/([^/]+)\/delivery-log$/);
        if (dprLogMatch && request.method === "GET") {
          return json({ ok: true, logs: await sc8.listDprDeliveryLog(ctx, dprLogMatch[1]) });
        }

        const dprGetMatch = url.pathname.match(/^\/api\/dpr\/([^/]+)$/);
        if (dprGetMatch && request.method === "GET") {
          return json({ ok: true, message: await sc8.getDprMessage(ctx, dprGetMatch[1]) });
        }
      } catch (err) {
        if (err instanceof TenantSecurityError) return json({ ok: false, error: err.message }, 403);
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // 404 Fallback
    return json({ error: "not_found", path: url.pathname }, 404);
  },

  async queue(
    batch: MessageBatch<
      | {
        type?: "notification";
        userId: string;
        orgId?: string;
        projectId?: string;
        kind: string;
        title: string;
        body: string;
        link?: string;
        toEmail?: string;
      }
      | {
        type: "transactional_email";
        to: string | string[];
        subject: string;
        html?: string;
        text?: string;
      }
    >,
    env: Env
  ): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const p = msg.body;
        if (p.type === "transactional_email") {
          if (env.EMAIL) {
            await env.EMAIL.send({
              from: { email: "notifications@sitetrackpro.in", name: "SiteTrack Pro" },
              to: p.to,
              subject: p.subject,
              html: p.html,
              text: p.text,
            });
          } else {
            console.warn("[Queue Consumer] EMAIL binding missing; dropping queued email", { to: p.to, subject: p.subject });
          }
          msg.ack();
          continue;
        }
        await env.DB.prepare(
          `INSERT INTO notifications (id, user_id, project_id, org_id, kind, title, body, link, delivered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            `ntf_${crypto.randomUUID()}`,
            p.userId,
            p.projectId || null,
            p.orgId || null,
            p.kind,
            p.title,
            p.body,
            p.link || null
          )
          .run();
        if (p.toEmail) {
          await sendTransactionalEmail(env, {
            to: p.toEmail,
            subject: p.title,
            html: `<p>${p.body}</p>`,
            text: p.body,
          });
        }
        msg.ack();
      } catch (err) {
        console.error("[Queue Consumer] Failed to process notification:", err);
        msg.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron Trigger] Executing scheduled task at ${new Date(event.scheduledTime).toISOString()}`);
    const pending = await env.DB.prepare(
      `SELECT id, type, org_id, project_id, payload FROM event_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT 25`
    ).all<{ id: string; type: string; org_id: string | null; project_id: string | null; payload: string }>();

    for (const row of pending.results || []) {
      if (env.NOTIFICATION_QUEUE && row.payload) {
        try {
          const parsed = JSON.parse(row.payload) as Record<string, unknown>;
          if (parsed.userId || parsed.to) {
            await env.NOTIFICATION_QUEUE.send({
              ...parsed,
              orgId: row.org_id || undefined,
              projectId: row.project_id || undefined,
            });
          }
        } catch (err) {
          console.warn("[Cron Trigger] Failed to enqueue outbox row", { id: row.id, err: String(err) });
        }
      }
      await env.DB.prepare(`UPDATE event_outbox SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?`)
        .bind(row.id)
        .run();
    }

    await new OrgAdminRepository(env.DB).refreshDailyUsageRollup();
  },
};
