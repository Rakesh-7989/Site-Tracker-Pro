#!/usr/bin/env node
// Seed a cross-org partner demo: host builder org + interior partner org
// with one interior project and an active viewer link.
// Idempotent: re-running reuses orgs/users/project/link.

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
if (!dbUrl) { console.error("❌ SUPABASE_DB_URL missing"); process.exit(1); }

const dryRun = process.argv.includes("--dry-run");

const HOST = {
  slug: "demo-partner-host",
  name: "Demo Host — Builder Co.",
  org_type: "builder",
  segments: ["construction"],
  plan: "business",
};
const PARTNER = {
  slug: "demo-partner-interior",
  name: "Demo Partner — Studio Interiors",
  org_type: "interior_firm",
  segments: ["interior"],
  plan: "pro",
};

const PROJECT = {
  name: "Demo Partner Villa — Host + Interior",
  type: "interior",
  status: "active",
  location: "Banjara Hills, Hyderabad",
  budget: 12_000_000,
};

const emailFor = (prefix, role) => `${prefix}.${role}@sitetrack.test`;
const pwFor = (role) => `Demo-${role.replace(/_/g,"-")}-2026!`;

if (dryRun) {
  console.log("[DRY RUN] Host:", HOST.slug, "Partner:", PARTNER.slug);
  console.log("[DRY RUN] Project:", PROJECT.name, `(${PROJECT.type})`);
  process.exit(0);
}

const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");
await c.query("set session_replication_role = 'replica'");

