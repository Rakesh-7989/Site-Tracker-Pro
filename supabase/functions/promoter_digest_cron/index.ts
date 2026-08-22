// SiteTrack Pro — Sprint 3 (Session 30.9) Promoter daily digest cron.
//
// Designed to run hourly via Supabase pg_cron (or external scheduler).
// Each tick:
//   1. Query `digest_subscriptions_due(now())` — subscriptions whose
//      LOCAL hour just matches their preferred hour AND no dispatch for
//      yesterday exists.
//   2. For each due subscription, hydrate the digest input from:
//      - projects (name, dates)
//      - boq/ra (cost-to-date vs budget)
//      - milestones (schedule variance proxy)
//      - issues (open risks by severity)
//      - dpr_messages (yesterday's marquee photo)
//   3. Render the payload via _shared/digest_renderer.ts.
//   4. Send via WhatsApp Cloud API (using existing whatsapp_dpr_send
//      machinery or a dedicated template send).
//   5. Write a digest_dispatches row (UNIQUE (subscription_id,
//      sent_for_date) makes this idempotent — if the cron fires twice
//      for the same date, the second insert no-ops and we skip).
//
// Status today: SHELL only. Real WhatsApp template send + data hydration
// wait for the first signed pilot (so we can test against real DPR
// flows). The render pipeline + idempotency contract are fully wired
// so a single env-flag (SITETRACK_DIGEST_LIVE=true) flips it on.
//
// Invocation:
//   curl -X POST $SUPABASE_FUNCTION_URL/promoter_digest_cron \
//     -H "Authorization: Bearer $CRON_AUTH_TOKEN"
//
// Triggered hourly by Supabase pg_cron or an external scheduler.

// deno-lint-ignore-file no-explicit-any
import { renderDigest, type DigestInput } from "../_shared/digest_renderer.ts";
import { authenticateCron } from "../_shared/auth.ts";
import { sendWhatsAppMessage } from "../_shared/whatsapp_client.ts";

interface CronResponse {
  ok: boolean;
  tick_at: string;
  due_count: number;
  dispatched: number;
  failed: number;
  skipped: number;
  dry_run: boolean;
  error?: string;
}

interface DueSubscription {
  subscription_id: string;
  org_id: string;
  project_id: string | null;
  promoter_phone_e164: string;
  promoter_name: string | null;
  language: "te" | "hi" | "en";
  sent_for_date: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  // ── Security gate (Phase 0.5 hardening) ──
  // Verify the Bearer token matches CRON_SECRET. Previously this EF
  // accepted ANY caller, exposing it as a spam / DoS vector and letting
  // the dispatch table be drained outside its hourly schedule.
  const cronAuth = authenticateCron(req, "CRON_SECRET");
  if (!cronAuth.ok) return cronAuth.response;

  const env = Deno.env.toObject();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = env.SITETRACK_DIGEST_LIVE !== "true";

  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, tick_at: new Date().toISOString(), due_count: 0, dispatched: 0, failed: 0, skipped: 0, dry_run: dryRun, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing" } satisfies CronResponse,
      { status: 500 },
    );
  }

  // ── 1. Fetch subscriptions due now ─────────────────────────────────────
  const dueRes = await fetch(`${supabaseUrl}/rest/v1/rpc/digest_subscriptions_due`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({}),
  });
  if (!dueRes.ok) {
    const text = await dueRes.text();
    return Response.json(
      { ok: false, tick_at: new Date().toISOString(), due_count: 0, dispatched: 0, failed: 0, skipped: 0, dry_run: dryRun, error: `digest_subscriptions_due RPC failed: ${dueRes.status} ${text.slice(0, 200)}` } satisfies CronResponse,
      { status: 500 },
    );
  }
  const due: DueSubscription[] = await dueRes.json();
  const tickAt = new Date().toISOString();

  let dispatched = 0;
  let failed = 0;
  let skipped = 0;

  for (const sub of due) {
    try {
      // ── 2. Hydrate digest input ────────────────────────────────────────
      const input = await hydrateDigestInput(sub, supabaseUrl, serviceKey);
      if (!input) {
        // Project deleted between cron tick + hydration — log + skip
        await writeDispatch(sub, "skipped", null, "project missing or deleted", null, supabaseUrl, serviceKey);
        skipped++;
        continue;
      }

      // ── 3. Render ──────────────────────────────────────────────────────
      const rendered = renderDigest(input);

      // ── 4. Send (or dry-run) ───────────────────────────────────────────
      let metaMessageId: string | null = null;
      let failureReason: string | null = null;
      if (dryRun) {
        metaMessageId = `wamid.DRY_RUN_${Date.now()}_${sub.subscription_id.slice(0, 8)}`;
      } else {
        const sendResult = await sendDigestViaWhatsApp(sub, rendered, env);
        if (sendResult.ok) {
          metaMessageId = sendResult.meta_message_id || null;
        } else {
          failureReason = sendResult.error || "unknown send failure";
        }
      }

      // ── 5. Write dispatch log (idempotent via UNIQUE constraint) ───────
      await writeDispatch(
        sub,
        failureReason ? "failed" : "sent",
        metaMessageId,
        failureReason,
        rendered,
        supabaseUrl,
        serviceKey,
      );
      if (failureReason) failed++; else dispatched++;
    } catch (err) {
      failed++;
      await writeDispatch(
        sub,
        "failed",
        null,
        (err as Error)?.message ?? String(err),
        null,
        supabaseUrl,
        serviceKey,
      );
    }
  }

  return Response.json({
    ok: true,
    tick_at: tickAt,
    due_count: due.length,
    dispatched,
    failed,
    skipped,
    dry_run: dryRun,
  } satisfies CronResponse);
});

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Pull project + budget + schedule + issues + yesterday's marquee photo
 * for a single subscription. Returns null if the project is gone.
 *
 * Status today: SHELL. Real implementation wires through projects + boq +
 * ra + milestones + issues + dpr_messages tables. Sprint 3 mid-cycle
 * finishes this once we have a signed pilot with live data flowing.
 */
