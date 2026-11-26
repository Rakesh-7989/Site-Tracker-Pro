/**
 * SiteTrack Pro — Cloudflare Workers API Gateway
 *
 * Implements Auth, Tenant Security, and Payment Services natively on Cloudflare Workers.
 */

import { hashPassword, verifyPassword, signJwt, verifyJwt } from "./services/authService";
import { mintRazorpayPaymentLink, verifyRazorpaySignature } from "./services/paymentService";
import { uploadToR2, getFromR2, deleteFromR2 } from "./services/storageService";
import { assertTenantContext, TenantSecurityError, type SecurityContext } from "./middleware/tenant";
import { ProjectRepository } from "./repositories/projectRepository";
import { SiteOpsRepository } from "./repositories/siteOpsRepository";
import { FinanceRepository } from "./repositories/financeRepository";
import { ProcurementAndDesignRepository } from "./repositories/procurementAndDesignRepository";
import { OrgAdminRepository } from "./repositories/orgAdminRepository";

export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  CACHE?: KVNamespace;
  NOTIFICATION_QUEUE?: Queue;
  JWT_SECRET?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  EMAIL?: SendEmail;
}

async function sendTransactionalEmail(
  env: Env,
  params: { to: string | string[]; subject: string; html?: string; text?: string }
): Promise<void> {
  if (!env.EMAIL) {
    console.log("[Email Service] EMAIL binding not configured; skipping send", {
      to: params.to,
      subject: params.subject,
    });
    return;
  }
  await env.EMAIL.send({
    from: { email: "notifications@sitetrackpro.in", name: "SiteTrack Pro" },
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
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
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
      return json({ ok: false, error: "server misconfigured" }, 500);
    }

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
      const claims = await verifyJwt(token, jwtSecret);
      if (!claims || !claims.sub) return null;
      return {
        sub: String(claims.sub),
        email: String(claims.email || ""),
        org_id: claims.org_id ? String(claims.org_id) : null,
        role: String(claims.role || "user"),
      };
    }

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
      const secret = env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET || "";

      if (!secret || !(await verifyRazorpaySignature({ rawBody, signature, secret }))) {
        return json({ ok: false, error: "Invalid signature" }, 401);
      }

      // Return 200 ack to Razorpay immediately
      return json({ ok: true, received: true });
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
        const body = (await request.json()) as { plan?: "basic" | "pro" | "business"; period?: "monthly" | "annual" };
        const plan = body.plan;
        const period = body.period || "monthly";
        const PLAN_PRICES_PAISE: Record<"basic" | "pro" | "business", Record<"monthly" | "annual", number>> = {
          basic: { monthly: 117882, annual: 1178820 },
          pro: { monthly: 353988, annual: 3539880 },
          business: { monthly: 943988, annual: 9439880 },
        };
        if (!plan || !PLAN_PRICES_PAISE[plan]) {
          return json({ ok: false, error: "Valid plan (basic|pro|business) required" }, 400);
        }
        const amountPaise = PLAN_PRICES_PAISE[plan][period];
        const result = await mintRazorpayPaymentLink({
          keyId: env.RAZORPAY_KEY_ID,
          secret: env.RAZORPAY_KEY_SECRET,
          amountInPaisa: amountPaise,
          description: `SiteTrack Pro ${plan.toUpperCase()} (${period})`,
          customer: { email: ctx.email },
          notes: { org_id: ctx.orgId, plan, period },
        });
        if (!result.ok || !result.id) return json(result, 400);

        await new OrgAdminRepository(env.DB).recordPlanPayment(ctx, {
          id: `pp_${crypto.randomUUID()}`,
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
        const body = (await request.json()) as {
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
      try {
        const contentType = request.headers.get("content-type") || "application/octet-stream";
        const filename = request.headers.get("x-filename") || `file_${crypto.randomUUID()}`;
        // Reject path-traversal characters in client-supplied filenames.
        if (/(\.\.|\\|%2f|%2F)/i.test(filename)) {
          return json({ ok: false, error: "invalid filename" }, 400);
        }
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
      const auth = await authenticateRequest(request);
      if (!auth) {
        return json({ ok: false, error: "authentication required" }, 401);
      }
      const key = url.pathname.replace(/^\/api\/storage\/files\//, "");
      const file = await getFromR2(env.STORAGE, key);

      if (!file) {
        return json({ ok: false, error: "File not found" }, 404);
      }

      return new Response(file.body, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Length": String(file.size),
          "Cache-Control": "private, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // DELETE /api/storage/files/*
    if (url.pathname.startsWith("/api/storage/files/") && request.method === "DELETE") {
      const auth = await authenticateRequest(request);
      if (!auth) {
        return json({ ok: false, error: "authentication required" }, 401);
      }
      const key = url.pathname.replace(/^\/api\/storage\/files\//, "");
      await deleteFromR2(env.STORAGE, key);
      return json({ ok: true, deleted: key });
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
        const body = (await request.json()) as { name?: string; type?: string; budget?: number };
        if (!body.name) return json({ ok: false, error: "name is required" }, 400);
        const id = `prj_${crypto.randomUUID()}`;
        await repo.createProject(resolved.ctx, { id, name: body.name, type: body.type || "construction", budget: body.budget });
        return json({ ok: true, id }, 201);
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

        if (!subresource && request.method === "GET") {
          const project = await projectRepo.getProjectById(ctx, projectId);
          if (!project) return json({ ok: false, error: "Project not found" }, 404);
          return json({ ok: true, project });
        }

        if (subresource === "tasks") {
          if (request.method === "GET") {
            return json({ ok: true, tasks: await siteOps.listTasks(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { title?: string; description?: string; milestoneId?: string; priority?: string; dueDate?: string };
            if (!body.title) return json({ ok: false, error: "title is required" }, 400);
            const id = `tsk_${crypto.randomUUID()}`;
            await siteOps.createTask(ctx, projectId, { id, title: body.title, description: body.description, milestoneId: body.milestoneId, priority: body.priority, dueDate: body.dueDate });
            return json({ ok: true, id }, 201);
          }
          if (request.method === "PATCH" && itemId) {
            const body = (await request.json()) as { status?: "todo" | "in_progress" | "review" | "done" };
            if (!body.status) return json({ ok: false, error: "status is required" }, 400);
            const updated = await siteOps.updateTaskStatus(ctx, projectId, itemId, body.status);
            if (!updated) return json({ ok: false, error: "Task not found" }, 404);
            return json({ ok: true, id: itemId, status: body.status });
          }
        }

        if (subresource === "milestones") {
          if (request.method === "GET") {
            return json({ ok: true, milestones: await siteOps.listMilestones(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { title?: string; description?: string; dueDate?: string; weight?: number };
            if (!body.title) return json({ ok: false, error: "title is required" }, 400);
            const id = `mst_${crypto.randomUUID()}`;
            await siteOps.createMilestone(ctx, projectId, { id, title: body.title, description: body.description, dueDate: body.dueDate, weight: body.weight });
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

        if (subresource === "attendance") {
          if (request.method === "GET") {
            const date = url.searchParams.get("date") || undefined;
            return json({ ok: true, attendance: await siteOps.listAttendance(ctx, projectId, date) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as {
              attendeeKind?: "labour" | "staff" | "visitor";
              attendeeName?: string;
              labourId?: string;
              profileId?: string;
              date?: string;
              status?: string;
              inTime?: string;
              outTime?: string;
              hours?: number;
            };
            if (!body.attendeeKind || !body.attendeeName) {
              return json({ ok: false, error: "attendeeKind and attendeeName are required" }, 400);
            }
            const id = `att_${crypto.randomUUID()}`;
            await siteOps.recordAttendance(ctx, projectId, {
              id,
              attendeeKind: body.attendeeKind,
              attendeeName: body.attendeeName,
              labourId: body.labourId,
              profileId: body.profileId,
              date: body.date,
              status: body.status,
              inTime: body.inTime,
              outTime: body.outTime,
              hours: body.hours,
            });
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

        if (subresource === "boq") {
          if (request.method === "GET") {
            return json({ ok: true, items: await procurement.listBoqItems(ctx, projectId) });
          }
          if (request.method === "POST") {
            const body = (await request.json()) as { itemCode?: string; itemName?: string; unit?: string; qty?: number; rate?: number };
            if (!body.itemName || typeof body.qty !== "number" || typeof body.rate !== "number") {
              return json({ ok: false, error: "itemName, qty, and rate are required" }, 400);
            }
            const id = `boq_${crypto.randomUUID()}`;
            await procurement.createBoqItem(ctx, projectId, {
              id,
              itemCode: body.itemCode,
              itemName: body.itemName,
              unit: body.unit,
              qty: body.qty,
              rate: body.rate,
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

    // 404 Fallback
    return json({ error: "not_found", path: url.pathname }, 404);
  },

  async queue(
    batch: MessageBatch<{
      userId: string;
      orgId?: string;
      projectId?: string;
      kind: string;
      title: string;
      body: string;
      link?: string;
      toEmail?: string;
    }>,
    env: Env
  ): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const p = msg.body;
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
      await env.DB.prepare(`UPDATE event_outbox SET status = 'delivered', delivered_at = datetime('now') WHERE id = ?`)
        .bind(row.id)
        .run();
    }

    await new OrgAdminRepository(env.DB).refreshDailyUsageRollup();
  },
};
