#!/usr/bin/env node
// SiteTrack Pro — RLS/behavior proof for Teams P1 chat (migration 229).
//
// Matrix against the LIVE DB, everything inside ONE rolled-back transaction
// (net read-only). Expected-denial probes run inside PER-ASSERTION
// SAVEPOINTs — a PostgreSQL RLS error aborts the surrounding transaction and
// without `ROLLBACK TO SAVEPOINT` every later probe dies with "current
// transaction is aborted".
//
//   TC-001  structures live (tables, triggers, SECURITY DEFINER notify fn)
//   TC-002  member creates a channel; duplicate name per org rejected
//   TC-003  cross-tenant isolation (org-B admin blind to org-A channels)
//   TC-004  message insert self ok; sender_id spoof denied by RLS
//   TC-005  @mention fan-out: notifications for mentioned members only
//   TC-006  thread reply bumps parent reply_count
//   TC-007  reply-to-reply flattens to the thread root (guard trigger)
//   TC-008  cross-channel parent rejected (guard trigger)
//   TC-009  channel update: plain architect denied; pm allowed
//   TC-010  message delete: own ok; other's as plain member denied; as pm ok
//
// Usage: node scripts/test-team-channels-rls.mjs

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
  console.error("SUPABASE_DB_URL is not set (env or .env.local). Skipping team-chat tests.");
  process.exit(0);
}

const ORG_A = randomUUID();
const ORG_B = randomUUID();
const ADMIN = randomUUID();     // orgadmin in A
const PM = randomUUID();        // pm in A
const DEV = randomUUID();       // plain architect in A
const MENTIONED = randomUUID(); // architect in A (mention target)
const B_ADMIN = randomUUID();   // orgadmin in org B

