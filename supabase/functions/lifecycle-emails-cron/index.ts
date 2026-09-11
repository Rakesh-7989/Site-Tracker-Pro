// SiteTrack Pro — lifecycle-emails-cron (NEXT_PHASE_PLAN §2.4).
//
// Daily nurture cadence for trial subscriptions. Each tick:
//   1. Fetch every TRIAL/CANCELLED subscription whose trial_ends_at is set
//      (the outer join pulls organizations.created_at = trial start).
//   2. For each org, compute the day-N events now due (day 0 = signup;
//      trial_ends_at = signup + 14d):
//        day1_welcome          day0 + 1d
//        day3_help_and_setup   day0 + 3d   (only if the org has ZERO projects)
//        day7_usage_stats      day0 + 7d
//        day10_trial_ending    day0 + 10d
//        day14_trial_expired   trial_ends_at            (fire when now >= it)
//        day21_miss_you        trial_ends_at + 7d       (fire when now >= it)
//        weekly_digest         day0 + 14/21/28d while now < trial_ends_at
//      (weekly stops once the trial ends, so it never collides with day14.)
//   3. Idempotency: UNIQUE (org_id, template_key, sent_for_date). Rows that
//      are 'sent'/'skipped' are never re-fired; 'failed' rows are retried
//      on subsequent ticks; missing rows are sent and recorded.
//   4. Email-first via Resend (RESEND_API_KEY + RESEND_FROM_EMAIL fallback),
//      recipient = the org's oldest active admin (org_members -> auth user).
//   5. Dry-run mode until SITETRACK_LIFECYCLE_LIVE=true: records rows with a
//      `dry.` message id so the cadence is exercised without real sends.
//
// Triggered daily at 02:20 UTC by pg_cron (migration 261
// 'lifecycle-emails-daily'), bearer = notify_config.promoter_digest_cron_secret.
//
// Invocation:
//   curl -X POST $SUPABASE_FUNCTION_URL/lifecycle-emails-cron \
//     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
//     -d '{}'

import { authenticateCron } from "../_shared/auth.ts";

interface CronResponse {
  ok: boolean;
  tick_at: string;
  orgs_seen: number;
  due_events: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  dry_run: boolean;
  error?: string;
}

interface EligibleOrg {
  org_id: string;
  org_name: string | null;
  created_at: string;       // day 0 = trial start (register_org)
  trial_ends_at: string;    // ~ day 14
  status: string;
}

interface DueEvent {
  template_key: string;
  sent_for_date: string;    // YYYY-MM-DD, the deterministic event date
}

interface ExistingRow {
  template_key: string;
  sent_for_date: string;
  status: string;
}

