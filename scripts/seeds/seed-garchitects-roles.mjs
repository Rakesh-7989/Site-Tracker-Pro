#!/usr/bin/env node
// SiteTrack Pro — seed one user per identity role into the "G Architects" org,
// create a construction project, and grant every construction-valid role
// project membership. Mirrors scripts/create-test-users.mjs conventions.
//
// Decisions (user-confirmed 2026-08-10):
//   - Scope: all 22 identity roles → 22 auth users.
//   - Project type: "construction" (single project) → 12 project-capable roles
//     get project_members rows. superadmin/orgadmin/prospector/vendor + the
//     pure design/consultancy roles (design_head, design_architect_interior,
//     consultant_head, consultant, designer, promoter) still get users + org
//     membership but cannot hold a project_members row for a construction
//     project (project_members_role_by_type_trigger + role CHECK).
//   - superadmin is platform-only: no org_members row (org_members.role CHECK
//     has no superadmin; superadmin is cross-tenant and sees everything).
//
// Idempotent: re-running upserts, never duplicates.
//
// Usage:
//   node scripts/seed-garchitects-roles.mjs --dry-run   # print plan only
//   node scripts/seed-garchitects-roles.mjs             # apply
//
// Reads .env.local for SUPABASE_DB_URL. Writes GARCHITECTS_CREDENTIALS.md
// (gitignored) with the full roster.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("❌ SUPABASE_DB_URL missing in .env.local");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

// ── Target org ──────────────────────────────────────────────────────────────
const ORG_SLUG = "g-architects-0387b7";

// ── Project ─────────────────────────────────────────────────────────────────
const PROJECT_NAME = "G Arch Demo Villa";
const PROJECT = {
  name: PROJECT_NAME,
  type: "construction",
  status: "active",
  client_name: "Demo Client",
  location: "Jubilee Hills, Hyderabad",
  lat: 17.4126,
  lng: 78.4483,
  budget: 75_000_000,
  start_date: "2026-01-15",
  expected_end_date: "2027-12-31",
  progress: 5,
};

// ── Roster: one user per identity role ──────────────────────────────────────
//   role       → profiles.role
//   orgRole    → org_members.role (6-value CHECK: admin|pm|architect|contractor|client|vendor)
//   projRole   → project_members.role (null ⇒ not assignable on a construction project)
//   isStaff    → superadmin only (platform tier)
const ROSTER = [
  { role: "superadmin",            orgRole: null,        projRole: null,               isStaff: true  },
  { role: "orgadmin",              orgRole: "admin",     projRole: null,               isStaff: false },
  { role: "promoter",              orgRole: "admin",     projRole: null,               isStaff: false },
  { role: "project_admin",         orgRole: "admin",     projRole: "project_admin",    isStaff: false },
  { role: "prospector",            orgRole: "admin",     projRole: null,               isStaff: false },
  { role: "pm",                    orgRole: "pm",        projRole: "pm",               isStaff: false },
  { role: "architect",             orgRole: "architect", projRole: "architect",        isStaff: false },
  { role: "senior_architect",      orgRole: "architect", projRole: "senior_architect", isStaff: false },
  { role: "junior_architect",      orgRole: "architect", projRole: "junior_architect", isStaff: false },
  { role: "design_architect_interior", orgRole: "architect", projRole: null,           isStaff: false },
  { role: "design_head",           orgRole: "architect", projRole: null,               isStaff: false },
  { role: "consultant_head",       orgRole: "architect", projRole: null,               isStaff: false },
  { role: "mep_consultant",        orgRole: "architect", projRole: "mep_consultant",   isStaff: false },
  { role: "structural_consultant", orgRole: "architect", projRole: "structural_consultant", isStaff: false },
  { role: "consultant",            orgRole: "architect", projRole: null,               isStaff: false },
  { role: "designer",              orgRole: "architect", projRole: null,               isStaff: false },
  { role: "site_engineer",         orgRole: "architect", projRole: "site_engineer",    isStaff: false },
  { role: "contractor",            orgRole: "contractor", projRole: "contractor",      isStaff: false },
  { role: "sub_contractor",        orgRole: "contractor", projRole: "sub_contractor",  isStaff: false },
  { role: "vendor",                orgRole: "vendor",    projRole: null,               isStaff: false },
  { role: "client",                orgRole: "client",    projRole: "client",           isStaff: false },
  { role: "site_inspector",        orgRole: "client",    projRole: "site_inspector",   isStaff: false },
];

