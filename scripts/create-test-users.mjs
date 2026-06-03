#!/usr/bin/env node
// SiteTrack Pro — provision per-role test users for founder testing.
//
// Creates ONE auth user per role with a predictable email + password,
// pre-confirmed (no email/OTP step), wired into the existing Demo
// Hyderabad Builder org with the right role in profiles + org_members.
//
// Output:
//   - Inserts into auth.users + public.profiles + public.org_members
//   - Writes TEST_USERS_CREDENTIALS.md at repo root (gitignored)
//   - Prints summary
//
// Usage:
//   node scripts/create-test-users.mjs              # create all 6 main roles
//   node scripts/create-test-users.mjs --role pm    # create only one
//   node scripts/create-test-users.mjs --rotate     # rotate passwords (existing users)
//
// To remove all of them later:
//   node scripts/delete-test-users.mjs
//
// Why DB-direct + disable triggers: the handle_new_signup trigger always
// creates a NEW organization + makes the user orgadmin of it. For test
// users we want predictable role mapping into the EXISTING Demo org. So
// we briefly set session_replication_role = 'replica' while inserting.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);

const args = process.argv.slice(2);
const onlyRole = args.indexOf("--role") !== -1 ? args[args.indexOf("--role") + 1] : null;
const rotate = args.includes("--rotate");

// ── Roster ──────────────────────────────────────────────────────────────────
// 6 main app roles + one staff superadmin. Each test user has a stable
// email + a strong password. Password rotation is supported via --rotate.
//
// Naming: test-<role>@sitetrack.test  (.test is RFC 2606 reserved — won't
// leak to a real domain even if Supabase ever tries to send mail).
// orgRole is the org_members.role value (constraint only allows
// architect|pm|contractor|client|admin). profiles.role is the 18-value
// canonical role for app permissions. orgadmin in profiles maps to
// 'admin' in org_members.
const ROSTER = [
  { role: "superadmin", orgRole: null,         name: "Test Superadmin",  isStaff: true,  joinOrg: false },
  { role: "orgadmin",   orgRole: "admin",      name: "Test OrgAdmin",    isStaff: false, joinOrg: true  },
  { role: "architect",  orgRole: "architect",  name: "Test Architect",   isStaff: false, joinOrg: true  },
  { role: "pm",         orgRole: "pm",         name: "Test PM",          isStaff: false, joinOrg: true  },
  { role: "contractor", orgRole: "contractor", name: "Test Contractor",  isStaff: false, joinOrg: true  },
  { role: "client",     orgRole: "client",     name: "Test Client",      isStaff: false, joinOrg: true  },
];

const passwordFor = (role) => `SiteTrack-Test-${role.replace(/(^.|_.)/g, m => m.replace("_","").toUpperCase())}-2026!`;
const emailFor    = (role) => `test-${role.replace(/_/g,"-")}@sitetrack.test`;

const targets = onlyRole ? ROSTER.filter(r => r.role === onlyRole) : ROSTER;
if (onlyRole && targets.length === 0) {
  console.error(`Unknown role: ${onlyRole}`);
  console.error(`Allowed: ${ROSTER.map(r => r.role).join(", ")}`);
  process.exit(1);
}

// ── DB session ──────────────────────────────────────────────────────────────
const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

// Identify the demo org we'll attach members to.
const orgRes = await c.query(
  `select id, name from public.organizations where slug = 'demo-hyderabad-builder' or name ilike 'Demo%' order by created_at asc limit 1`);
if (!orgRes.rowCount) {
  console.error("❌ No Demo organization found. Seed one first (task #71 in TaskList).");
  process.exit(1);
}
const demoOrg = orgRes.rows[0];

// Disable triggers for the duration of inserts so handle_new_signup doesn't
// spawn extra orgs for each test user. Requires superuser (we connect as postgres).
await c.query("set session_replication_role = 'replica'");

