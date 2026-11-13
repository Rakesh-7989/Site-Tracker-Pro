/**
 * SiteTrack Pro — Cloudflare Workers API Gateway
 *
 * Implements Auth, Tenant Security, and Payment Services natively on Cloudflare Workers.
 */

import { hashPassword, verifyPassword, signJwt, verifyJwt } from "./services/authService";
import { mintRazorpayPaymentLink, verifyRazorpaySignature } from "./services/paymentService";
import { uploadToR2, getFromR2, deleteFromR2 } from "./services/storageService";

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  NOTIFICATION_QUEUE?: Queue;
  JWT_SECRET?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
}

const DEFAULT_JWT_SECRET = "sitetrack-cloudflare-dev-jwt-secret-2026";

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
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Razorpay-Signature",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const jwtSecret = env.JWT_SECRET || DEFAULT_JWT_SECRET;

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

        const user = await env.DB.prepare(
          `SELECT id, email, password_hash, full_name, is_platform_admin FROM users WHERE email = ?`
        )
          .bind(body.email.toLowerCase().trim())
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
          user: { id: user.id, email: user.email, fullName: user.full_name },
          organizations: orgs.results || [],
          token,
        });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /api/auth/me
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const authHeader = request.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

      const claims = await verifyJwt(token, jwtSecret);
      if (!claims || !claims.sub) {
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

    // ── PAYMENTS & WEBHOOKS (RAZORPAY) ───────────────────────────────────────

    // POST /api/payments/razorpay-link
    if (url.pathname === "/api/payments/razorpay-link" && request.method === "POST") {
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        return json({ ok: false, error: "Razorpay credentials not configured in Workers environment" }, 500);
      }

      const body = (await request.json()) as {
        amountInPaisa: number;
        description: string;
        customer?: { name?: string; email?: string; contact?: string };
        notes?: Record<string, string>;
      };

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
      const secret = env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET || "";

      if (!secret || !(await verifyRazorpaySignature({ rawBody, signature, secret }))) {
        return json({ ok: false, error: "Invalid signature" }, 401);
      }

      // Return 200 ack to Razorpay immediately
      return json({ ok: true, received: true });
    }

    // ── STORAGE & MEDIA (CLOUDFLARE R2) ─────────────────────────────────────

    // POST /api/storage/upload
    if (url.pathname === "/api/storage/upload" && request.method === "POST") {
      try {
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        const filename = request.headers.get("x-filename") || `file_${crypto.randomUUID()}`;
        const folder = request.headers.get("x-folder") || "uploads";
        const key = `${folder}/${filename}`;

        const arrayBuffer = await request.arrayBuffer();
        const uploaded = await uploadToR2({
          bucket: env.STORAGE,
          key,
          data: arrayBuffer,
          contentType,
        });

        return json({
          ok: true,
          key: uploaded.key,
          size: uploaded.size,
          url: `/api/storage/files/${uploaded.key}`,
        });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    // GET /api/storage/files/*
    if (url.pathname.startsWith("/api/storage/files/") && request.method === "GET") {
      const key = url.pathname.replace(/^\/api\/storage\/files\//, "");
      const file = await getFromR2(env.STORAGE, key);

      if (!file) {
        return json({ ok: false, error: "File not found" }, 404);
      }

      return new Response(file.body, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Length": String(file.size),
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // DELETE /api/storage/files/*
    if (url.pathname.startsWith("/api/storage/files/") && request.method === "DELETE") {
      const key = url.pathname.replace(/^\/api\/storage\/files\//, "");
      await deleteFromR2(env.STORAGE, key);
      return json({ ok: true, deleted: key });
    }

    // 404 Fallback
    return json({ error: "not_found", path: url.pathname }, 404);
  },

  async scheduled(event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron Trigger] Executing scheduled task at ${new Date(event.scheduledTime).toISOString()}`);
  },
};