const ROLE_LABEL = {
  superadmin: "Platform Admin",
  orgadmin: "Firm Owner",
  promoter: "Promoter",
  project_admin: "Project Admin",
  prospector: "Sales / BD",
  pm: "Project Manager",
  architect: "Architect",
  senior_architect: "Senior Architect",
  junior_architect: "Junior Architect",
  design_architect_interior: "Design Architect (Interior)",
  design_head: "Design Head",
  consultant_head: "Consultant Head",
  mep_consultant: "MEP Consultant",
  structural_consultant: "Structural Consultant",
  consultant: "Consultant",
  designer: "Designer",
  site_engineer: "Site Engineer",
  contractor: "Contractor",
  sub_contractor: "Sub-contractor",
  vendor: "Vendor",
  client: "Client / Unit Buyer",
  site_inspector: "Site Inspector (RERA)",
};

const emailFor    = (role) => `garch.${role.replace(/_/g, "-")}@sitetrack.test`;
const passwordFor = (role) => `GArch-Test-${role.replace(/(^.|_.)/g, m => m.replace("_", "").toUpperCase())}-2026!`;

// ── Print plan in dry-run ───────────────────────────────────────────────────
if (dryRun) {
  console.log(`[DRY RUN] Would seed into org slug "${ORG_SLUG}"`);
  console.log(`[DRY RUN] Project: "${PROJECT_NAME}" (${PROJECT.type}, budget ₹${PROJECT.budget})`);
  const org = ROSTER.filter(r => r.orgRole);
  const proj = ROSTER.filter(r => r.projRole);
  console.log(`[DRY RUN] Users: ${ROSTER.length} · Org members: ${org.length} · Project members: ${proj.length}`);
  for (const r of ROSTER) {
    const bits = [r.role.padEnd(26), emailFor(r.role)];
    if (r.orgRole) bits.push(`org:${r.orgRole}`);
    if (r.projRole) bits.push(`proj:${r.projRole}`);
    console.log(`   ${bits.join("  ")}`);
  }
  process.exit(0);
}

// ── Live DB session ─────────────────────────────────────────────────────────
const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

// Locate org (by slug, fallback to name).
const orgRes = await c.query(
  `select id, slug, name, plan from public.organizations where slug = $1`, [ORG_SLUG]);
if (!orgRes.rowCount) {
  console.error(`❌ Org "${ORG_SLUG}" not found. Aborting.`);
  await c.end();
  process.exit(1);
}
const org = orgRes.rows[0];
console.log(`📦 Org: ${org.name} (${org.slug}) · id=${org.id} · plan=${org.plan}`);

// Disable triggers so handle_new_signup (auto-org per user) + plan limit
// triggers don't fire during the seed — same pattern as create-test-users.mjs.
await c.query("set session_replication_role = 'replica'");