const DAY_MS = 86_400_000;
const APP_URL = "https://sitetrackpro.in";
const TEMPLATE_KEYS = new Set([
  "day1_welcome", "day3_help_and_setup", "day7_usage_stats",
  "day10_trial_ending", "day14_trial_expired", "day21_miss_you",
  "weekly_digest",
]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const cronAuth = authenticateCron(req, "CRON_SECRET");
  if (!cronAuth.ok) return cronAuth.response;

  const env = Deno.env.toObject();
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = env.SITETRACK_LIFECYCLE_LIVE !== "true";

  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { ok: false, tick_at: new Date().toISOString(), orgs_seen: 0, due_events: 0, sent: 0, retried: 0, failed: 0, skipped: 0, dry_run: dryRun, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing" } satisfies CronResponse,
      { status: 500 },
    );
  }

  const tickAt = new Date().toISOString();
  let orgsSeen = 0;
  let dueEvents = 0;
  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const orgs = await fetchEligibleOrgs(supabaseUrl, serviceKey);
    orgsSeen = orgs.length;

    for (const org of orgs) {
      const events = computeDueEvents(org);
      if (events.length === 0) continue;
      dueEvents += events.length;

      // Existing rows (template_key, sent_for_date) -> status for this org.
      const existing = await fetchExisting(org.org_id, supabaseUrl, serviceKey);

      // Day3 gate: only send when the org is stuck (zero projects).
      const hasProjects = await orgHasProjects(org.org_id, supabaseUrl, serviceKey);
      if (events.some((e) => e.template_key === "day3_help_and_setup") && hasProjects) {
        // Record a skipped row so the nudge never fires later for this date.
        await upsertLifecycleEmail(org, {
          template_key: "day3_help_and_setup",
          sent_for_date: events.find((e) => e.template_key === "day3_help_and_setup")!.sent_for_date,
        }, "skipped", null, "org already has a project — skipping stuck-nudge", null, null, supabaseUrl, serviceKey, dryRun);
        skipped++;
      }

      for (const ev of events) {
        const prev = existing.find(
          (r) => r.template_key === ev.template_key && r.sent_for_date === ev.sent_for_date,
        );
        if (prev && (prev.status === "sent" || prev.status === "skipped")) {
          // Already handled — idempotent no-op.
          continue;
        }
        if (prev && prev.status !== "failed") {
          continue; // unknown status, never touch it
        }

        const isRetry = !!prev && prev.status === "failed";
        try {
          // ── Recipient: oldest active org admin ──────────────────────────
          const to = await resolveOrgAdminEmail(org.org_id, supabaseUrl, serviceKey);
          if (!to) {
            await upsertLifecycleEmail(org, ev, "skipped", null, "no admin recipient resolvable", null, null, supabaseUrl, serviceKey, dryRun);
            skipped++;
            continue;
          }

          // ── Render + send (or dry-run) ──────────────────────────────────
          const { subject, html } = renderLifecycleEmail(ev.template_key, org, ev.sent_for_date);
          let messageId: string | null;
          let failureReason: string | null = null;
          if (dryRun) {
            messageId = `dry.DRY_RUN_${Date.now()}_${org.org_id.slice(0, 8)}`;
          } else {
            const sendRes = await sendViaResend(to, subject, html, env);
            if (sendRes.ok) {
              messageId = sendRes.message_id ?? null;
            } else {
              messageId = null;
              failureReason = sendRes.error ?? "resend failure";
            }
          }

          await upsertLifecycleEmail(
            org, ev,
            failureReason ? "failed" : "sent",
            messageId,
            failureReason,
            subject, to, supabaseUrl, serviceKey, dryRun,
          );
          if (failureReason) failed++; else if (isRetry) retried++; else sent++;
        } catch (err) {
          failed++;
          await upsertLifecycleEmail(
            org, ev, "failed", null,
            (err instanceof Error ? err.message : String(err)).slice(0, 500),
            null, null, supabaseUrl, serviceKey, dryRun,
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    return Response.json(
      { ok: false, tick_at: tickAt, orgs_seen: orgsSeen, due_events: dueEvents, sent, retried, failed, skipped, dry_run: dryRun, error: err instanceof Error ? err.message : String(err) } satisfies CronResponse,
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    tick_at: tickAt,
    orgs_seen: orgsSeen,
    due_events: dueEvents,
    sent,
    retried,
    failed,
    skipped,
    dry_run: dryRun,
  } satisfies CronResponse);
});

// ── Helpers ───────────────────────────────────────────────────────────────

const H = (serviceKey: string) => ({
  "apikey": serviceKey,
  "Authorization": `Bearer ${serviceKey}`,
});

/** All TRIAL (and CANCELLED = trial just expired) subscriptions with a trial end. */
async function fetchEligibleOrgs(supabaseUrl: string, serviceKey: string): Promise<EligibleOrg[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions`
      + `?select=org_id,trial_ends_at,status,organizations(name,created_at)`
      + `&status=in.("trial","cancelled")`
      + `&trial_ends_at=not.is.null`,
    { headers: H(serviceKey) },
  );
  if (!res.ok) {
    throw new Error(`eligible-subscriptions fetch failed: ${res.status} ${(await res.text()).slice(0, 240)}`);
  }
  type Row = {
    org_id: string;
    trial_ends_at: string;
    status: string;
    organizations: { name: string | null; created_at: string } | null;
  };
  const rows = (await res.json()) as Row[];
  return rows
    .filter((r) => r?.organizations?.created_at && r.trial_ends_at)
    .map((r) => ({
      org_id: r.org_id,
      org_name: r.organizations?.name ?? null,
      created_at: r.organizations!.created_at,
      trial_ends_at: r.trial_ends_at,
      status: r.status,
    }));
}

/** Deterministic list of events that are due as of now. */
function computeDueEvents(org: EligibleOrg): DueEvent[] {
  const now = Date.now();
  const start = new Date(org.created_at).getTime();
  const end = new Date(org.trial_ends_at).getTime();
  const dateAt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const events: DueEvent[] = [];

  const oneOffs: Array<[string, number]> = [
    ["day1_welcome", 1],
    ["day3_help_and_setup", 3],
    ["day7_usage_stats", 7],
    ["day10_trial_ending", 10],
  ];
  for (const [key, day] of oneOffs) {
    const t = start + day * DAY_MS;
    if (now >= t) events.push({ template_key: key, sent_for_date: dateAt(t) });
  }

  if (now >= end) events.push({ template_key: "day14_trial_expired", sent_for_date: dateAt(end) });
  if (now >= end + 7 * DAY_MS) events.push({ template_key: "day21_miss_you", sent_for_date: dateAt(end + 7 * DAY_MS) });

  if (now < end) {
    for (const day of [14, 21, 28]) {
      const t = start + day * DAY_MS;
      if (t < end && now >= t) events.push({ template_key: "weekly_digest", sent_for_date: dateAt(t) });
    }
  }

  return events.filter((e) => TEMPLATE_KEYS.has(e.template_key));
}

/** Existing lifecycle_emails rows for one org. */
async function fetchExisting(orgId: string, supabaseUrl: string, serviceKey: string): Promise<ExistingRow[]> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/lifecycle_emails?org_id=eq.${encodeURIComponent(orgId)}`
      + `&select=template_key,sent_for_date,status&limit=1000`,
    { headers: H(serviceKey) },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as ExistingRow[];
  return Array.isArray(rows) ? rows : [];
}

/** Does the org own at least one project row? (day3 stuck-nudge gate) */
async function orgHasProjects(orgId: string, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/projects?org_id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`,
      { headers: H(serviceKey) },
    );
    if (!res.ok) return true; // be conservative — don't nag if we can't prove it's stuck
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return true;
  }
}

/**
 * Upsert one lifecycle_emails row keyed on UNIQUE(org_id, template_key,
 * sent_for_date). New (or 'failed' retry) rows are written with the latest
 * outcome; existing 'sent'/'skipped' rows are never touched (matched earlier).
 */
async function upsertLifecycleEmail(
  org: EligibleOrg,
  ev: DueEvent,
  status: "sent" | "failed" | "skipped",
  messageId: string | null,
  detail: string | null,
  subject: string | null,
  recipientEmail: string | null,
  supabaseUrl: string,
  serviceKey: string,
  dryRun: boolean,
): Promise<void> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/lifecycle_emails?on_conflict=org_id,template_key,sent_for_date`,
    {
      method: "POST",
      headers: {
        ...H(serviceKey),
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify({
        org_id: org.org_id,
        template_key: ev.template_key,
        sent_for_date: ev.sent_for_date,
        status,
        resend_message_id: messageId,
        detail,
        subject,
        recipient_email: recipientEmail,
        org_name: org.org_name,
        sent_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`lifecycle_emails write failed (${status}, dry=${dryRun}): ${res.status} ${(await res.text()).slice(0, 240)}`);
  }
}

/** Org-admin account email via service-key REST (org_members → auth user). */
async function resolveOrgAdminEmail(orgId: string, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  try {
    const memRes = await fetch(
      `${supabaseUrl}/rest/v1/org_members?org_id=eq.${encodeURIComponent(orgId)}`
        + `&role=eq.admin&removed_at=is.null&status=eq.active`
        + `&select=profile_id&order=accepted_at.asc&limit=1`,
      { headers: H(serviceKey) },
    );
    if (!memRes.ok) return null;
    const mems = (await memRes.json()) as Array<{ profile_id: string }>;
    const pid = mems?.[0]?.profile_id;
    if (!pid) return null;

    const uRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${pid}`, { headers: H(serviceKey) });
    if (!uRes.ok) return null;
    const u = (await uRes.json()) as { email?: string };
    return u.email ?? null;
  } catch {
    return null;
  }
}

/** Resend send with the EMAIL-FIRST conventions shared with promoter_digest_cron. */
async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  env: Record<string, string>,
): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY missing" };
  const from = env.RESEND_FROM_EMAIL || "SiteTrackPro <hello@sitetrackpro.in>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) return { ok: false, error: `resend HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}` };
    return { ok: true, message_id: typeof json.id === "string" ? json.id : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Templates ─────────────────────────────────────────────────────────────

interface RenderedEmail {
  subject: string;
  html: string;
}

function renderLifecycleEmail(templateKey: string, org: EligibleOrg, sentForDate: string): RenderedEmail {
  const orgName = org.org_name ?? "your firm";
  const sinceDays = Math.max(0, Math.floor((Date.now() - new Date(org.created_at).getTime()) / DAY_MS));
  const endDays = Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / DAY_MS));

  switch (templateKey) {
    case "day1_welcome":
      return {
        subject: "Welcome to SiteTrack Pro — your 14-day trial is live",
        html: wrap(orgName, sentForDate, [
          ["Welcome aboard!", `Your 14-day free trial of SiteTrack Pro is now live for <strong>${orgName}</strong>.`],
          ["Get started in minutes", "Create your first project, add your team, and start logging daily progress reports, RA bills and drawings — everything in one place."],
          ["Where to go next", `Log in at <a href="${APP_URL}">${APP_URL}</a> and click “New project”. Need a hand? This exact email is the first of a short, helpful series — or reply any time.`],
        ]),
      };
    case "day3_help_and_setup":
      return {
        subject: "Need a hand setting up your first project?",
        html: wrap(orgName, sentForDate, [
          ["Stuck? Let’s fix that together.", `It’s day 3 of your trial at <strong>${orgName}</strong> and there are no projects yet — that’s perfectly normal.`],
          ["One demo project, zero effort", `Create a demo project from your home screen to see daily progress reports, RA bills, RERA tracking, drawings and labour work end-to-end.`],
          ["We’re a message away", `Reply to this email (it lands in our inbox) or book a quick setup call — we’ll get you productive in one sitting.`],
        ]),
      };
    case "day7_usage_stats":
      return {
        subject: `Your first week on SiteTrack Pro${orgName ? " — " + orgName : ""}`,
        html: wrap(orgName, sentForDate, [
          ["One week in", `That’s <strong>${sinceDays} days</strong> since <strong>${orgName}</strong> started its trial — well done sticking with it.`],
          ["What you can do today", "Run a daily progress report, geotag a site photo, raise an RA bill, or upload drawings. Every one of those saves your team a WhatsApp-and-excel round trip."],
          ["Check your home screen", `Log in at <a href="${APP_URL}">${APP_URL}</a> — your projects (if you’ve created any) are right there.`],
        ]),
      };
    case "day10_trial_ending":
      return {
        subject: `Your SiteTrack Pro trial ends soon${endDays >= 0 ? " — " + endDays + " day" + (endDays === 1 ? "" : "s") : ""}`,
        html: wrap(orgName, sentForDate, [
          ["Almost there", `Your trial for <strong>${orgName}</strong> is coming to a close${endDays > 0 ? ` in about <strong>${endDays} days</strong>` : ""}.`],
          ["Pick a plan before it ends", "Everything you’ve built stays yours — nothing is deleted at any point. Choose a plan to keep going uninterrupted."],
          ["Plans from ₹7,999/yr", `See pricing at <a href="${APP_URL}/pricing">${APP_URL}/pricing</a>. Annual plans save you the most; upgrade takes about a minute.`],
        ]),
      };
    case "day14_trial_expired":
      return {
        subject: "Your SiteTrack Pro trial has ended",
        html: wrap(orgName, sentForDate, [
          ["Your trial ended — your data is safe", `The 14-day trial for <strong>${orgName}</strong> has ended. All your projects, reports and bills are safe and simply paused.`],
          ["Nothing is deleted", "Your workspace is unchanged — you just need an active plan to keep creating and sending reports."],
          ["Upgrade when you’re ready", `<a href="${APP_URL}/pricing">Choose a plan</a> and your workspace goes right back to work.`],
        ]),
      };
    case "day21_miss_you":
      return {
        subject: "We miss you — here’s a welcome-back offer",
        html: wrap(orgName, sentForDate, [
          ["It’s been a week since your trial ended", `We’d love to see <strong>${orgName}</strong> back on SiteTrack Pro.`],
          ["Come back and save", "Start an annual plan within the next 7 days and get your first month free — your data is still exactly where you left it."],
          ["Re-activate in one click", `<a href="${APP_URL}/pricing">${APP_URL}/pricing</a> — then keep shipping daily progress reports.`],
        ]),
      };
    case "weekly_digest":
    default:
      return {
        subject: `Your SiteTrack Pro weekly update${orgName ? " — " + orgName : ""}`,
        html: wrap(orgName, sentForDate, [
          ["Your week at a glance", `It’s week ${Math.min(2, Math.floor(sinceDays / 7) + 1)} for <strong>${orgName}</strong>. Here’s how your trial is going.`],
          ["Time remaining", `${endDays > 0 ? `About <strong>${endDays} day${endDays === 1 ? "" : "s"}</strong> left` : "Your trial has ended"}. Log in to keep things moving: <a href="${APP_URL}">${APP_URL}</a>.`],
          ["Need anything?", "Reply to this email any time — a real person reads it."],
        ]),
      };
  }
}

function wrap(orgName: string, dateLabel: string, rows: Array<[string, string]>): string {
  const body = rows
    .map(([h, p]) => `
      <tr>
        <td style="padding:14px 0 4px;font-size:16px;line-height:24px;color:#1f2429;font-weight:600;">${h}</td>
      </tr>
      <tr>
        <td style="padding:0 0 14px;font-size:15px;line-height:23px;color:#434a53;">${p}</td>
      </tr>`)
    .join("");
  return `<!doctype html>
<html lang="en" style="margin:0;padding:0;">
<body style="margin:0;padding:0;background:#f5f3ee;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ece9e1;">
      <div style="background:#1f2429;padding:22px 28px;">
        <span style="color:#ffb48a;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;">SiteTrack Pro</span>
        <span style="float:right;color:#9aa1ab;font-size:12px;">${dateLabel}</span>
      </div>
      <div style="padding:8px 28px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${body}</table>
        <p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #ece9e1;font-size:12px;line-height:18px;color:#8a8f98;">
          ${APP_URL} · sent to the admin of <strong>${orgName}</strong><br/>
          You received this because a SiteTrack Pro trial is active for your organisation.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}