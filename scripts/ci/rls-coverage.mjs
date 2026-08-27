// SiteTrack Pro — RLS coverage matrix + SEC-02 drift audit gate.
//
// Run via:   npm run check:rls:coverage
//        or: node scripts/rls-coverage.mjs
//
// WHY THIS EXISTS
//   Phase 0 / 0.8 (SEC-02 Audit RLS vs application RBAC, DB-05 RLS coverage
//   matrix). Two separate checks in one script:
//
//   1. COVERAGE MATRIX (DB-05) — for every public table, enumerate whether RLS
//      is enabled, how many policies it has per command, and whether any
//      policy is PERMISSIVE-for-ALL (a broad write surface). Any table that
//      exposes DML to `authenticated` WITHOUT row-level security is a FAIL —
//      the exact class of leak that shipped `sites`/`buildings`/`rooms`/etc.
//   2. DRIFT AUDIT (SEC-02) — cross-check the comment-only capability → RLS-gate
//      map in scripts/supabase/66_rls_role_catalog_sync.sql against the
//      authoritative CAPABILITIES list in src/auth/capabilities.ts. A capability
//      identifier mentioned in the map that no longer exists in the app's
//      capability catalog is a FAIL (stale comment / renamed capability).
//
// The matrix is emitted to docs/RLS_COVERAGE.md (auto-generated, committed) so
// PRs can see the live posture at a glance. Exit 0 on green, 1 on any fail.
//
// EXIT CODES
//   0  all covered + zero drift (or DB not configured — SKIP)
//   1  at least one table exposes authenticated DML without RLS, OR a
//      capability token in the RLS map does not exist in capabilities.ts

import pg from "pg";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ENV_PATH = join(root, ".env.local");
const OUT_PATH = join(root, "docs", "RLS_COVERAGE.md");

// Tables that legitimately need no RLS. spatial_ref_sys is the PostGIS SRID
// catalog (pure reference geometry, no org data); schema_migrations /
// site_track_migrations are migration ledgers owned by service/postgres.
const NO_RLS_ALLOWLIST = new Set(["spatial_ref_sys", "schema_migrations", "site_track_migrations"]);

// Policy gate helper functions (SEC-02 canonical gate vocabulary). A policy
// that references none of these AND none of the inline role helpers is likely
// a plain `auth.uid() is not null` gate — worth listing in the report.
const GATE_HELPERS = [
  "user_project_ids", "user_org_ids", "has_project_role", "has_org_tier",
  "has_identity_role", "is_orgadmin", "is_superadmin", "can_read_project",
  "can_write_project", "current_role_text", "v2_check_access", "v2_policy_check",
];

// RBAC V2 shadow-adoption helpers (Phase 1 / 1.1 Policy-Core signal). A policy
// whose gate references these computes the V2 decision per row in shadow/enforce.
const V2_HELPERS = ["v2_check_access", "v2_policy_check"];

// ── env / config (mirrors check-column-drift.mjs) ────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}

const env = loadEnv();
const DB_URL = env.SUPABASE_DB_URL || "";

if (!DB_URL) {
  console.log("SKIP  SUPABASE_DB_URL not configured (env or .env.local) — RLS coverage gate not run.");
  process.exit(0);
}

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// ── 1. live RLS posture ──────────────────────────────────────────────────────
const tables = (await db.query(
  `select c.relname as table, c.relrowsecurity as rls_enabled
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`)).rows;

const policies = (await db.query(
  `select tablename, policyname, cmd, permissive, roles, qual, with_check
     from pg_policies where schemaname = 'public'
     order by tablename, cmd, policyname`)).rows;

// Grants of DML to non-owner roles for each public table.
const grants = (await db.query(
  `select table_name, grantee,
          string_agg(privilege_type, ',' order by privilege_type) as privs
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('authenticated', 'anon')
    group by table_name, grantee
    order by table_name, grantee`)).rows;

