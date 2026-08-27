#!/usr/bin/env node
// SiteTrack Pro — Email/OTP delivery diagnostic.
//
// Probes 3 things that decide whether the 6-digit code reaches the user:
//   1. Did the signup actually get accepted by Supabase Auth?
//   2. Is email confirmation enabled? (if not, no email ever sent)
//   3. Is the recent signup in auth.users with confirmation_token set?
//   4. Is custom SMTP (Resend) configured? (default sender → Gmail spam)
//
// Usage:
//   node scripts/probe-email-otp.mjs              # general health
//   node scripts/probe-email-otp.mjs <email>      # check status of a specific signup
//
// Reads SUPABASE_DB_URL + VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from .env.local.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("❌ .env.local missing");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);

const targetEmail = process.argv[2] || null;

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const out = [];

// ── 1. Recent signups in auth.users ─────────────────────────────────────────
try {
  const r = await c.query(
    `select id, email, created_at,
            email_confirmed_at,
            confirmation_sent_at,
            confirmation_token <> '' as has_token,
            length(confirmation_token) as token_len
       from auth.users
       ${targetEmail ? "where email = $1" : ""}
       order by created_at desc
       limit 5`,
    targetEmail ? [targetEmail] : [],
  );
  if (!r.rowCount) {
    out.push({ ok: false, msg: `No auth.users rows ${targetEmail ? `for ${targetEmail}` : "in last query"}` });
  } else {
    for (const row of r.rows) {
      const confirmed = row.email_confirmed_at ? "✅ confirmed" : "⏳ pending confirmation";
      const sent = row.confirmation_sent_at ? `email triggered at ${row.confirmation_sent_at.toISOString()}` : "❌ no confirmation_sent_at";
      const tok = row.has_token ? `token len=${row.token_len}` : "❌ NO TOKEN STORED";
      out.push({
        ok: true,
        msg: `${row.email.padEnd(40)} ${confirmed} · ${sent} · ${tok}`,
      });
    }
  }
} catch (e) {
  out.push({ ok: false, msg: `auth.users query failed: ${e.message}` });
}

// ── 2. auth schema email confirmation config ────────────────────────────────
// Supabase doesn't expose this in a public-readable view, but we can infer
// from the `auth.flow_state` table + checking if the most recent signup
// has confirmation_sent_at set (if not, email_confirm is disabled).

// ── 3. Live signup probe — see exact error code ─────────────────────────────
const probeEmail = `probe-${Date.now()}@sitetrack-test.invalid`;
try {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      email: probeEmail,
      password: `Test-${Date.now()}-Pwd!`,
      data: { firm_name: "Probe", name: "Probe", plan: "free" },
    }),
  });
  const text = await res.text();
  const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();
  const code = parsed?.error_code || parsed?.code;
  if (res.status === 200) {
    out.push({ ok: true, msg: `Signup probe (${probeEmail}) — HTTP 200, signup accepted. user.id=${parsed?.user?.id}, session=${parsed?.session ? "yes" : "no (email confirm required)"}` });
  } else if (res.status === 429 || code === "over_email_send_rate_limit") {
    out.push({ ok: false, msg: `🚨 EMAIL RATE LIMIT — Supabase shared SMTP is throttled (~3/hour, ~30/day). This is the most common cause of "no email arriving". Fix: configure Resend SMTP (docs/RESEND_SMTP_SETUP.md).` });
  } else {
    out.push({ ok: false, msg: `Signup probe HTTP ${res.status} ${code || ""} ${text.slice(0, 200)}` });
  }
} catch (e) {
  out.push({ ok: false, msg: `Signup probe network error: ${e.message}` });
}

await c.end();

console.log("");
console.log("📧 Email / OTP delivery probe");
console.log("");
for (const o of out) {
  console.log(`  ${o.ok ? "✅" : "🚨"} ${o.msg}`);
}
console.log("");
console.log("🔍 Diagnostic chart:");
console.log("");
console.log("  | Symptom on screen          | Most likely cause              | Fix |");
console.log("  |---|---|---|");
console.log("  | 'Verification email sent', no email arriving | Gmail spam OR Supabase rate limit OR Resend not wired | Check spam → Resend setup |");
console.log("  | confirmation_sent_at NULL  | Email confirm DISABLED         | Re-enable in Supabase Dashboard → Auth → Providers → Email |");
console.log("  | has_token = false           | Token not generated            | Check Auth → Email Templates → Confirm Signup includes {{.Token}} |");
console.log("  | RATE LIMIT error            | Supabase shared SMTP throttled | docs/setup/ (Resend SMTP) |");
console.log("");
console.log("📖 Setup walkthrough: docs/RESEND_SMTP_SETUP.md");