async function hydrateDigestInput(
  sub: DueSubscription,
  supabaseUrl: string,
  serviceKey: string,
): Promise<DigestInput | null> {
  // REAL hydration (v5 backlog sweep). All fetches are best-effort via
  // PostgREST with the service key; a failed section degrades to "omitted"
  // rather than failing the whole digest. DigestInput units: money in PAISE.
  const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // ── Project row (name + budget in ₹ → paise) ──────────────────────────────
  let projectName = sub.project_id ? `Project ${sub.project_id.slice(0, 8)}` : "(no project)";
  let budgetInrPaise: number | undefined;
  if (sub.project_id) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${sub.project_id}&select=name,budget`, { headers: H });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]) {
          projectName = String(rows[0].name ?? projectName);
          const b = Number(rows[0].budget ?? 0);
          if (b > 0) budgetInrPaise = b * 100;
        }
      }
    } catch { /* omit cost line */ }
  }

  // ── Spend to date (Σ expenses.amount ₹ → paise) ───────────────────────────
  let costToDatePaise: number | undefined;
  if (sub.project_id && budgetInrPaise !== undefined) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/expenses?project_id=eq.${sub.project_id}&select=amount`,
        { headers: H },
      );
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows)) {
          const sum = rows.reduce((a, e) => a + Number(e.amount ?? 0), 0);
          costToDatePaise = sum * 100;
        }
      }
    } catch { /* omit */ }
  }

  // ── Schedule proxy: completed milestones vs all (planned ≈ actual baseline)
  let actualProgressPct: number | undefined;
  if (sub.project_id) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/milestones?project_id=eq.${sub.project_id}&select=status`,
        { headers: H },
      );
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const done = rows.filter(m => m.status === "completed").length;
          actualProgressPct = Math.round((done / rows.length) * 100);
        }
      }
    } catch { /* omit schedule line */ }
  }

  // ── Open issues (top risks by severity) ───────────────────────────────────
  let openIssues: DigestInput["openIssues"];
  if (sub.project_id) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/issues?project_id=eq.${sub.project_id}&status=eq.open`
          + `&order=severity.desc&limit=5&select=title,severity`,
        { headers: H },
      );
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows)) {
          openIssues = rows.map(i => ({
            title: String(i.title ?? ""),
            severity: (i.severity === "high" ? "high" : i.severity === "low" ? "low" : "medium") as "high" | "medium" | "low",
          }));
        }
      }
    } catch { /* omit risks */ }
  }

  // ── Marquee photo: latest DPR photo for the project ───────────────────────
  let marqueePhotoUrl: string | undefined;
  if (sub.project_id) {
    try {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/dpr_messages?project_id=eq.${sub.project_id}&photo_url=not.is.null`
          + `&order=created_at.desc&limit=1&select=photo_url`,
        { headers: H },
      );
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]?.photo_url) marqueePhotoUrl = String(rows[0].photo_url);
      }
    } catch { /* omit photo */ }
  }

  // ── Org-level at-risk projects (nightly risk snapshot) ────────────────────
  const atRiskProjects = await fetchOrgAtRiskProjects(sub.org_id, supabaseUrl, serviceKey);

  return {
    projectName,
    sentForDate: sub.sent_for_date,
    language: sub.language,
    promoterName: sub.promoter_name || undefined,
    budgetInr: budgetInrPaise,
    costToDateInr: costToDatePaise,
    plannedProgressPct: actualProgressPct, // no plan baseline yet — variance hidden when equal
    actualProgressPct,
    openIssues: openIssues?.length ? openIssues : undefined,
    atRiskProjects,
    marqueePhotoUrl,
    marqueePhotoCaption: undefined,
  };
}

/** Top-3 non-low risk projects for an org from the nightly risk snapshot. */
async function fetchOrgAtRiskProjects(
  orgId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<DigestInput["atRiskProjects"]> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/projects?org_id=eq.${encodeURIComponent(orgId)}&status=eq.active`
        + `&select=name,project_risk_signals(risk_score,risk_level,delay_days)`
        + `&project_risk_signals.risk_level=neq.low`,
      {
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
      },
    );
    if (!res.ok) return undefined;
    type EmbeddedRow = {
      name: string | null;
      project_risk_signals: { risk_score: number | null; risk_level: string | null; delay_days: number | null }[] | null;
    };
    const rows = (await res.json()) as EmbeddedRow[];
    if (!Array.isArray(rows)) return undefined;
    const flat = rows.flatMap(r => (r.project_risk_signals || []).map(s => ({
      name: r.name ?? "Untitled project",
      score: Math.max(0, Math.min(100, Number(s.risk_score ?? 0))),
      level: (s.risk_level === "critical" || s.risk_level === "high" || s.risk_level === "medium")
        ? s.risk_level as "critical" | "high" | "medium"
        : "low" as const,
      delayDays: Math.max(0, Number(s.delay_days ?? 0)),
    })));
    flat.sort((a, b) => b.score - a.score);
    return flat.slice(0, 3);
  } catch {
    return undefined;
  }
}