// ── 2. drift audit: capabilities.ts vs 66_rls_role_catalog_sync.sql ──────────
function readCaps() {
  const src = readFileSync(join(root, "src", "auth", "capabilities.ts"), "utf8");
  const body = src.match(/CAPABILITIES\s*=\s*\[([\s\S]*?)\] as const/);
  if (!body) return [];
  const caps = [];
  for (const m of body[1].matchAll(/"([a-z][a-z0-9:-]+)"/g)) caps.push(m[1]);
  return caps;
}
const caps = readCaps();
const capSet = new Set(caps);

function readRlsMap() {
  const src = readFileSync(join(root, "scripts", "supabase", "66_rls_role_catalog_sync.sql"), "utf8");
  const tokens = new Set();
  // Capability identifiers appear in comment blocks as `cap:name` tokens.
  for (const m of src.matchAll(/\b([a-z][a-z0-9]*:[a-z][a-z0-9:]*)\b/g)) {
    const t = m[1];
    if (t.endsWith(":")) continue;
    // keep only tokens whose domain is a known capability domain to avoid
    // catching SQL-ish words (none expected, but be conservative)
    if (/\d/.test(t)) continue;
    tokens.add(t);
  }
  return [...tokens].sort();
}
const rlsMapCaps = readRlsMap();

const drift = rlsMapCaps.filter(c => !capSet.has(c));

// ── report ───────────────────────────────────────────────────────────────────
const byTable = new Map();
for (const t of tables) byTable.set(t.table, { rls: t.rls_enabled, policies: [] });
for (const p of policies) {
  const rec = byTable.get(p.tablename);
  if (rec) rec.policies.push(p);
}

const exposed = [];
const rows = [];
for (const t of tables) {
  const rec = byTable.get(t.table);
  const pols = rec?.policies ?? [];
  const grantAuth = (grants.filter(g => g.table_name === t.table && g.grantee === "authenticated")[0]?.privs ?? "")
    .split(",").filter(p => ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(p));
  const grantAnon = (grants.filter(g => g.table_name === t.table && g.grantee === "anon")[0]?.privs ?? "")
    .split(",").filter(p => ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(p));

  const cnt = { SELECT: 0, INSERT: 0, UPDATE: 0, DELETE: 0, ALL: 0 };
  let permissiveAll = 0;
  let helperGates = 0;
  let v2Gates = 0;
  for (const p of pols) {
    cnt[p.cmd] = (cnt[p.cmd] ?? 0) + 1;
    if (p.cmd === "ALL" && p.permissive === "PERMISSIVE") permissiveAll++;
    const gate = `${p.qual ?? ""} ${p.with_check ?? ""}`;
    if (GATE_HELPERS.some(h => gate.includes(h))) helperGates++;
    if (V2_HELPERS.some(h => gate.includes(h))) v2Gates++;
  }

  const hasDmlGrant = grantAuth.length > 0 || grantAnon.length > 0;
  const covered = t.rls_enabled || NO_RLS_ALLOWLIST.has(t.table);
  const row = {
    table: t.table, rls: t.rls_enabled, covered,
    cnt, permissiveAll, helperGates, v2Gates, grantAuth: grantAuth.join(","), grantAnon: grantAnon.join(","),
  };
  rows.push(row);
  if (!covered && hasDmlGrant) exposed.push(row);
}

const totalTables = rows.length;
const coveredCount = rows.filter(r => r.covered).length;
const failCount = exposed.length + drift.length;

