#!/usr/bin/env node
// SiteTrack Pro — Sprint 1 (Session 30.2): seed first demo org.
//
// Closes Task #29: "C — Explore live app + seed first org" by creating
// a single tenant in the production Supabase so the founder has a real
// working multi-tenant context to demo + iterate against.
//
// Idempotent — re-running won't duplicate. Uses ON CONFLICT to upsert.
// Org name and slug are intentionally generic ("Demo Hyderabad Builder")
// so the founder can clear + re-seed during pilot conversations.
//
// Usage:  node scripts/seed-first-org.mjs
//
// Reads:
//   - .env.local for SUPABASE_DB_URL
//
// What it creates:
//   - 1 org "Demo Hyderabad Builder" on "pro" plan
//   - 1 plan row entries (basic / pro / business / enterprise) — only if
//     missing from the plans table

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("❌ .env.local missing — cannot reach Supabase");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("❌ SUPABASE_DB_URL missing in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  // ── Ensure plans table has Sprint 1 tiers ─────────────────────────────
  // Sprint 1 reprice: Pilot ₹29,999 → Pro ₹49,999 → Business ₹89,999 →
  // Enterprise ₹2,49,999+. The plans table existed before; we upsert
  // the four current tiers using id as primary key.
  //
  // monthly_inr is stored in PAISE (Indian cents). Annual / 12 = monthly
  // approximation: Pilot ₹29,999/yr → ~₹2,500/mo → 2,50,000 paise.
  const plans = [
    { id: "basic",      name: "Pilot",      tagline: "Design partner · first 5 only", monthly_inr: 250000,   requires_superadmin: false },
    { id: "pro",        name: "Pro",        tagline: "30% under Powerplay anchor",     monthly_inr: 417000,   requires_superadmin: false },
    { id: "business",   name: "Business",   tagline: "Multi-state + GSTN + handover",  monthly_inr: 750000,   requires_superadmin: false },
    { id: "enterprise", name: "Enterprise", tagline: "Custom, sales-only",             monthly_inr: 2083000,  requires_superadmin: true },
  ];
  for (const p of plans) {
    await client.query(
      `insert into plans (id, name, tagline, monthly_inr, requires_superadmin, status, display_order)
       values ($1, $2, $3, $4, $5, 'active', case $1
                 when 'basic' then 1
                 when 'pro' then 2
                 when 'business' then 3
                 when 'enterprise' then 4
                 else 99
               end)
       on conflict (id) do update set
         name = excluded.name,
         tagline = excluded.tagline,
         monthly_inr = excluded.monthly_inr,
         requires_superadmin = excluded.requires_superadmin,
         status = 'active'`,
      [p.id, p.name, p.tagline, p.monthly_inr, p.requires_superadmin],
    );
  }
  console.log(`✅ plans upserted (Pilot, Pro, Business, Enterprise)`);

  // ── Seed the first demo org ───────────────────────────────────────────
  const orgSlug = "demo-hyderabad-builder";
  const orgName = "Demo Hyderabad Builder";
  const r = await client.query(
    `insert into organizations (slug, name, plan)
     values ($1, $2, 'pro')
     on conflict (slug) do update set name = excluded.name
     returning id, slug, name, plan, created_at`,
    [orgSlug, orgName],
  );
  const org = r.rows[0];
  console.log(`✅ org seeded:`);
  console.log(`   id      = ${org.id}`);
  console.log(`   slug    = ${org.slug}`);
  console.log(`   name    = ${org.name}`);
  console.log(`   plan    = ${org.plan}`);
  console.log(`   created = ${org.created_at}`);

  // ── Optional: print the Sprint 1 freeze list from staff_only_features ─
  const { rows: staffRows } = await client.query(`select view_id, reason from staff_only_features where un_frozen_at is null order by view_id`);
  console.log(`\n🔒 Sprint 1 frozen views (${staffRows.length}):`);
  for (const row of staffRows) {
    console.log(`   ${row.view_id.padEnd(20)} → ${row.reason.slice(0, 70)}`);
  }

  console.log(`\n📦 Next steps:`);
  console.log(`   1. Set VITE_STAFF_EMAILS to founder email so founder bypasses freeze in production`);
  console.log(`   2. Sign in to https://sitetrack-rakesh.vercel.app with your founder email`);
  console.log(`   3. The signup trigger (34_signup_self_serve.sql) auto-creates a separate org`);
  console.log(`      from your auth metadata — this seed org is for staff/demo use only`);
  console.log(`   4. Verify the 16 frozen views are hidden from non-staff in your live app`);
} catch (e) {
  console.error(`\n❌ seed failed: ${e.message}`);
  if (e.detail) console.error(`   detail: ${e.detail}`);
  process.exit(1);
} finally {
  await client.end();
}