let hostOrg, partnerOrg, projectId;
try {
  // Upsert orgs
  for (const o of [HOST, PARTNER]) {
    const ex = await c.query(`select id, slug from public.organizations where slug = $1`, [o.slug]);
    if (ex.rowCount) {
      const id = ex.rows[0].id;
      await c.query(`update public.organizations set name=$1, org_type=$2, segments=$3, plan=$4 where id=$5`, [o.name, o.org_type, o.segments, o.plan, id]);
      console.log(`♻️  Org ${o.slug} exists (${id}) — updated`);
      if (o.slug === HOST.slug) hostOrg = { id, ...o }; else partnerOrg = { id, ...o };
    } else {
      const ins = await c.query(
        `insert into public.organizations (id, slug, name, org_type, segments, plan, enabled_modules)
         values (gen_random_uuid(), $1, $2, $3, $4, $5, null) returning id`, [o.slug, o.name, o.org_type, o.segments, o.plan]);
      const id = ins.rows[0].id;
      console.log(`✅ Org ${o.slug} created (${id})`);
      if (o.slug === HOST.slug) hostOrg = { id, ...o }; else partnerOrg = { id, ...o };
      // Ensure subscription row for plan
      await c.query(`insert into public.subscriptions (org_id, plan, status) values ($1, $2, 'active') on conflict (org_id) do update set plan = excluded.plan`, [id, o.plan]);
    }
  }

  // Upsert project
  let pr = await c.query(`select id from public.projects where name = $1 and org_id = $2`, [PROJECT.name, hostOrg.id]);
  if (pr.rowCount) {
    projectId = pr.rows[0].id;
    console.log(`♻️  Project "${PROJECT.name}" exists (${projectId})`);
  } else {
    const ins = await c.query(`insert into public.projects (org_id, name, type, status, location, budget) values ($1,$2,$3,$4,$5,$6) returning id`, [hostOrg.id, PROJECT.name, PROJECT.type, PROJECT.status, PROJECT.location, PROJECT.budget]);
    projectId = ins.rows[0].id;
    console.log(`✅ Project "${PROJECT.name}" created (${projectId})`);
  }

  // Helper to upsert user
  async function upsertUser(email, password, name, role, isStaff=false) {
    let ex = await c.query(`select id from auth.users where email = $1`, [email]);
    let uid;
    if (ex.rowCount) {
      uid = ex.rows[0].id;
      await c.query(`update auth.users set encrypted_password = crypt($1, gen_salt('bf',10)), updated_at = now() where id = $2`, [password, uid]);
    } else {
      const ins = await c.query(
        `insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at)
         values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', $1, crypt($2, gen_salt('bf',10)), now(), '', '', '', '', $3::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, 'authenticated','authenticated', now(), now()) returning id`,
        [email, password, JSON.stringify({ name, role })]);
      uid = ins.rows[0].id;
      await c.query(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values ($1, $2::uuid, jsonb_build_object('sub',$2::text,'email',$1::text,'email_verified',true), 'email', now(), now(), now())`, [email, uid]);
    }
    await c.query(`insert into public.profiles (id, name, role, is_staff) values ($1,$2,$3,$4) on conflict (id) do update set name=excluded.name, role=excluded.role, is_staff=excluded.is_staff`, [uid, name, role, isStaff]);
    return uid;
  }

  const hostAdminEmail = emailFor("demo-host", "admin");
  const hostAdminPw = pwFor("host_admin");
  const hostMemberEmail = emailFor("demo-host", "member");
  const hostMemberPw = pwFor("host_member");
  const partnerAdminEmail = emailFor("demo-interior", "admin");
  const partnerAdminPw = pwFor("partner_admin");
  const partnerMemberEmail = emailFor("demo-interior", "member");
  const partnerMemberPw = pwFor("partner_member");

  const hostAdminId = await upsertUser(hostAdminEmail, hostAdminPw, "Demo Host Admin", "orgadmin");
  const hostMemberId = await upsertUser(hostMemberEmail, hostMemberPw, "Demo Host PM", "pm");
  const partnerAdminId = await upsertUser(partnerAdminEmail, partnerAdminPw, "Demo Interior Admin", "orgadmin");
  const partnerMemberId = await upsertUser(partnerMemberEmail, partnerMemberPw, "Demo Interior Designer", "design_architect_interior");

  // Org memberships
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'admin','active') on conflict (org_id, profile_id) do update set role='admin', status='active', removed_at=null`, [hostOrg.id, hostAdminId]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'pm','active') on conflict (org_id, profile_id) do update set role='pm', status='active', removed_at=null`, [hostOrg.id, hostMemberId]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'admin','active') on conflict (org_id, profile_id) do update set role='admin', status='active', removed_at=null`, [partnerOrg.id, partnerAdminId]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values ($1,$2,'architect','active') on conflict (org_id, profile_id) do update set role='architect', status='active', removed_at=null`, [partnerOrg.id, partnerMemberId]);

  // Project memberships for host
  await c.query(`insert into public.project_members (project_id, profile_id, role) values ($1,$2,'project_admin') on conflict (project_id, profile_id) do update set role='project_admin', removed_at=null`, [projectId, hostAdminId]);
  await c.query(`insert into public.project_members (project_id, profile_id, role) values ($1,$2,'pm') on conflict (project_id, profile_id) do update set role='pm', removed_at=null`, [projectId, hostMemberId]);

  // Partner link: active viewer (idempotent via select)
  const code = `st-demo-${partnerOrg.id.slice(0,8)}`;
  const existingLink = await c.query(`select id from public.project_partner_orgs where project_id = $1 and org_id = $2`, [projectId, partnerOrg.id]);
  if (existingLink.rowCount) {
    await c.query(`update public.project_partner_orgs set scope='viewer', status='active', invite_code=$1, org_name_snapshot=$2 where project_id=$3 and org_id=$4`, [code, partnerOrg.name, projectId, partnerOrg.id]);
  } else {
    await c.query(`insert into public.project_partner_orgs (project_id, org_id, scope, status, invite_code, org_name_snapshot, invited_by) values ($1,$2,'viewer','active',$3,$4,$5)`, [projectId, partnerOrg.id, code, partnerOrg.name, hostAdminId]);
  }
  // Ensure partner members have at least the admin in project_partner_members
  await c.query(`insert into public.project_partner_members (project_id, org_id, profile_id, role, added_by) values ($1,$2,$3,'partner_manager',$3) on conflict (project_id, org_id, profile_id) do nothing`, [projectId, partnerOrg.id, partnerAdminId]);
  await c.query(`insert into public.project_partner_members (project_id, org_id, profile_id, role) values ($1,$2,$3,'partner_member') on conflict (project_id, org_id, profile_id) do nothing`, [projectId, partnerOrg.id, partnerMemberId]);

  console.log(`\n✅ Partner demo seeded:`);
  console.log(`   Host org: ${hostOrg.name} (${hostOrg.slug})`);
  console.log(`   Partner org: ${partnerOrg.name} (${partnerOrg.slug})`);
  console.log(`   Project: ${PROJECT.name} (${projectId}) type=${PROJECT.type}`);
  console.log(`   Link: viewer active, code=${code}`);

  const creds = [
    `# Partner Demo — Credentials`,
    ``,
    `*Generated ${new Date().toISOString()} — DO NOT COMMIT.*`,
    ``,
    `**Host org:** ${hostOrg.name} (${hostOrg.slug}) · **Partner org:** ${partnerOrg.name} (${partnerOrg.slug})`,
    `**Project:** ${PROJECT.name} (${projectId})`,
    ``,
    `| User | Email | Password | Org | Project role |`,
    `|---|---|---|---|---|`,
    `| Host Admin | \`${hostAdminEmail}\` | \`${hostAdminPw}\` | host | project_admin |`,
    `| Host PM | \`${hostMemberEmail}\` | \`${hostMemberPw}\` | host | pm |`,
    `| Partner Admin | \`${partnerAdminEmail}\` | \`${partnerAdminPw}\` | partner | partner_manager |`,
    `| Partner Member | \`${partnerMemberEmail}\` | \`${partnerMemberPw}\` | partner | partner_member |`,
  ].join("\n");
  writeFileSync(join(root, "PARTNER_DEMO_CREDENTIALS.md"), creds);
  console.log(`\n📖 Credentials: PARTNER_DEMO_CREDENTIALS.md`);
} finally {
  await c.query("set session_replication_role = 'origin'");
  await c.end();
}
