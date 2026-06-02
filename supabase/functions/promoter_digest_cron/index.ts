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
  _supabaseUrl: string,
  _serviceKey: string,
): Promise<DigestInput | null> {
  // TODO Sprint 3 mid-cycle: actual data fetches. For now we return
  // a synthetic payload so the cron + dispatch log + idempotency wiring
  // can be tested against real subscriptions without depending on the
  // queries being final.
  return {
    projectName: `Project ${sub.project_id?.slice(0, 8) || "(no project)"}`,
    sentForDate: sub.sent_for_date,
    language: sub.language,
    promoterName: sub.promoter_name || undefined,
    // Synthetic placeholder values — replaced when real hydration ships
    budgetInr: 150_00_00_000,        // ₹1.5 cr in paise
    costToDateInr: 87_50_00_000,     // ₹87.5 lakh in paise (58%)
    plannedProgressPct: 60,
    actualProgressPct: 56,
    openIssues: [
      { title: "Pending RERA quarterly filing", severity: "high" },
      { title: "Cement supply delay from vendor", severity: "medium" },
    ],
    marqueePhotoUrl: undefined,       // wires to dpr_messages.photo_url latest yesterday
    marqueePhotoCaption: undefined,
  };
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