/**
 * Send the rendered digest via WhatsApp Cloud API using the shared
 * _shared/whatsapp_client. Requires WHATSAPP_PERMANENT_TOKEN +
 * WHATSAPP_PHONE_NUMBER_ID env vars; the digest text is sent as a plain
 * message (the approved-template payload from renderDigest is used when the
 * template name is approved — same call shape).
 */
async function sendDigestViaWhatsApp(
  sub: DueSubscription,
  rendered: ReturnType<typeof renderDigest>,
  env: Record<string, string>,
): Promise<{ ok: boolean; meta_message_id?: string; error?: string }> {
  const token = env.WHATSAPP_PERMANENT_TOKEN;
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WHATSAPP_PERMANENT_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing — set SITETRACK_DIGEST_LIVE=false to keep dry-run mode" };
  }
  if (sub.language !== "te" && sub.language !== "hi" && sub.language !== "en") {
    return { ok: false, error: `unsupported language ${sub.language}` };
  }
  const result = await sendWhatsAppMessage({
    phoneNumberId,
    token,
    message: {
      kind: "text",
      to: sub.promoter_phone_e164,
      body: rendered.text,
    },
  });
  return {
    ok: result.ok,
    meta_message_id: result.meta_message_id,
    error: result.error ?? (result.ok ? undefined : `HTTP ${result.status_code ?? "?"} sending digest`),
  };
}

/** Write one row to digest_dispatches. The UNIQUE (subscription_id,
 *  sent_for_date) constraint means re-inserting for the same day is a
 *  silent no-op — which is exactly the idempotency we want. */
async function writeDispatch(
  sub: DueSubscription,
  outcome: "queued" | "sent" | "failed" | "skipped",
  metaMessageId: string | null,
  failureReason: string | null,
  rendered: ReturnType<typeof renderDigest> | null,
  supabaseUrl: string,
  serviceKey: string,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/digest_dispatches?on_conflict=subscription_id,sent_for_date`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Prefer": "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      subscription_id: sub.subscription_id,
      sent_for_date: sub.sent_for_date,
      outcome,
      meta_message_id: metaMessageId,
      failure_reason: failureReason,
      rendered_payload: rendered ? {
        text: rendered.text,
        stats: rendered.stats,
      } : null,
    }),
  }).catch(() => {/* dispatch log is best-effort */});
}