// markdown
const md = [];
md.push("# RLS Coverage Matrix — auto-generated");
md.push("");
md.push(`> Generated ${new Date().toISOString()} by \`node scripts/rls-coverage.mjs\` (Phase 0 / 0.8 — SEC-02 + DB-05; Phase 1.1 — RBAC V2 shadow).`);
md.push("> **Do not edit by hand.** Regenerate with `npm run check:rls:coverage`.");
md.push("");
md.push("## Summary");
md.push("");
md.push(`- Public tables: **${totalTables}**`);
md.push(`- RLS enabled (or allowlisted infra): **${coveredCount} / ${totalTables}** (${Math.round((coveredCount / totalTables) * 100)}%)`);
md.push(`- Tables exposing authenticated/anon DML without RLS: **${exposed.length}** ${exposed.length ? "🚨" : "✅"}`);
md.push(`- Policies: **${policies.length}** (SELECT ${policies.length ? rows.reduce((s, r) => s + r.cnt.SELECT, 0) : 0} / INSERT ${policies.length ? rows.reduce((s, r) => s + r.cnt.INSERT, 0) : 0} / UPDATE ${policies.length ? rows.reduce((s, r) => s + r.cnt.UPDATE, 0) : 0} / DELETE ${policies.length ? rows.reduce((s, r) => s + r.cnt.DELETE, 0) : 0} / ALL ${policies.length ? rows.reduce((s, r) => s + r.cnt.ALL, 0) : 0})`);
md.push(`- Permissive-ALL write policies: **${rows.reduce((s, r) => s + r.permissiveAll, 0)}**`);
md.push(`- Policies referencing a RBAC V2 shadow gate (Policy-Core): **${rows.reduce((s, r) => s + r.v2Gates, 0)}** across **${rows.filter(r => r.v2Gates > 0).length}** tables`);
md.push(`- Capabilities in app catalog: **${caps.length}**`);
md.push(`- Capability tokens in the RLS map: **${rlsMapCaps.length}**`);
md.push(`- Drift (RLS-map tokens missing from capabilities.ts): **${drift.length}** ${drift.length ? "🚨" : "✅"}`);
md.push("");

if (exposed.length) {
  md.push("## 🚨 Exposed tables (authenticated/anon DML, no RLS)");
  md.push("");
  md.push("| Table | RLS | Auth grants | Anon grants |");
  md.push("|---|---|---|---|");
  for (const r of exposed) {
    md.push(`| ${r.table} | off | ${r.grantAuth || "—"} | ${r.grantAnon || "—"} |`);
  }
  md.push("");
}

if (drift.length) {
  md.push("## 🚨 Capability drift (RLS map vs capabilities.ts)");
  md.push("");
  md.push("Tokens in `66_rls_role_catalog_sync.sql` that are NOT in `CAPABILITIES`:");
  md.push("");
  for (const c of drift) md.push(`- \`${c}\``);
  md.push("");
}

md.push("## Matrix");
md.push("");
md.push("| Table | RLS | S | I | U | D | ALL | Perm-ALL | Helper gates | V2 gates | Auth DML | Anon DML |");
md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  md.push(`| ${r.table} | ${r.rls ? "✅" : "—"} | ${r.cnt.SELECT} | ${r.cnt.INSERT} | ${r.cnt.UPDATE} | ${r.cnt.DELETE} | ${r.cnt.ALL} | ${r.permissiveAll} | ${r.helperGates} | ${r.v2Gates} | ${r.grantAuth || "—"} | ${r.grantAnon || "—"} |`);
}
md.push("");
md.push("Legend: RLS ✅ = `enable row level security` present · Perm-ALL = number of `PERMISSIVE ... FOR ALL` policies (a broad write surface) · Helper gates = policies whose USING/WITH CHECK references a canonical gate helper · V2 gates = policies referencing `v2_policy_check`/`v2_check_access` (RBAC V2 shadow adoption, Phase 1.1) · Auth/Anon DML = DML grants to that role.");

await db.end();

// ── write the committed matrix ───────────────────────────────────────────────
mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(OUT_PATH, md.join("\n"), "utf8");

// ── console + exit ───────────────────────────────────────────────────────────
console.log(`RLS coverage: ${coveredCount}/${totalTables} tables covered · ${exposed.length} exposed · ${drift.length} drift · matrix → ${OUT_PATH.replace(root + "\\", "").replace(root + "/", "")}`);
if (exposed.length) {
  console.error(`FAIL  ${exposed.length} table(s) expose authenticated/anon DML without RLS: ${exposed.map(r => r.table).join(", ")}`);
}
for (const c of drift) {
  console.error(`FAIL  capability "${c}" in 66_rls_role_catalog_sync.sql is not in src/auth/capabilities.ts`);
}
if (failCount) {
  console.error(`\n${failCount} RLS coverage/drift issue(s) — add RLS (migration) or fix the stale capability comment before shipping.`);
  process.exit(1);
}
console.log("PASS  all public tables with DML grants have RLS; RLS capability map is in sync with the app catalog.");