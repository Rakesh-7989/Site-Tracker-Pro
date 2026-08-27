#!/usr/bin/env node
// SiteTrack Pro — Sprint 1 hotfix (Session 30.7): Supabase Auth precheck.
//
// One-shot probe to verify the auth config is in a state where new builder
// signups will actually succeed. Probes the things that BIT us during the
// garchitects99@gmail.com debug session:
//
//   1. anon role can SELECT public.plans (migration 53 GRANT)
//   2. The Sprint 1 tiers are present in the DB and visible to anon
//   3. The auth.users → handle_new_signup trigger is wired
//   4. A test signup via the anon REST API succeeds (or fails with a
//      readable diagnostic that tells the founder which knob to flip)
//
// Usage:
//   node scripts/check-auth-config.mjs                         # quick probe
//   node scripts/check-auth-config.mjs --signup name@firm.in   # also test signup
//
// Reads SUPABASE_DB_URL + VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from
// .env.local. Exits 0 if everything passes; 1 if any check fails.

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

const checks = [];
const add = (name, ok, detail = "") => checks.push({ name, ok, detail });

// ── Probe 1: DB connection + sanity ─────────────────────────────────────────
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
try {
  await c.connect();
  await c.query("reset role"); // session pooler may have left a role set
  add("DB connection", true, `as ${(await c.query("select current_user")).rows[0].current_user}`);
} catch (e) {
  add("DB connection", false, e.message);
  emitAndExit();
}

// ── Probe 2: plans table populated with Sprint 1 tiers ──────────────────────
try {
  const r = await c.query(
    `select id, name, yearly_inr from public.plans
     where status = 'active' and requires_superadmin = false
     order by display_order asc`,
  );
  const expectedIds = new Set(["free", "basic", "pro", "business"]);
  const seenIds = new Set(r.rows.map(x => x.id));
  const missing = [...expectedIds].filter(id => !seenIds.has(id));
  add(
    "plans table has all Sprint 1 tiers (free, basic, pro, business)",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(",")}` : `found: ${[...seenIds].join(",")}`,
  );
  // Pricing sanity
  const pro = r.rows.find(x => x.id === "pro");
  if (pro) {
    add(
      "Pro tier yearly_inr ≈ ₹49,999 (within ±1%)",
      Math.abs(pro.yearly_inr - 4999900) < 50000,
      `actual=${pro.yearly_inr} paise (₹${pro.yearly_inr / 100})`,
    );
  }
} catch (e) {
  add("plans table query", false, e.message);
}

// ── Probe 3: anon can SELECT plans (migration 53 GRANT) ──────────────────────
try {
  await c.query("set role anon");
  const r = await c.query("select count(*) as cnt from public.plans");
  add("anon role can SELECT public.plans (migration 53 GRANT)", Number(r.rows[0].cnt) > 0, `count=${r.rows[0].cnt}`);
  await c.query("reset role");
} catch (e) {
  add("anon role SELECT plans", false, e.message);
  await c.query("reset role").catch(() => {});
}

// ── Probe 4: handle_new_signup trigger wired ──────────────────────────────────
try {
  const r = await c.query(
    `select tgname, tgenabled
     from pg_trigger
     where tgrelid = 'auth.users'::regclass and tgname = 'trg_handle_signup'`,
  );
  add(
    "handle_new_signup trigger attached + enabled on auth.users",
    r.rowCount > 0 && r.rows[0].tgenabled === "O",
    r.rowCount ? `enabled=${r.rows[0].tgenabled}` : "trigger missing",
  );
} catch (e) {
  add("trigger check", false, e.message);
}

// ── Probe 5: REST anon-key returns plans (the browser path) ─────────────────
try {
  const res = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/plans?status=eq.active&requires_superadmin=eq.false&order=display_order.asc&select=id,name`,
    { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } },
  );
  const data = await res.json();
  const ok = res.ok && Array.isArray(data) && data.length >= 3;
  add(
    "REST anon plans GET",
    ok,
    `HTTP ${res.status}, ${Array.isArray(data) ? data.length : "non-array"} rows`,
  );
} catch (e) {
  add("REST anon plans GET", false, e.message);
}

// ── Probe 6 (optional): live signup probe ───────────────────────────────────
const signupIdx = process.argv.indexOf("--signup");
if (signupIdx !== -1 && process.argv[signupIdx + 1]) {
  const email = process.argv[signupIdx + 1];
  console.log(`\n📧 Probing live signup with ${email} …`);
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        email,
        password: `Test-${Date.now()}-Pwd!`,
        data: { firm_name: "Auth Precheck Probe", name: "Test", plan: "free" },
      }),
    });
    const body = await res.text();
    const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
    const errorCode = parsed?.error_code || parsed?.code;
    if (res.status >= 200 && res.status < 300) {
      add(`live signup probe (${email})`, true, `HTTP ${res.status}`);
    } else if (res.status === 429 || errorCode === "over_email_send_rate_limit") {
      add(
        `live signup probe (${email})`,
        false,
        `EMAIL RATE LIMIT hit — fix per docs/RESEND_SMTP_SETUP.md PART A (disable email confirm) or PART B (custom SMTP)`,
      );
    } else if (errorCode === "email_address_invalid") {
      add(`live signup probe (${email})`, false, `Supabase rejected the email format — try a real Gmail / firm address`);
    } else if (res.status === 500) {
      add(
        `live signup probe (${email})`,
        false,
        `HTTP 500 "${parsed?.msg || "unknown"}" — most often = email rate limit masked. See docs/SIGNUP_EMAIL_RATELIMIT_RUNBOOK.md`,
      );
    } else {
      add(`live signup probe (${email})`, false, `HTTP ${res.status} ${body.slice(0, 200)}`);
    }
  } catch (e) {
    add(`live signup probe (${email})`, false, e.message);
  }
}

await c.end();
emitAndExit();

function emitAndExit() {
  console.log("");
  let passed = 0, failed = 0;
  for (const ch of checks) {
    const tag = ch.ok ? "✅ PASS" : "❌ FAIL";
    console.log(`${tag}  ${ch.name}${ch.detail ? ` — ${ch.detail}` : ""}`);
    if (ch.ok) passed++; else failed++;
  }
  console.log(`\n📊 ${passed} passed · ${failed} failed`);
  if (failed > 0) {
    console.log("\n📖 Next steps:");
    console.log("  • If 'plans table' / 'anon GRANT' failed → re-run migrations 53, 54, 55");
    console.log("  • If 'live signup probe' returned RATE LIMIT → docs/RESEND_SMTP_SETUP.md PART A unblocks today, PART B is the permanent fix");
    console.log("  • If 'trigger missing' → re-apply scripts/supabase/34_signup_self_serve.sql");
    process.exit(1);
  }
  process.exit(0);
}
