#!/usr/bin/env node
// SiteTrack Pro — per-role access probe (automated role-by-role QA).
//
// Signs in as each provisioned test-role user via REAL Supabase Auth
// (signInWithPassword) and asserts the backend access each role should — and
// should NOT — have. This exercises the live auth path + SECURITY DEFINER RPC
// gating + RLS as each role, complementing scripts/prod-readiness-probe.mjs
// (which simulates roles at the SQL level).
//
// Verifies, per role:
//   • can they sign in at all
//   • platform_stats (superadmin-only)        → DATA only for superadmin
//   • org_admin_overview(demoOrg) (admin tier) → DATA for org admins + superadmin
//
// READ-ONLY. Needs: test users provisioned (scripts/create-test-users.mjs) and
// .env.local with SUPABASE_DB_URL (to look up the demo org id). The anon key +
// URL come from the committed public config.
//
// Usage: node scripts/role-access-probe.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

// Sign in via the GoTrue password grant → returns an access token (JWT).
async function signIn(url, anon, email, password) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error_description || j.msg || `HTTP ${r.status}` };
  return { token: j.access_token };
}

// Call a SECURITY DEFINER RPC as the signed-in user via PostgREST.
async function rpc(url, anon, token, fn, args) {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  if (!r.ok) return { data: null, status: r.status };
  return { data: await r.json().catch(() => null), status: r.status };
}

const root = process.cwd();

// ── public Supabase config (RLS-safe anon key) ──────────────────────────────
const cfg = readFileSync(join(root, "src/lib/supabasePublicConfig.js"), "utf8");
const SUPABASE_URL = (cfg.match(/PUBLIC_SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
const ANON = (cfg.match(/PUBLIC_SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/) || [])[1];

// ── .env.local (owner conn, only to read the demo org id) ───────────────────
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]));

// Same roster + credential derivation as create-test-users.mjs.
const ROSTER = [
  { role: "superadmin",    isStaff: true  },
  { role: "orgadmin",      isStaff: false },
  { role: "promoter",      isStaff: false },
  { role: "project_admin", isStaff: false },
  { role: "pm",            isStaff: false },
  { role: "architect",     isStaff: false },
  { role: "site_engineer", isStaff: false },
  { role: "contractor",    isStaff: false },
  { role: "client",        isStaff: false },
];
const passwordFor = (role) => `SiteTrack-Test-${role.replace(/(^.|_.)/g, m => m.replace("_", "").toUpperCase())}-2026!`;
const emailFor    = (role) => `test-${role.replace(/_/g, "-")}@sitetrack.test`;

// Which roles are org-admin tier (see org_admin_overview gating).
const ORG_ADMIN_ROLES = new Set(["orgadmin", "promoter", "project_admin"]);

// Expected access per role.
function expectFor(role) {
  const sa = role === "superadmin";
  return {
    platformStats: sa,                                  // superadmin only
    orgOverview:   sa || ORG_ADMIN_ROLES.has(role),     // admins + superadmin
  };
}

function hasData(d) {
  if (d == null) return false;
  if (Array.isArray(d)) return d.length > 0;
  if (typeof d === "object") return Object.keys(d).length > 0;
  return true;
}

// ── look up the demo org id ─────────────────────────────────────────────────
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");
const orgRes = await c.query(
  `select id from public.organizations where slug = 'demo-hyderabad-builder' or name ilike 'Demo%' order by created_at asc limit 1`);
await c.end();
if (!orgRes.rowCount) { console.error("❌ No Demo org found — seed it + run create-test-users.mjs first."); process.exit(1); }
const demoOrgId = orgRes.rows[0].id;

console.log(`Role access probe · demo org ${demoOrgId}\n`);

let failures = 0;
const rows = [];
for (const { role } of ROSTER) {
  const email = emailFor(role), password = passwordFor(role);
  const exp = expectFor(role);

  const { token, error: signInErr } = await signIn(SUPABASE_URL, ANON, email, password);
  if (signInErr || !token) {
    rows.push({ role, signIn: "FAIL", platform: "—", org: "—", ok: false });
    failures++;
    console.log(`  🔴 ${role.padEnd(14)} sign-in FAILED: ${signInErr || "no token"}`);
    continue;
  }

  const { data: stats } = await rpc(SUPABASE_URL, ANON, token, "platform_stats");
  const { data: overview } = await rpc(SUPABASE_URL, ANON, token, "org_admin_overview", { p_org: demoOrgId });

  const gotPlatform = hasData(stats);
  const gotOrg = hasData(overview);
  const okPlatform = gotPlatform === exp.platformStats;
  const okOrg = gotOrg === exp.orgOverview;
  const ok = okPlatform && okOrg;
  if (!ok) failures++;

  const mark = (got, want, good) => `${good ? "✓" : "✗"} ${got ? "data" : "none"}${good ? "" : `(want ${want ? "data" : "none"})`}`;
  rows.push({ role, signIn: "ok", platform: mark(gotPlatform, exp.platformStats, okPlatform), org: mark(gotOrg, exp.orgOverview, okOrg), ok });
  console.log(`  ${ok ? "🟢" : "🔴"} ${role.padEnd(14)} sign-in ok · platform_stats ${mark(gotPlatform, exp.platformStats, okPlatform).padEnd(16)} · org_overview ${mark(gotOrg, exp.orgOverview, okOrg)}`);
}

console.log(`\n${failures === 0 ? `✅ All ${rows.length} roles match expected access.` : `❌ ${failures} role(s) deviated from expected access — investigate.`}`);
process.exit(failures === 0 ? 0 : 1);
