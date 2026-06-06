#!/usr/bin/env node
// SiteTrack Pro — production readiness probe (READ-ONLY).
//
// Two things, both safe (every RLS test runs inside a transaction that is
// ROLLED BACK; nothing is written):
//   1. Data audit — counts per key table so we can spot leftover demo data.
//   2. Cross-tenant RLS isolation — simulates a user JWT via Supabase's
//      request.jwt.claims + SET LOCAL ROLE authenticated, then asserts:
//        a. a RANDOM non-member sees ZERO rows of every tenant table.
//        b. a REAL org member sees their org's rows but NOT the global total
//           (isolation), when more than one org exists.
//
// Usage: node scripts/prod-readiness-probe.mjs   (uses SUPABASE_DB_URL)

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) { console.error("❌ SUPABASE_DB_URL missing in .env.local"); process.exit(1); }

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const TENANT_TABLES = ["projects", "vendors", "milestones", "tasks", "issues", "ra_bills", "invoices", "purchase_orders"];
let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✅ ${m}`); pass++; };
const bad = (m) => { console.log(`  ❌ ${m}`); fail++; };

// ── 1. Data audit (as owner) ────────────────────────────────────────────────
console.log("\n=== 1. Data audit (live DB) ===");
for (const t of ["organizations", "profiles", "projects", "org_members", "signup_requests", ...TENANT_TABLES]) {
  try {
    const { rows } = await client.query(`select count(*)::int c from public.${t}`);
    console.log(`  ${t.padEnd(18)} ${rows[0].c}`);
  } catch (e) { console.log(`  ${t.padEnd(18)} (n/a: ${e.message.slice(0, 40)})`); }
}

// Pick a real org + one of its members for the positive isolation test.
const { rows: memberRows } = await client.query(
  `select om.profile_id, om.org_id from public.org_members om order by om.joined_at asc limit 1`);
const { rows: orgCountRows } = await client.query(`select count(*)::int c from public.organizations`);
const orgCount = orgCountRows[0].c;

// Helper: run a block as a simulated authenticated user, always rolled back.
async function asUser(sub, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub, role: "authenticated" })]);
    return await fn();
  } finally {
    await client.query("ROLLBACK"); // also resets ROLE + GUCs
  }
}
const count = async (t) => {
  const { rows } = await client.query(`select count(*)::int c from public.${t}`);
  return rows[0].c;
};

// ── 2a. Random non-member sees nothing ──────────────────────────────────────
console.log("\n=== 2a. RLS: random non-member sees ZERO tenant rows ===");
const randomUuid = "00000000-0000-4000-8000-000000000abc";
await asUser(randomUuid, async () => {
  for (const t of TENANT_TABLES) {
    try { const c = await count(t); c === 0 ? ok(`${t}: 0 rows visible`) : bad(`${t}: LEAK — ${c} rows visible to a non-member!`); }
    catch (e) { bad(`${t}: query errored (${e.message.slice(0, 50)})`); }
  }
});

// ── 2b. Real member sees their org but not the global total ─────────────────
console.log("\n=== 2b. RLS: real member is scoped to their org ===");
if (memberRows.length === 0) {
  console.log("  (skipped — no org_members rows in the live DB yet)");
} else {
  const { profile_id, org_id } = memberRows[0];
  const ownProjects = (await client.query(
    `select count(*)::int c from public.projects where org_id = $1`, [org_id])).rows[0].c;
  const totalProjects = await count("projects"); // as owner = all orgs
  await asUser(profile_id, async () => {
    const visible = await count("projects");
    if (visible === ownProjects) ok(`member sees exactly their org's ${visible} project(s)`);
    else bad(`member sees ${visible} but their org has ${ownProjects}`);
    if (orgCount > 1) {
      if (visible < totalProjects) ok(`isolation confirmed: sees ${visible} < ${totalProjects} total (other orgs hidden)`);
      else bad(`member sees ALL ${totalProjects} projects across ${orgCount} orgs — isolation broken!`);
    } else {
      console.log(`  ℹ️  only ${orgCount} org in DB — cross-org isolation not exercised (add a 2nd org to fully test).`);
    }
  });
}

// ── 2c. Synthetic 2-org isolation (temp data, always rolled back) ───────────
console.log("\n=== 2c. RLS: synthetic 2-org isolation (temp data, rolled back) ===");
const { rows: profs } = await client.query(
  `select id from public.profiles where role <> 'superadmin' order by created_at limit 2`);
if (profs.length < 2) {
  console.log("  (skipped — need 2 non-superadmin profiles)");
} else {
  const profA = profs[0].id, profB = profs[1].id;
  await client.query("BEGIN");
  try {
    const rnd = () => "substr(md5(random()::text),1,6)";
    const orgA = (await client.query(`insert into public.organizations(slug,name,plan) values ('zz-a-'||${rnd()},'ZZ Test A','basic') returning id`)).rows[0].id;
    const orgB = (await client.query(`insert into public.organizations(slug,name,plan) values ('zz-b-'||${rnd()},'ZZ Test B','basic') returning id`)).rows[0].id;
    const projA = (await client.query(`insert into public.projects(org_id,name,status) values ($1,'ZZ Proj A','active') returning id`, [orgA])).rows[0].id;
    const projB = (await client.query(`insert into public.projects(org_id,name,status) values ($1,'ZZ Proj B','active') returning id`, [orgB])).rows[0].id;
    await client.query(`insert into public.org_members(org_id,profile_id,role) values ($1,$2,'admin')`, [orgA, profA]);
    await client.query(`insert into public.org_members(org_id,profile_id,role) values ($1,$2,'admin')`, [orgB, profB]);

    await client.query("SET LOCAL ROLE authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: profA, role: "authenticated" })]);
    const seesOwn = (await client.query(`select count(*)::int c from public.projects where id=$1`, [projA])).rows[0].c;
    const seesOther = (await client.query(`select count(*)::int c from public.projects where id=$1`, [projB])).rows[0].c;
    seesOwn === 1 ? ok("userA sees their own org's project") : bad(`userA cannot see own project (got ${seesOwn})`);
    seesOther === 0 ? ok("userA CANNOT see orgB's project — cross-tenant isolation holds") : bad("LEAK: userA can see orgB's project!");
  } catch (e) {
    bad(`synthetic test errored: ${e.message.slice(0, 80)}`);
  } finally {
    await client.query("ROLLBACK");
  }
}

await client.end();
console.log(`\n📊 RLS isolation: ${pass} passed · ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