const created = [];
try {
  for (const u of targets) {
    const email = emailFor(u.role);
    const password = passwordFor(u.role);
    const meta = { firm_name: demoOrg.name, name: u.name, plan: "free", role: u.role };

    // Upsert auth.users — rotate just updates password.
    const existing = await c.query("select id, email from auth.users where email = $1", [email]);
    let userId;
    if (existing.rowCount) {
      userId = existing.rows[0].id;
      if (rotate) {
        await c.query(
          `update auth.users set encrypted_password = crypt($1, gen_salt('bf', 10)), updated_at = now() where id = $2`,
          [password, userId],
        );
      }
    } else {
      // gen_salt('bf', 10) — cost 10 matches what Supabase Auth (GoTrue)
      // generates and requires. Default cost=6 will be rejected at login
      // with HTTP 500 "Database error querying schema".
      // Empty strings on token columns (not NULL) — GoTrue treats NULL
      // as "token in use" and fails the lookup.
      // NOTE: confirmed_at is a GENERATED column in Supabase Auth
      // (= COALESCE(email_confirmed_at, phone_confirmed_at)). Do NOT
      // include it in the INSERT — Postgres rejects with a rewrite error.
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

      // Insert into auth.identities so Supabase considers this a real
      // email-provider user (signInWithPassword needs an identity row).
      // Note: pass user_id TWICE — once as UUID, once as TEXT for jsonb —
      // because pg's prepared-statement type inference can't disambiguate.
      await c.query(
        `insert into auth.identities (
           provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
         ) values (
           $1, $2::uuid, jsonb_build_object('sub', $3::text, 'email', $1::text, 'email_verified', true), 'email', now(), now(), now()
         )`,
        [email, userId, userId],
      );
    }

    // Upsert public.profiles with the canonical role.
    await c.query(
      `insert into public.profiles (id, name, role, is_staff)
       values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, role = excluded.role, is_staff = excluded.is_staff`,
      [userId, u.name, u.role, u.isStaff],
    );

    // Join the demo org with the org-side role (skip for superadmin —
    // cross-tenant). Use orgRole, NOT role — org_members CHECK constraint
    // only allows architect|pm|contractor|client|admin.
    if (u.joinOrg) {
      await c.query(
        `insert into public.org_members (org_id, profile_id, role)
         values ($1, $2, $3)
         on conflict (org_id, profile_id) do update set role = excluded.role`,
        [demoOrg.id, userId, u.orgRole],
      );
    }

    created.push({ ...u, email, password, userId });
  }
} finally {
  await c.query("set session_replication_role = 'origin'");
  await c.end();
}

// ── Write creds doc (gitignored via .gitignore TEST_USERS_CREDENTIALS.md) ───
const lines = [];
lines.push(`# SiteTrack Pro — Test User Credentials`);
lines.push("");
lines.push(`*Generated ${new Date().toISOString()} — DO NOT COMMIT.*`);
lines.push("");
lines.push(`**Production app:** https://sitetrack-rakesh.vercel.app`);
lines.push("");
lines.push(`**How to test:**`);
lines.push(`1. Hard reload the app (Ctrl+Shift+R).`);
lines.push(`2. Click **Sign in** tab.`);
lines.push(`3. Switch to the **Password** auth method (not Magic link).`);
lines.push(`4. Use any row below — email + password.`);
lines.push(`5. You'll land in the app as that role. The visible nav + tabs reflect the role's permissions.`);
lines.push("");
lines.push(`**When done testing:**`);
lines.push(`\`\`\`bash`);
lines.push(`node scripts/delete-test-users.mjs`);
lines.push(`\`\`\``);
lines.push(`Wipes all rows from auth.users + profiles + org_members + this file.`);
lines.push("");
lines.push(`## Credentials`);
lines.push("");
lines.push(`| Role | Email | Password | Org membership | Notes |`);
lines.push(`|---|---|---|---|---|`);
for (const u of created) {
  const orgNote = u.joinOrg ? `Demo Hyderabad Builder (as ${u.role})` : "cross-tenant (no org)";
  lines.push(`| **${u.role}** | \`${u.email}\` | \`${u.password}\` | ${orgNote} | ${u.role === "superadmin" ? "is_staff=true, sees admin nav" : ""} |`);
}
lines.push("");
lines.push(`## Role → expected experience`);
lines.push("");
lines.push(`- **superadmin** — sees cross-tenant Admin nav, can impersonate, manage all orgs / users / billing`);
lines.push(`- **orgadmin** — sees Org Admin tier (members, billing, integrations, templates, approvals, features, onboarding)`);
lines.push(`- **architect** — drawing-heavy view, RFI + Submittals + Change Orders`);
lines.push(`- **pm** — full project ops including budget, RA bills, expense approvals`);
lines.push(`- **contractor** — restricted to assigned project tabs (worklogs, attendance, materials)`);
lines.push(`- **client** — read-mostly view, progress + payments + handover docs`);
lines.push("");
lines.push(`Edit \`src/lib/permissions.js\` to see the full role → capability matrix.`);

writeFileSync(join(root, "TEST_USERS_CREDENTIALS.md"), lines.join("\n"));

// Ensure .gitignore covers it
const giPath = join(root, ".gitignore");
const gi = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
if (!/^TEST_USERS_CREDENTIALS\.md$/m.test(gi)) {
  writeFileSync(giPath, gi.replace(/\n*$/, "") + "\nTEST_USERS_CREDENTIALS.md\n");
  console.log("ℹ️  Added TEST_USERS_CREDENTIALS.md to .gitignore");
}

console.log("");
console.log(`✅ Provisioned ${created.length} test user(s):`);
for (const u of created) {
  console.log(`   ${u.role.padEnd(11)} ${u.email.padEnd(38)} ${u.joinOrg ? `→ ${demoOrg.name}` : "(cross-tenant)"}`);
}
console.log("");
console.log("📖 Full credentials at: TEST_USERS_CREDENTIALS.md (gitignored)");
console.log("🧹 Cleanup when done:    node scripts/delete-test-users.mjs");
