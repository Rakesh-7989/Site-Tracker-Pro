#!/usr/bin/env node
// SiteTrack Pro — RLS proof for project lifecycle enforcement (migration 223).
//
// Acts as non-superadmin users (via SET LOCAL ROLE authenticated + a JWT sub
// claim) and proves the server-side lifecycle boundary, all inside a
// rolled-back tx (READ-ONLY net effect):
//   BIZ-001  illegal status transitions are rejected (e.g. paused->on_hold).
//   BIZ-002  terminal states (completed/cancelled) are immutable except
//            reactivate -> active.
//   BIZ-003  archiving requires an org admin (identity orgadmin OR org-tier
//            admin OR superadmin) — a plain pm cannot set archived_at.
//   BIZ-004  restoring requires the same org-admin gate.
//   BIZ-005  legal transitions by ordinary members still work (no over-block).
//   BIZ-006  non-lifecycle column updates (rename) are NOT blocked by the
//            trigger.
//   BIZ-007  (migration 256) every LEGAL lifecycle transition appends exactly
//            one immutable audit_log_v2 row (action UPDATE / resource project
//            / before-after jsonb) AND one event_outbox row
//            (project.status_changed | project.archived | project.restored,
//            project_id + to_project_members:true) — while non-lifecycle
//            updates (rename) emit neither.
//
// Usage: node scripts/test-project-lifecycle-rls.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

let DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  try {
    const env = Object.fromEntries(
      readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)
        .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
        .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]));
    DB_URL = env.SUPABASE_DB_URL;
  } catch { /* no .env.local — rely on the env var */ }
}
if (!DB_URL) {
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping RLS tests.");
  process.exit(0);
}

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("reset role");

const U_A = randomUUID(); // orgadmin (identity) in org A
const U_M = randomUUID(); // ordinary member (pm identity) in org A
const U_T = randomUUID(); // architect identity but org-tier ADMIN (role='admin') in org A
const U_S = randomUUID(); // superadmin
const A = randomUUID();
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  🟢 ${label}`); } else { fail++; console.log(`  🔴 ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
// Pre-seed cleanup + fixture seeding run as postgres (owner) directly.
async function tryUpdate(sql, params) {
  try {
    await c.query("savepoint sp");
    const r = await c.query(sql, params);
    await c.query("release savepoint sp");
    // RLS blocks by silently filtering rows — 0 rows updated = denied.
    // Trigger blocks by raising an exception — caught below = denied.
    return r.rowCount > 0;
  } catch { await c.query("rollback to savepoint sp"); return false; }
}

// Pre-clean leftovers from a prior aborted run (committed, outside the tx).
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };
await clean(`delete from public.projects where org_id in ($1)`, [A]);
await clean(`delete from public.project_members where profile_id in ($2,$3,$4,$5) or project_id in (select id from public.projects where org_id in ($1))`, [A, U_A, U_M, U_T, U_S]);
await clean(`delete from public.org_members where org_id in ($1) or profile_id in ($2,$3,$4,$5)`, [A, U_A, U_M, U_T, U_S]);
await clean(`delete from public.organizations where id in ($1)`, [A]);
await clean(`delete from public.profiles where id in ($2,$3,$4,$5)`, [A, U_A, U_M, U_T, U_S]);
await clean(`delete from auth.users where id in ($2,$3,$4,$5)`, [A, U_A, U_M, U_T, U_S]);