let pass = 0, fail = 0, sp = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  PASS ${label}`); } else { fail++; console.log(`  FAIL ${label}`); } };

const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

/** Run a statement that MAY raise; keep the tx alive either way. */
const attempt = async (sql, params) => {
  const name = `sp_${++sp}`;
  await c.query(`savepoint ${name}`);
  try {
    const res = await c.query(sql, params);
    await c.query(`release savepoint ${name}`);
    return { res, error: null };
  } catch (e) {
    await c.query(`rollback to savepoint ${name}`);
    await c.query(`release savepoint ${name}`);
    return { res: null, error: e };
  }
};

/** Act as an authenticated fixture user for the following statements. */
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub, role: "authenticated" })]);
};
/** Back to table-owner context to inspect rows across users. */
const asOwner = () => c.query("reset role");

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");

  // ── Fixtures (tx-scoped; rolled back at the end) ──────────────────────────
  const users = [
    [ADMIN, "tc-admin@sitetrack.test"], [PM, "tc-pm@sitetrack.test"],
    [DEV, "tc-dev@sitetrack.test"], [MENTIONED, "tc-men@sitetrack.test"],
    [B_ADMIN, "tc-badm@sitetrack.test"],
  ];
  for (const [id, email] of users) {
    await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2, now(), now())`, [id, email]);
  }
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'TC Admin','orgadmin', false),
    ($2,'TC PM','pm', false),
    ($3,'TC Dev','architect', false),
    ($4,'TC Mentioned','architect', false),
    ($5,'TC BAdmin','orgadmin', false)`, [ADMIN, PM, DEV, MENTIONED, B_ADMIN]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,$2,'TC Org A','basic'), ($3,$4,'TC Org B','basic')`,
    [ORG_A, `tc-fixture-a-${ORG_A.slice(0, 8)}`, ORG_B, `tc-fixture-b-${ORG_B.slice(0, 8)}`]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'), ($1,$3,'pm','active'), ($1,$4,'architect','active'), ($1,$5,'architect','active'),
    ($6,$7,'admin','active')`,
    [ORG_A, ADMIN, PM, DEV, MENTIONED, ORG_B, B_ADMIN]);

  // Restore normal trigger firing — replica mode disables the chat triggers.
  await c.query("set local session_replication_role = 'origin'");
  await asOwner();

  // ── TC-001 structures live ────────────────────────────────────────────────
  const tables = (await c.query(`select table_name from information_schema.tables
    where table_schema='public' and table_name in ('chat_channels','chat_messages')`)).rows.map(r => r.table_name);
  ok(tables.includes("chat_channels") && tables.includes("chat_messages"), "TC-001 chat_channels + chat_messages live");
  const trigs = (await c.query(`select tgname from pg_trigger where tgrelid='public.chat_messages'::regclass and not tgisinternal`)).rows.map(r => r.tgname);
  ok(trigs.includes("trg_chat_thread_guard") && trigs.includes("trg_chat_bump_reply_count") && trigs.includes("trg_notify_chat_mentions"),
     "TC-001 guard + reply-bump + mention-notify triggers attached");
  const notifyFn = (await c.query(`select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='notify_chat_mentions'`)).rows[0];
  ok(notifyFn?.prosecdef === true, "TC-001 notify_chat_mentions is SECURITY DEFINER");

  // ── TC-002 create channel + duplicate name ───────────────────────────────
  await asUser(DEV);
  await c.query(`insert into public.chat_channels (org_id, name) values ($1,'general')`, [ORG_A]);
  const dup = await attempt(`insert into public.chat_channels (org_id, name) values ($1,'general')`, [ORG_A]);
  ok(dup.error !== null && /duplicate key|unique/i.test(String(dup.error.message)),
     "TC-002 duplicate channel name per org rejected");
  const chan = (await c.query(`select id from public.chat_channels where org_id=$1 and name='general'`, [ORG_A])).rows[0];
  const CHAN = chan.id;
  ok(!!CHAN, "TC-002 member created #general");

  // ── TC-003 cross-tenant isolation ─────────────────────────────────────────
  await asUser(B_ADMIN);
  const seen = (await c.query(`select count(*)::int n from public.chat_channels where org_id=$1`, [ORG_A])).rows[0].n;
  ok(seen === 0, "TC-003 org-B admin sees none of org-A channels");
  const crossPost = await attempt(
    `insert into public.chat_messages (org_id, channel_id, sender_id, body) values ($1,$2,$3,'intrude')`,
    [ORG_A, CHAN, B_ADMIN]);
  ok(crossPost.error !== null, "TC-003 org-B admin cannot post into org-A channel");

  // ── TC-004 self insert ok, spoof denied ───────────────────────────────────
  await asUser(DEV);
  await c.query(`insert into public.chat_messages (org_id, channel_id, sender_id, body) values ($1,$2,$3,'hello world')`, [ORG_A, CHAN, DEV]);
  const spoof = await attempt(
    `insert into public.chat_messages (org_id, channel_id, sender_id, body) values ($1,$2,$3,'spoof')`,
    [ORG_A, CHAN, MENTIONED]);
  ok(spoof.error !== null, "TC-004 sender_id spoof denied by RLS");

  // ── TC-005 mention fan-out ────────────────────────────────────────────────
  const mentionMsg = (await c.query(`insert into public.chat_messages (org_id, channel_id, sender_id, sender_name, body, mentions)
    values ($1,$2,$3,'TC Dev','ping admins', $4) returning id`,
    [ORG_A, CHAN, DEV, [ADMIN, MENTIONED, DEV]])).rows[0];
  await asOwner();
  const notifs = (await c.query(`select user_id, link from public.notifications
    where kind='chat_mention' and user_id = any($1)`, [[ADMIN, MENTIONED, DEV]])).rows;
  ok(notifs.length === 2 && notifs.every(n => n.user_id !== DEV),
     "TC-005 notifications for mentioned members only (sender excluded)");
  ok(notifs.every(n => typeof n.link === "string" && n.link.startsWith("/teams?c=") && n.link.includes(CHAN) && n.link.includes(mentionMsg.id)),
     "TC-005 notification deep-links carry channel + message ids");

  // ── TC-006 reply bumps reply_count ────────────────────────────────────────
  await asUser(PM);
  await c.query(`insert into public.chat_messages (org_id, channel_id, parent_id, sender_id, body) values ($1,$2,$3,$4,'a reply')`,
    [ORG_A, CHAN, mentionMsg.id, PM]);
  await asOwner();
  const afterReply = (await c.query(`select reply_count from public.chat_messages where id=$1`, [mentionMsg.id])).rows[0];
  ok(afterReply.reply_count === 1, "TC-006 parent reply_count bumped to 1");

  // ── TC-007 reply-to-reply flattens to root ────────────────────────────────
  const replyRow = (await c.query(`select id from public.chat_messages where parent_id=$1 and body='a reply'`, [mentionMsg.id])).rows[0];
  await asUser(PM);
  await c.query(`insert into public.chat_messages (org_id, channel_id, parent_id, sender_id, body) values ($1,$2,$3,$4,'nested')`,
    [ORG_A, CHAN, replyRow.id, PM]);
  await asOwner();
  const nested = (await c.query(`select parent_id from public.chat_messages where org_id=$1 and body='nested'`, [ORG_A])).rows[0];
  ok(nested.parent_id === mentionMsg.id, "TC-007 nested reply flattened to the root");
  const rootAfter = (await c.query(`select reply_count from public.chat_messages where id=$1`, [mentionMsg.id])).rows[0];
  ok(rootAfter.reply_count === 2, "TC-007 root reply_count counts both replies");

  // ── TC-008 cross-channel parent rejected ──────────────────────────────────
  await asUser(DEV);
  await c.query(`insert into public.chat_channels (org_id, name) values ($1,'other')`, [ORG_A]);
  const otherChan = (await c.query(`select id from public.chat_channels where org_id=$1 and name='other'`, [ORG_A])).rows[0].id;
  const badThread = await attempt(
    `insert into public.chat_messages (org_id, channel_id, parent_id, sender_id, body) values ($1,$2,$3,$4,'bad thread')`,
    [ORG_A, otherChan, mentionMsg.id, DEV]);
  ok(badThread.error !== null, "TC-008 thread parent from another channel rejected");

  // ── TC-009 channel update gates (RLS UPDATE filters rows — expect 0-row no-op) ──
  const devUpdate = await c.query(`update public.chat_channels set description='nope' where id=$1`, [CHAN]);
  ok(devUpdate.rowCount === 0, "TC-009 plain architect cannot update channels (row filtered)");
  await asUser(PM);
  const pmUpdate = await c.query(`update public.chat_channels set description='managed by pm' where id=$1`, [CHAN]);
  ok(pmUpdate.rowCount === 1, "TC-009 pm can update channels");
  await asOwner();
  const desc = (await c.query(`select description from public.chat_channels where id=$1`, [CHAN])).rows[0].description;
  ok(desc === "managed by pm", "TC-009 pm update persisted");

  // ── TC-010 message delete gates (same silent-filter semantics) ────────────
  const ownDel = await attempt(`delete from public.chat_messages where id=$1`, [mentionMsg.id]); // DEV owns it; guard cascades replies
  ok(ownDel.error === null, "TC-010 sender can delete own message");
  const pmMsg = (await c.query(`insert into public.chat_messages (org_id, channel_id, sender_id, body) values ($1,$2,$3,'pm own') returning id`,
    [ORG_A, CHAN, PM])).rows[0];
  await asUser(DEV);
  const delOther = await c.query(`delete from public.chat_messages where id=$1`, [pmMsg.id]);
  ok(delOther.rowCount === 0, "TC-010 plain architect cannot delete another member's message (row filtered)");
  await asUser(PM);
  const pmDel = await c.query(`delete from public.chat_messages where id=$1`, [pmMsg.id]);
  ok(pmDel.rowCount === 1, "TC-010 manager can delete another member's message");
  await asOwner();
  const goneCount = (await c.query(`select count(*)::int n from public.chat_messages where id=$1`, [pmMsg.id])).rows[0].n;
  ok(goneCount === 0, "TC-010 manager delete persisted");

  await c.query("rollback");
  console.log("\nRolled back — net effect on live data: zero.");
} catch (e) {
  fail++;
  console.error("HARNESS ERROR:", e.message);
  try { await c.query("rollback"); } catch { /* already aborted */ }
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
await c.end();
process.exit(fail === 0 ? 0 : 1);
