// SiteTrack Pro — SECURITY DEFINER function verification gate.
//
// Run via:   npm run check:definer          (report-only, always exit 0)
//            node scripts/check-security-definer.mjs --strict   (exit 1 on gaps)
//
// WHY THIS EXISTS
//   Production-audit P0 item: "Verify every SECURITY DEFINER function".
//   A SECURITY DEFINER function WITHOUT a pinned `SET search_path` can be
//   hijacked via search_path tricks (temp-object shadowing / malicious
//   schemas) because it executes with the owner's privileges. Supabase's own
//   linter flags these. This gate enumerates every SECURITY DEFINER function
//   on the LIVE database and reports which ones lack a `search_path` entry in
//   proconfig.
//
// WHAT IT CHECKS
//   - All non-internal schemas (excludes pg_catalog / information_schema).
//   - proconfig containing ANY search_path entry counts as covered (we do not
//     judge the VALUE here — pinning at all closes the hijack class).
//   - Trigger functions and RPCs are both included (both execute definer).
//
// EXIT CODES
//   default : report-only, exit 0 (baseline survey — review before fixing)
//   --strict: exit 1 if any SECURITY DEFINER function lacks a pinned
//             search_path (wire into CI once the baseline is clean).
//
// HOW IT READS THE DB
//   Same convention as check-column-drift.mjs: SUPABASE_DB_URL from env or
//   .env.local; SKIP (exit 0) when unset so a missing secret never blocks CI.

import pg from "pg";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ENV_PATH = join(root, ".env.local");
const STRICT = process.argv.includes("--strict");

function loadEnv() {
  const env = { ...process.env };
  if (existsSync(ENV_PATH)) {
    const lines = readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in env)) env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const DB_URL = env.SUPABASE_DB_URL || "";
if (!DB_URL) {
  console.log("SKIP  SUPABASE_DB_URL not configured (env or .env.local) — definer gate not run.");
  process.exit(0);
}

const QUERY = `
  select
    n.nspname as schema,
    p.proname as name,
    pg_get_function_identity_arguments(p.oid) as args,
    p.proconfig as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef = true
    and n.nspname not in ('pg_catalog', 'information_schema')
  order by n.nspname, p.proname
`;

// Extension/platform-owned functions we deliberately do NOT manage: they are
// replaced on every extension upgrade (our ALTER would be overwritten), and
// they ship from trusted vendors. Keyed as `schema.name`.
const EXTENSION_OWNED = new Set([
  "graphql.get_schema_version",
  "graphql.increment_schema_version",
  "public.st_estimatedextent",
]);

function hasSearchPath(config) {
  if (!config) return false;
  return config.some(entry => typeof entry === "string" && /^search_path\s*=/.test(entry.trim()));
}

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

try {
  const res = await db.query(QUERY);
  const fns = res.rows;
  const unpinned = fns.filter(f => !hasSearchPath(f.config));
  const missing = unpinned.filter(f => !EXTENSION_OWNED.has(`${f.schema}.${f.name}`));
  const allowlisted = unpinned.length - missing.length;

  console.log(`SECURITY DEFINER functions on live DB: ${fns.length}`);
  console.log(`  pinned search_path      : ${fns.length - unpinned.length}`);
  console.log(`  unpinned (extension-owned, allowlisted): ${allowlisted}`);
  console.log(`  unpinned (OUR functions): ${missing.length}`);

  if (missing.length > 0) {
    console.log("\nFunctions WITHOUT a pinned search_path (hijack-hardening gap):");
    for (const f of missing) {
      console.log(`  ${f.schema}.${f.name}(${f.args})`);
    }
    // Group hint for the follow-up fix migration.
    const bySchema = {};
    for (const f of missing) bySchema[f.schema] = (bySchema[f.schema] || 0) + 1;
    console.log("\nBy schema:", Object.entries(bySchema).map(([s, c]) => `${s}=${c}`).join(", "));
    console.log("Fix pattern: ALTER FUNCTION <schema>.<name>(<args>) SET search_path = public, extensions, pg_temp;");
  }

  if (STRICT && missing.length > 0) {
    console.log("\nFAIL (--strict): SECURITY DEFINER functions missing search_path.");
    process.exit(1);
  }
  console.log("\nOK" + (missing.length ? " (report-only; rerun with --strict to enforce)" : " (all our definer functions pinned)"));
  process.exit(0);
} finally {
  await db.end();
}
