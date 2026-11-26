#!/usr/bin/env node
/**
 * SiteTrack Pro — Supabase Postgres -> Cloudflare D1 Core Data Migrator
 *
 * Exports core tables from Supabase Postgres (organizations, profiles/users,
 * org_members, projects, project_members) and batch-inserts them into
 * Cloudflare D1 via the REST API using `INSERT OR IGNORE` so existing D1 rows
 * are never overwritten.
 *
 * Defaults to --dry-run. Pass --apply to write to D1.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const MAX_PARAMS_PER_STMT = 90;

function printHelp() {
  console.log(`
SiteTrack Pro — Supabase -> Cloudflare D1 Core Table Migrator

Usage:
  node scripts/cloudflare/migrate-supabase-to-d1.mjs [options]

Options:
  --dry-run             Export from Supabase and print batch plan without writing to D1 (default)
  --apply               Execute INSERT OR IGNORE batches against Cloudflare D1 REST API
  --batch-size <n>      Max rows per INSERT statement (default: 20, auto-clamped for SQLite param limits)
  -h, --help            Show this help message and exit

Environment Variables (process.env or .env.local):
  SUPABASE_DB_URL          Postgres connection string (or DATABASE_URL)
  CLOUDFLARE_API_TOKEN     Cloudflare API token with D1:Edit permission (required for --apply)
  CLOUDFLARE_ACCOUNT_ID    Cloudflare Account ID (required for --apply)
  CLOUDFLARE_D1_DATABASE_ID Cloudflare D1 Database UUID (required for --apply)

Tables Migrated (in FK order, INSERT OR IGNORE):
  1. users            (from public.profiles + auth.users.email)
  2. profiles         (from public.profiles)
  3. organizations    (from public.organizations)
  4. org_members      (from public.org_members)
  5. projects         (from public.projects)
  6. project_members  (from public.project_members)
`);
}

function parseArgs(argv) {
  const opts = {
    dryRun: true,
    apply: false,
    batchSize: 20,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
      opts.apply = false;
    } else if (arg === "--apply") {
      opts.apply = true;
      opts.dryRun = false;
    } else if (arg === "--batch-size" || arg.startsWith("--batch-size=")) {
      const raw = arg.includes("=") ? arg.split("=", 2)[1] : argv[++i];
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --batch-size value: ${raw}`);
      }
      opts.batchSize = parsed;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function loadEnv() {
  const envPath = join(process.cwd(), ".env.local");
  const fileEnv = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        fileEnv[match[1]] = match[2].replace(/^"|"$/g, "").trim();
      }
    }
  }

  const get = (key) => (process.env[key] ?? fileEnv[key] ?? "").trim();
  return {
    dbUrl: get("SUPABASE_DB_URL") || get("DATABASE_URL"),
    cfToken: get("CLOUDFLARE_API_TOKEN"),
    cfAccountId: get("CLOUDFLARE_ACCOUNT_ID"),
    cfD1Id: get("CLOUDFLARE_D1_DATABASE_ID"),
  };
}

function toIso(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function toJsonText(val, fallback = null) {
  if (val == null) return fallback;
  if (typeof val === "string") return val;
  return JSON.stringify(val);
}

function toIntBool(val) {
  return val ? 1 : 0;
}

function buildInsertBatches(table, columns, rows, maxBatchRows) {
  if (rows.length === 0) return [];
  const safeBatchSize = Math.max(
    1,
    Math.min(maxBatchRows, Math.floor(MAX_PARAMS_PER_STMT / columns.length))
  );
  const colList = columns.join(", ");
  const rowPlaceholder = `(${columns.map(() => "?").join(", ")})`;
  const batches = [];

  for (let i = 0; i < rows.length; i += safeBatchSize) {
    const slice = rows.slice(i, i + safeBatchSize);
    const placeholders = slice.map(() => rowPlaceholder).join(", ");
    const sql = `INSERT OR IGNORE INTO ${table} (${colList}) VALUES ${placeholders};`;
    const params = [];
    for (const row of slice) {
      for (const val of row) {
        params.push(val === undefined ? null : val);
      }
    }
    batches.push({ sql, params, rowCount: slice.length });
  }

  return batches;
}

async function queryD1(env, sql, params) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.cfAccountId}/d1/database/${env.cfD1Id}/query`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.cfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const errMsg =
      body?.errors?.map((e) => e.message).join("; ") ||
      `HTTP ${res.status}`;
    throw new Error(`D1 API error: ${errMsg}`);
  }

  const first = Array.isArray(body.result) ? body.result[0] : body.result;
  return first?.meta?.changes ?? 0;
}

async function exportCoreTables(client) {
  // 1. Profiles + auth.users email -> D1 users + profiles
  const profilesRes = await client.query(`
    SELECT
      p.id,
      COALESCE(NULLIF(LOWER(TRIM(au.email)), ''), p.id || '@migrated.local') AS email,
      p.name,
      p.avatar,
      p.role,
      p.created_at,
      p.is_staff,
      p.staff_tier,
      p.staff_manager_id,
      p.phone,
      p.company,
      p.job_title,
      p.city,
      p.pref_language,
      p.profile_completed,
      p.consent_version,
      p.consent_updated_at,
      p.notification_prefs,
      p.must_change_password,
      p.push_endpoint,
      p.push_keys
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    ORDER BY p.created_at ASC NULLS LAST, p.id ASC
  `);

  const userRows = profilesRes.rows.map((r) => [
    r.id,
    r.email,
    null, // password_hash is not exported from Supabase auth
    r.name || "",
    r.phone || null,
    r.avatar || null,
    toIntBool(r.is_staff),
    toIso(r.created_at),
  ]);

  const profileRows = profilesRes.rows.map((r) => [
    r.id,
    r.name || "User",
    r.avatar || null,
    r.role || "engineer",
    toIso(r.created_at),
    toIntBool(r.is_staff),
    r.staff_tier || null,
    r.staff_manager_id || null,
    r.phone || null,
    r.company || null,
    r.job_title || null,
    r.city || null,
    r.pref_language || "en",
    toIntBool(r.profile_completed),
    r.consent_version || null,
    toIso(r.consent_updated_at),
    toJsonText(r.notification_prefs, null),
    toIntBool(r.must_change_password),
    r.push_endpoint || null,
    toJsonText(r.push_keys, null),
  ]);

  // 2. Organizations
  const orgsRes = await client.query(`
    SELECT
      id, slug, name, plan, org_type, segments, enabled_modules,
      contact_email, billing_period, subdomain, created_by_staff, created_at
    FROM public.organizations
    ORDER BY created_at ASC NULLS LAST, id ASC
  `);

  const orgRows = orgsRes.rows.map((r) => [
    r.id,
    r.slug,
    r.name,
    r.plan || "basic",
    r.org_type || null,
    toJsonText(r.segments, "[]"),
    toJsonText(r.enabled_modules, "[]"),
    r.contact_email || null,
    r.billing_period || "monthly",
    r.subdomain || null,
    r.created_by_staff || null,
    toIso(r.created_at),
  ]);

  // 3. Org Members
  const orgMembersRes = await client.query(`
    SELECT
      org_id, profile_id, role, is_admin, status,
      invited_by, invited_at, accepted_at, joined_at, removed_at
    FROM public.org_members
    ORDER BY joined_at ASC NULLS LAST, org_id ASC, profile_id ASC
  `);

  const orgMemberRows = orgMembersRes.rows.map((r) => [
    r.org_id,
    r.profile_id,
    r.role || "viewer",
    toIntBool(r.is_admin),
    r.status || "active",
    r.invited_by || null,
    toIso(r.invited_at),
    toIso(r.accepted_at),
    toIso(r.joined_at),
    toIso(r.removed_at),
  ]);

  // 4. Projects (skip rows with null org_id since D1 projects.org_id is NOT NULL)
  const projectsRes = await client.query(`
    SELECT
      id, org_id, name, type, description, location, lat, lng,
      status, progress, budget, contract_value, actual_cost,
      committed_cost, earned_value, wip_value, cost_to_complete,
      forecast_final_cost, start_date, expected_end_date,
      client_name, client_email, architect_id, archived_at,
      created_at, updated_at
    FROM public.projects
    ORDER BY created_at ASC NULLS LAST, id ASC
  `);

  let skippedProjects = 0;
  const projectRows = [];
  for (const r of projectsRes.rows) {
    if (!r.org_id) {
      skippedProjects++;
      continue;
    }
    projectRows.push([
      r.id,
      r.org_id,
      r.name,
      r.type || "construction",
      r.description || null,
      r.location || null,
      r.lat ?? null,
      r.lng ?? null,
      r.status || "active",
      r.progress ?? 0,
      r.budget ?? 0,
      r.contract_value ?? null,
      r.actual_cost ?? 0,
      r.committed_cost ?? 0,
      r.earned_value ?? 0,
      r.wip_value ?? 0,
      r.cost_to_complete ?? 0,
      r.forecast_final_cost ?? 0,
      toIso(r.start_date),
      toIso(r.expected_end_date),
      r.client_name || null,
      r.client_email || null,
      r.architect_id || null,
      toIso(r.archived_at),
      toIso(r.created_at),
      toIso(r.updated_at),
    ]);
  }

  // 5. Project Members
  const projectMembersRes = await client.query(`
    SELECT project_id, profile_id, role, assigned_at, assigned_by, removed_at
    FROM public.project_members
    ORDER BY assigned_at ASC NULLS LAST, project_id ASC, profile_id ASC
  `);

  const projectMemberRows = projectMembersRes.rows.map((r) => [
    r.project_id,
    r.profile_id,
    r.role || "viewer",
    toIso(r.assigned_at),
    r.assigned_by || null,
    toIso(r.removed_at),
  ]);

  return {
    skippedProjects,
    tables: [
      {
        name: "users",
        columns: [
          "id", "email", "password_hash", "full_name", "phone",
          "avatar_url", "is_platform_admin", "created_at",
        ],
        rows: userRows,
      },
      {
        name: "profiles",
        columns: [
          "id", "name", "avatar", "role", "created_at", "is_staff",
          "staff_tier", "staff_manager_id", "phone", "company", "job_title",
          "city", "pref_language", "profile_completed", "consent_version",
          "consent_updated_at", "notification_prefs", "must_change_password",
          "push_endpoint", "push_keys",
        ],
        rows: profileRows,
      },
      {
        name: "organizations",
        columns: [
          "id", "slug", "name", "plan", "org_type", "segments",
          "enabled_modules", "contact_email", "billing_period", "subdomain",
          "created_by_staff", "created_at",
        ],
        rows: orgRows,
      },
      {
        name: "org_members",
        columns: [
          "org_id", "profile_id", "role", "is_admin", "status",
          "invited_by", "invited_at", "accepted_at", "joined_at", "removed_at",
        ],
        rows: orgMemberRows,
      },
      {
        name: "projects",
        columns: [
          "id", "org_id", "name", "type", "description", "location",
          "lat", "lng", "status", "progress", "budget", "contract_value",
          "actual_cost", "committed_cost", "earned_value", "wip_value",
          "cost_to_complete", "forecast_final_cost", "start_date",
          "expected_end_date", "client_name", "client_email",
          "architect_id", "archived_at", "created_at", "updated_at",
        ],
        rows: projectRows,
      },
      {
        name: "project_members",
        columns: [
          "project_id", "profile_id", "role", "assigned_at",
          "assigned_by", "removed_at",
        ],
        rows: projectMemberRows,
      },
    ],
  };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const env = loadEnv();
  if (!env.dbUrl || env.dbUrl.includes("YOUR_")) {
    console.error("Error: SUPABASE_DB_URL (or DATABASE_URL) is not configured.");
    process.exit(1);
  }

  if (opts.apply) {
    const missing = [];
    if (!env.cfToken) missing.push("CLOUDFLARE_API_TOKEN");
    if (!env.cfAccountId) missing.push("CLOUDFLARE_ACCOUNT_ID");
    if (!env.cfD1Id) missing.push("CLOUDFLARE_D1_DATABASE_ID");
    if (missing.length > 0) {
      console.error(`Error: --apply requires missing env var(s): ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  const modeLabel = opts.apply ? "APPLY (INSERT OR IGNORE -> D1)" : "DRY-RUN (no writes to D1)";
  console.log(`\n── Supabase -> Cloudflare D1 Migration [${modeLabel}] ──\n`);

  const client = new pg.Client({
    connectionString: env.dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (err) {
    console.error(`Error: Failed to connect to Supabase Postgres: ${err.message}`);
    process.exit(1);
  }

  let exported;
  try {
    exported = await exportCoreTables(client);
  } finally {
    await client.end().catch(() => {});
  }

  if (exported.skippedProjects > 0) {
    console.log(`  WARN Skipped ${exported.skippedProjects} project(s) with NULL org_id.`);
  }

  let totalRows = 0;
  let totalInserted = 0;

  for (const tbl of exported.tables) {
    const batches = buildInsertBatches(tbl.name, tbl.columns, tbl.rows, opts.batchSize);
    totalRows += tbl.rows.length;

    if (opts.dryRun) {
      console.log(`  PLAN ${tbl.name.padEnd(16)} : ${tbl.rows.length} row(s) in ${batches.length} batch(es)`);
      continue;
    }

    let tableChanges = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const changes = await queryD1(env, batch.sql, batch.params);
      tableChanges += changes;
    }
    totalInserted += tableChanges;
    console.log(
      `  DONE ${tbl.name.padEnd(16)} : ${tbl.rows.length} exported, ${batches.length} batch(es), ${tableChanges} inserted (existing ignored)`
    );
  }

  if (opts.dryRun) {
    console.log(`\nDry-run complete: ${totalRows} total row(s) ready. Pass --apply to write to D1.\n`);
  } else {
    console.log(`\nMigration complete: ${totalRows} row(s) processed, ${totalInserted} new row(s) inserted.\n`);
  }
}

main().catch((err) => {
  console.error("Migration failed:", err?.message || err);
  process.exit(1);
});
