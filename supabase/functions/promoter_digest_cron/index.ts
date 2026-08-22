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
  // TODO Sprint 3 mid-cycle: actual data fetches. For now we return
  // a synthetic payload so the cron + dispatch log + idempotency wiring
  // can be tested against real subscriptions without depending on the
  // queries being final.
  //
  // REAL slice: org-level top at-risk projects come from the nightly
  // project_risk_signals snapshot (migrations 225/226) via PostgREST
  // embedding through projects(org_id). Best-effort — failures degrade to
  // "no at-risk section" rather than failing the whole digest.
  const atRiskProjects = await fetchOrgAtRiskProjects(sub.org_id, supabaseUrl, serviceKey);

  return {
    projectName: `Project ${sub.project_id?.slice(0, 8) || "(no project)"}`,
    sentForDate: sub.sent_for_date,
    language: sub.language,
    promoterName: sub.promoter_name || undefined,
    // Synthetic placeholder values — replaced when real hydration ships
    budgetInr: 150_00_00_000,        // ₹11.5 cr in paise
    costToDateInr: 87_50_00_000,     // ₹87.5 lakh in paise (58%)
    plannedProgressPct: 60,
    actualProgressPct: 56,
    openIssues: [
      { title: "Pending RERA quarterly filing", severity: "high" },
      { title: "Cement supply delay from vendor", severity: "medium" },
    ],
    atRiskProjects,
    marqueePhotoUrl: undefined,       // wires to dpr_messages.photo_url latest yesterday
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
 * Send the rendered digest via WhatsApp Cloud API. TODO Sprint 3 mid-cycle —
 * for now returns ok:false with a clear "not implemented" so the dispatch
 * log shows "failed: not implemented" rather than silent success.
 */
async function sendDigestViaWhatsApp(
  _sub: DueSubscription,
  _rendered: ReturnType<typeof renderDigest>,
  env: Record<string, string>,
): Promise<{ ok: boolean; meta_message_id?: string; error?: string }> {
  if (!env.WHATSAPP_PERMANENT_TOKEN) {
    return { ok: false, error: "WHATSAPP_PERMANENT_TOKEN missing — set SITETRACK_DIGEST_LIVE=false to enable dry-run mode" };
  }
  // TODO: call Meta Cloud API template send endpoint here using
  // _shared/whatsapp_client (which the whatsapp_dpr_send EF will share).
  return { ok: false, error: "promoter digest WhatsApp send not implemented yet — Sprint 3 mid-cycle" };
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