const created = [];
try {
  // ── 1. Upsert project (idempotent by name) ─────────────────────────────
  let projRes = await c.query(`select id from public.projects where name = $1`, [PROJECT.name]);
  let projectId;
  if (projRes.rowCount) {
    projectId = projRes.rows[0].id;
    console.log(`   ♻️  Project "${PROJECT.name}" exists (id=${projectId}) — reusing.`);
  } else {
    const ins = await c.query(
      `insert into public.projects (org_id, name, type, status, progress, budget,
        start_date, expected_end_date, client_name, location, lat, lng)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id`,
      [org.id, PROJECT.name, PROJECT.type, PROJECT.status, PROJECT.progress,
        PROJECT.budget, PROJECT.start_date, PROJECT.expected_end_date,
        PROJECT.client_name, PROJECT.location, PROJECT.lat, PROJECT.lng],
    );
    projectId = ins.rows[0].id;
    console.log(`   ✅ Project "${PROJECT.name}" created (id=${projectId}).`);
  }

  // ── 2. Upsert users + profiles + org/project memberships ───────────────
  for (const u of ROSTER) {
    const email = emailFor(u.role);
    const password = passwordFor(u.role);
    const name = `GArch ${ROLE_LABEL[u.role]}`;
    const meta = { firm_name: org.name, name, plan: org.plan, role: u.role };

    const existing = await c.query("select id from auth.users where email = $1", [email]);
    let userId;
    if (existing.rowCount) {
      userId = existing.rows[0].id;
      await c.query(
        `update auth.users set encrypted_password = crypt($1, gen_salt('bf', 10)), updated_at = now() where id = $2`,
        [password, userId],
      );
    } else {
      const ins = await c.query(
        `insert into auth.users (
           id, instance_id, email, encrypted_password, email_confirmed_at,
           confirmation_token, recovery_token, email_change_token_new, email_change,
           raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at
         ) values (
           gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           $1, crypt($2, gen_salt('bf', 10)), now(),
           '', '', '', '',
           $3::jsonb, '{"provider":"email","providers":["email"]}'::jsonb,
           'authenticated', 'authenticated', now(), now()
         ) returning id`,
        [email, password, JSON.stringify(meta)],
      );
      userId = ins.rows[0].id;

      await c.query(
        `insert into auth.identities (
           provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
         ) values (
           $1, $2::uuid, jsonb_build_object('sub', $3::text, 'email', $1::text, 'email_verified', true), 'email', now(), now(), now()
         )`,
        [email, userId, userId],
      );
    }

    // Profile with the canonical identity role.
    await c.query(
      `insert into public.profiles (id, name, role, is_staff)
       values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, role = excluded.role, is_staff = excluded.is_staff`,
      [userId, name, u.role, u.isStaff],
    );

    // Org membership (superadmin stays platform-only).
    if (u.orgRole) {
      await c.query(
        `insert into public.org_members (org_id, profile_id, role, status)
         values ($1, $2, $3, 'active')
         on conflict (org_id, profile_id) do update set role = excluded.role, status = 'active', removed_at = null`,
        [org.id, userId, u.orgRole],
      );
    }

    // Project membership (construction-valid roles only).
    if (u.projRole) {
      await c.query(
        `insert into public.project_members (project_id, profile_id, role)
         values ($1, $2, $3)
         on conflict (project_id, profile_id) do update set role = excluded.role, removed_at = null`,
        [projectId, userId, u.projRole],
      );
    }

    created.push({ ...u, name, email, password, userId });
  }

  console.log(`\n✅ Seeded into "${org.name}":`);
  console.log(`   Users:          ${created.length}`);
  console.log(`   Org members:    ${created.filter(r => r.orgRole).length}`);
  console.log(`   Project members:${created.filter(r => r.projRole).length}  (project: ${PROJECT.name})`);
} finally {
  await c.query("set session_replication_role = 'origin'");
  await c.end();
}

// ── Write credentials doc (gitignored) ──────────────────────────────────────
const doc = [];
doc.push(`# G Architects — Role Demo Credentials`);
doc.push(``);
doc.push(`*Generated ${new Date().toISOString()} — DO NOT COMMIT.*`);
doc.push(``);
doc.push(`**App:** https://sitetrackpro.in · **Org:** ${org.name} (${org.slug})`);
doc.push(`**Project:** ${PROJECT.name} (${PROJECT.type})`);
doc.push(``);
doc.push(`**Login:** Sign in → **Password** method → email + password below.`);
doc.push(`**Re-seed:** \`node scripts/seed-garchitects-roles.mjs\` (idempotent).`);
doc.push(``);
doc.push(`## Credentials`);
doc.push(``);
doc.push(`| Role | Email | Password | Org role | Project role |`);
doc.push(`|---|---|---|---|---|`);
for (const u of created) {
  doc.push(`| ${ROLE_LABEL[u.role]} (\`${u.role}\`) | \`${u.email}\` | \`${u.password}\` | ${u.orgRole ?? "—"} | ${u.projRole ?? "—"} |`);
}
doc.push(``);
doc.push(`- **superadmin** is platform-only (cross-tenant, sees all orgs) — no org/project row by design.`);
doc.push(`- Roles without a project role (promoter, prospector, design/consultancy roles, vendor, orgadmin) hold org membership only — ` +
  `the \`project_members_role_by_type_trigger\` forbids them on a construction project.`);

writeFileSync(join(root, "GARCHITECTS_CREDENTIALS.md"), doc.join("\n"));

const giPath = join(root, ".gitignore");
const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
if (!/^GARCHITECTS_CREDENTIALS\.md$/m.test(gi)) {
  writeFileSync(giPath, gi.replace(/\n*$/, "") + "\nGARCHITECTS_CREDENTIALS.md\n");
  console.log("ℹ️  Added GARCHITECTS_CREDENTIALS.md to .gitignore");
}

console.log(`\n📖 Credentials: GARCHITECTS_CREDENTIALS.md (gitignored)`);