try {
  await c.query("begin");
  // Seed with triggers OFF so handle_new_signup doesn't auto-create orgs.
  await c.query("set local session_replication_role = 'replica'");
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','plc-admin@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','plc-member@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','plc-tier@sitetrack.test', now(), now()),
           ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','plc-super@sitetrack.test', now(), now())`, [U_A, U_M, U_T, U_S]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'Lifecycle Admin','orgadmin', false),
    ($2,'Lifecycle Member','pm', false),
    ($3,'Lifecycle Tier Admin','architect', false),
    ($4,'Lifecycle Super','superadmin', true)`, [U_A, U_M, U_T, U_S]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,'plc-test-org','Plc Test Org','enterprise')`, [A]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'),
    ($1,$3,'pm','active'),
    ($1,$4,'admin','active')`, [A, U_A, U_M, U_T]); // U_T = architect identity, org-tier admin
  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  // Create the fixture project as owner (postgres), then prove boundaries.
  await c.query(`insert into public.projects (id, org_id, name, status) values ($1,$2,'Lifecycle Proj','active')`, [randomUUID(), A]);
  const P = (await c.query(`select id from public.projects where org_id=$1 and name='Lifecycle Proj'`, [A])).rows[0].id;
  // Give the pm + tier-admin an explicit membership row so the generic UPDATE
  // RLS (update_project_architect) passes — the lifecycle trigger is then the
  // ONLY gate under test (BIZ-003/004 must be rejected by the trigger, not RLS).
  await c.query(`insert into public.project_members (project_id, profile_id, role) values
    ($1,$2,'pm'), ($1,$3,'pm')`, [P, U_M, U_T]);

  // Sanity: the trigger exists.
  const trg = (await c.query(`select 1 from pg_trigger where tgrelid='public.projects'::regclass and tgname='trg_projects_lifecycle_guard'`)).rows.length;
  ok(trg === 1, "migration 223 trigger trg_projects_lifecycle_guard exists");

  // ── BIZ-001: illegal transitions rejected ──────────────────────────────
  await asUser(U_A);
  ok(await tryUpdate(`update public.projects set status='paused', updated_at=now() where id=$1`, [P]),
     "orgadmin CAN move active -> paused (legal)");
  ok(!(await tryUpdate(`update public.projects set status='on_hold', updated_at=now() where id=$1`, [P])),
     "orgadmin CANNOT move paused -> on_hold (BIZ-001)");
  ok(!(await tryUpdate(`update public.projects set status='deactivated', updated_at=now() where id=$1`, [P])),
     "orgadmin CANNOT move paused -> deactivated (BIZ-001)");
  ok(await tryUpdate(`update public.projects set status='active', updated_at=now() where id=$1`, [P]),
     "orgadmin CAN reactivate paused -> active");

  // ── BIZ-002: terminal states immutable except reactivate ───────────────
  ok(await tryUpdate(`update public.projects set status='completed', updated_at=now() where id=$1`, [P]),
     "orgadmin CAN move active -> completed (legal)");
  ok(!(await tryUpdate(`update public.projects set status='paused', updated_at=now() where id=$1`, [P])),
     "orgadmin CANNOT move completed -> paused (BIZ-002 terminal immutable)");
  ok(!(await tryUpdate(`update public.projects set status='cancelled', updated_at=now() where id=$1`, [P])),
     "orgadmin CANNOT move completed -> cancelled (BIZ-002 terminal->terminal)");
  ok(await tryUpdate(`update public.projects set status='active', updated_at=now() where id=$1`, [P]),
     "orgadmin CAN reactivate completed -> active (only legal terminal exit)");

  // ── BIZ-003/004: archive/restore require org-admin ─────────────────────
  await asUser(U_M); // ordinary pm member
  ok(!(await tryUpdate(`update public.projects set archived_at=now(), updated_at=now() where id=$1`, [P])),
     "pm CANNOT archive (BIZ-003)");
  ok(await tryUpdate(`update public.projects set status='paused', updated_at=now() where id=$1`, [P]),
     "pm CAN still do a legal status transition (active->paused, no over-block)");
  ok(!(await tryUpdate(`update public.projects set status='on_hold', updated_at=now() where id=$1`, [P])),
     "pm CANNOT do an illegal status transition (paused->on_hold, BIZ-001 applies to all)");

  await asUser(U_A); // orgadmin archives
  ok(await tryUpdate(`update public.projects set archived_at=now(), updated_at=now() where id=$1`, [P]),
     "orgadmin CAN archive (BIZ-003)");
  ok(await tryUpdate(`update public.projects set status='active', updated_at=now() where id=$1`, [P]),
     "orgadmin CAN change status while archived (not frozen)");
  await asUser(U_M);
  ok(!(await tryUpdate(`update public.projects set archived_at=null, updated_at=now() where id=$1`, [P])),
     "pm CANNOT restore (BIZ-004)");
  await asUser(U_A);
  ok(await tryUpdate(`update public.projects set archived_at=null, updated_at=now() where id=$1`, [P]),
     "orgadmin CAN restore (BIZ-004)");

  // ── org-tier admin (architect identity, org_members role='admin') ──────
  await asUser(U_T);
  ok(await tryUpdate(`update public.projects set archived_at=now(), updated_at=now() where id=$1`, [P]),
     "org-tier admin (has_org_tier) CAN archive");
  ok(await tryUpdate(`update public.projects set archived_at=null, updated_at=now() where id=$1`, [P]),
     "org-tier admin (has_org_tier) CAN restore");

  // ── superadmin bypass ──────────────────────────────────────────────────
  await asUser(U_S);
  ok(await tryUpdate(`update public.projects set status='cancelled', updated_at=now() where id=$1`, [P]),
     "superadmin CAN move active -> cancelled (superadmin overrides)");
  ok(await tryUpdate(`update public.projects set archived_at=now(), updated_at=now() where id=$1`, [P]),
     "superadmin CAN archive");

  // ── BIZ-006: non-lifecycle column updates not blocked ──────────────────
  await asUser(U_M);
  ok(await tryUpdate(`update public.projects set name='Lifecycle Proj v2' where id=$1`, [P]),
     "pm CAN rename a project (non-lifecycle column not blocked)");

  // ── BIZ-007: legal transitions emit audit + outbox events, renames don't ─
  const qAud = (sql, extra = []) => c.query(sql, [P, ...extra]);

  await asUser(U_A);
  ok(await tryUpdate(`update public.projects set status='active', updated_at=now() where id=$1`, [P]),
     "setup: orgadmin reactivates cancelled -> active (events baseline)");

  const beforeAuditAll  = (await qAud(`select count(*)::int n from public.audit_log_v2 where project_id=$1`)).rows[0].n;
  const beforeEventsAll = (await qAud(`select count(*)::int n from public.event_outbox where project_id=$1`)).rows[0].n;

  await asUser(U_A);
  ok(await tryUpdate(`update public.projects set status='paused', updated_at=now() where id=$1`, [P]),
     "orgadmin CAN active -> paused (events checkpoint)");
  const afterAuditAll  = (await qAud(`select count(*)::int n from public.audit_log_v2 where project_id=$1`)).rows[0].n;
  const afterEventsAll = (await qAud(`select count(*)::int n from public.event_outbox where project_id=$1`)).rows[0].n;
  ok(afterAuditAll === beforeAuditAll + 1, "legal status transition appends exactly 1 immutable audit row");
  ok(afterEventsAll === beforeEventsAll + 1, "legal status transition appends exactly 1 outbox event");

  const auditRow = (await qAud(`select message, action, resource, resource_id,
        before->>'status' as bs, after->>'status' as ast, actor_id
    from public.audit_log_v2
    where project_id=$1 and action='UPDATE' and resource='project'
      and before->>'status'='active' and after->>'status'='paused'
      and actor_id=$2
    order by ts desc limit 1`, [U_A])).rows[0];
  ok(auditRow && auditRow.resource_id === String(P) && auditRow.actor_id === U_A
     && auditRow.message === 'Project status changed: active -> paused',
     "audit row: UPDATE project <id>, actor = current user, message describes transition");

  const evRow = (await qAud(`select type, payload->>'kind' as kind,
         (payload->>'to_project_members')::boolean as tpm, status
    from public.event_outbox
    where project_id=$1 and type='project.status_changed'
    order by created_at desc, id desc limit 1`)).rows[0];
  ok(evRow && evRow.kind === evRow.type && evRow.tpm === true && evRow.status === 'pending',
     "outbox event: project.status_changed, project-member fan-out, awaits per-minute worker");

  // archive/restore are typed distinctly
  const beforeArch = (await qAud(`select count(*)::int n from public.event_outbox where project_id=$1 and type='project.archived'`)).rows[0].n;
  const beforeRest = (await qAud(`select count(*)::int n from public.event_outbox where project_id=$1 and type='project.restored'`)).rows[0].n;
  const beforeArchAudit = (await qAud(`select count(*)::int n from public.audit_log_v2
       where project_id=$1 and before->>'archived_at' is null and after->>'archived_at' is not null`)).rows[0].n;
  await asUser(U_A);
  ok(await tryUpdate(`update public.projects set archived_at=null, updated_at=now() where id=$1`, [P]),
     "orgadmin CAN restore (events checkpoint)");
  ok((await qAud(`select count(*)::int n from public.event_outbox where project_id=$1 and type='project.restored'`)).rows[0].n === beforeRest + 1,
     "restore emits exactly 1 project.restored event");
  ok(await tryUpdate(`update public.projects set archived_at=now(), updated_at=now() where id=$1`, [P]),
     "orgadmin CAN archive (events checkpoint)");
  ok((await qAud(`select count(*)::int n from public.event_outbox where project_id=$1 and type='project.archived'`)).rows[0].n === beforeArch + 1,
     "archive emits exactly 1 project.archived event");
  const afterArchAudit = (await qAud(`select count(*)::int n from public.audit_log_v2
       where project_id=$1 and before->>'archived_at' is null and after->>'archived_at' is not null`)).rows[0].n;
  ok(afterArchAudit === beforeArchAudit + 1,
     "archive appends exactly 1 uniquely-typed audit row (archived_at null -> set)");

  // non-lifecycle updates emit nothing
  const beforeAudit2  = (await qAud(`select count(*)::int n from public.audit_log_v2 where project_id=$1`)).rows[0].n;
  const beforeEvents2 = (await qAud(`select count(*)::int n from public.event_outbox where project_id=$1`)).rows[0].n;
  await asUser(U_M);
  ok(await tryUpdate(`update public.projects set name='Lifecycle Proj v3' where id=$1`, [P]),
     "pm CAN rename a project (non-lifecycle column not blocked)");
  ok((await qAud(`select count(*)::int n from public.audit_log_v2 where project_id=$1`)).rows[0].n === beforeAudit2,
     "rename appends NO audit row");
  ok((await qAud(`select count(*)::int n from public.event_outbox where project_id=$1`)).rows[0].n === beforeEvents2,
     "rename publishes NO outbox event");

  await c.query("rollback");
  console.log(`\nProject lifecycle RLS matrix: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("Lifecycle matrix failed:", e.message);
  process.exit(1);
}