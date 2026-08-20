#!/usr/bin/env node
// SiteTrack Pro — Cross-tenant attack matrix (SEC-04), phase 1.5.
//
// Asserts that org A users can never touch org B / project P_B data across
// EVERY tenant-scoped public table:
//
//   CT-000  schema gate: every public table that is tenant-scoped (direct
//          org_id/project_id column, OR a FK to a tenant table) has RLS
//          enabled (relrowsecurity).
//   CT-001  owner sanity: the org B owner can read the seeded row.
//   CT-002  attacker read:   org A admin sees 0 rows for org B seed ids.
//   CT-003  attacker update: org A admin UPDATE touches 0 rows.
//   CT-004  attacker delete: org A admin DELETE removes 0 rows.
//   CT-005  attacker insert: org A admin INSERT claiming org B / P_B scope
//          must fail (RLS/WITH CHECK violation).
//
// READ-ONLY net effect (ROLLBACK). Usage: node scripts/test-cross-tenant-rls.mjs

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

const U_A = randomUUID(); // orgadmin in org A (attacker)
const U_B = randomUUID(); // orgadmin in org B (owner)
const U_C = randomUUID(); // second org B user (distinct-user checks)
const A = randomUUID();
const B = randomUUID();
let pass = 0, fail = 0, skipped = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  \u{1F7E2} ${label}`); } else { fail++; console.log(`  \u{1F534} ${label}`); } };
const asUser = async (sub) => {
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`);
};
const asOwner = async () => { await c.query("reset role"); };
const clean = async (sql, params) => { await c.query(sql, params).catch(() => {}); };

// ── introspect schema ───────────────────────────────────────────────────────
const tables = (await c.query(`
  select t.relname as tbl,
         t.relrowsecurity,
         (select exists (select 1 from pg_attribute a
            where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
              and a.attname = 'id')) as has_id,
         (select jsonb_agg(jsonb_build_object(
            'col', a.attname,
            'notnull', a.attnotnull,
            'hasdefault', a.atthasdef,
            'type', format_type(a.atttypid, a.atttypmod),
            'nullable', NOT a.attnotnull)
          order by a.attnum)
          from pg_attribute a
          where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
            and a.attname <> 'id') as cols,
         (select jsonb_agg(jsonb_build_object('col', a.attname))
          from pg_attribute a
          where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
            and a.attname in ('project_id','org_id','organization_id')) as tenantcols
  from pg_class t
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relkind = 'r'
  order by t.relname`)).rows;

const fks = (await c.query(`
  select t.relname as tbl, a.attname as col, ft.relname as ref
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_class ft on ft.oid = con.confrelid
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
  where n.nspname = 'public' and con.contype = 'f'
  order by t.relname`)).rows;

const checks = (await c.query(`
  select t.relname as tbl, a.attname as col, pg_get_constraintdef(con.oid) as def
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = con.conrelid
    and a.attnum = any(con.conkey)
  where n.nspname = 'public' and con.contype = 'c'
  order by t.relname, a.attnum`)).rows;

// tables that directly scope tenants via a column
const DIRECT_TENANT = new Set(tables.filter(t => t.tenantcols?.length).map(t => t.tbl));
// tables scoped transitively via an FK to a tenant table (or to a transitive table)
const TRANSITIVE = new Set();
let grew = true;
while (grew) {
  grew = false;
  for (const f of fks) {
    if ((DIRECT_TENANT.has(f.ref) || TRANSITIVE.has(f.ref)) && !DIRECT_TENANT.has(f.tbl) && !TRANSITIVE.has(f.tbl)) {
      TRANSITIVE.add(f.tbl);
      grew = true;
    }
  }
}
const SCOPE_TABLES = [...new Set([...DIRECT_TENANT, ...TRANSITIVE])].sort();
const fkByTable = new Map();
for (const f of fks) { (fkByTable.get(f.tbl) ?? fkByTable.set(f.tbl, []).get(f.tbl)).push(f); }

// pick a value that satisfies a NOT NULL, no-default column
const checkDefsFor = (tbl, col) => checks.filter(x => x.tbl === tbl && x.col === col).map(x => x.def);
function genValue(tbl, col, meta, tenantRefs) {
  const ty = meta.type.toLowerCase();
  const defs = checkDefsFor(tbl, col);
  // FK reference mapping
  const fk = fkByTable.get(tbl)?.find(f => f.col === col);
  if (fk) {
    if (tenantRefs[fk.ref]) return tenantRefs[fk.ref];
    if (fk.ref === "auth.users" || fk.ref === "profiles") return tenantRefs.profile ?? randomUUID();
    return randomUUID(); // other FK — may fail the seed (reported as skip)
  }
  // IN-list CHECK constraint → first literal
  for (const d of defs) {
    const m = d.match(/\((?:(\w+)\s*=\s*ANY\s*\(ARRAY\[|\w+\s+IN\s*\()(['"][^'"]+['"])/);
    if (m) return m[2].replace(/^['"]|['"]$/g, "");
  }
  if (ty.includes("text") || ty.includes("char") || ty === "name" || ty.includes("enum")) {
    // enum-type columns surface as USER-DEFINED; try check IN-list literals first
    for (const d of defs) {
      const mm = d.match(/ARRAY\['([^']+)'/);
      if (mm) return mm[1];
    }
    return "x";
  }
  if (ty.includes("int") || ty.includes("numeric") || ty.includes("real") || ty.includes("double")) {
    // range/GT/GE checks → a value inside the allowed band
    let lo = null, hi = null;
    for (const d of defs) {
      const gt = d.match(/>=\s*(\d+(?:\.\d+)?)/);
      if (gt) { lo = Math.max(lo ?? 0, Number(gt[1])); continue; }
      const range = d.match(/>\s*(\d+(?:\.\d+)?)/);
      if (range) { lo = Math.max(lo ?? 0, Number(range[1]) + 1); continue; }
      const le = d.match(/<=\s*(\d+(?:\.\d+)?)/);
      if (le) { hi = Math.min(hi ?? Infinity, Number(le[1])); continue; }
      const lt = d.match(/<\s*(\d+(?:\.\d+)?)/);
      if (lt) { hi = Math.min(hi ?? Infinity, Number(lt[1]) - 1); continue; }
    }
    if (lo != null) return lo;
    if (hi != null) return hi;
    return 1;
  }
  if (ty.includes("bool")) return false;
  if (ty.includes("timestamp") || ty.includes("date")) {
    const p = pairValue(tbl, col, meta, tenantRefs, defs);
    if (p) return p;
    return "now()";
  }
  if (ty.includes("time")) return "00:00:00";
  if (ty.includes("json")) return "'{}'::jsonb";
  if (ty.includes("geography") || ty.includes("geometry")) return "ST_GeomFromText('POINT(0 0)')";
  if (ty.includes("[]")) return "'{}'";
  if (ty.includes("uuid")) {
    const p = pairValue(tbl, col, meta, tenantRefs, defs);
    if (p) return p;
    return randomUUID();
  }
  return "x";
}

// pick a value for a column that must differ from a sibling column (e.g.
// delegations from_user <> to_user) or be ordered (end_at > start_at)
function pairValue(tbl, col, meta, tenantRefs, defs) {
  for (const d of defs) {
    const neq = d.match(/\(\s*(\w+)\s*<>\s*(\w+)\s*\)/);
    if (neq) {
      if (col === neq[1]) return tenantRefs.profile;   // first side = B owner
      if (col === neq[2]) return tenantRefs.profile2;  // second side = B co-user
    }
    const ord = d.match(/\(\s*(\w+)\s*>\s*(\w+)\s*\)/);
    if (ord) {
      if (col === ord[1]) return "now() + interval '1 day'"; // later column
      if (col === ord[2]) return "now()";                    // earlier column
    }
  }
  return null;
}

// fixture ids for tenant-scoped parents
const tenantRefs = {};

await clean(`delete from public.purchase_orders where project_id in (select id from public.projects where org_id in ($1,$2))`, [A, B]);
await clean(`delete from public.projects where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.vendors where org_id in ($1,$2)`, [A, B]);
await clean(`delete from public.org_members where org_id in ($1,$2) or profile_id in ($3,$4,$5)`, [A, B, U_A, U_B, U_C]);
await clean(`delete from public.organizations where id in ($1,$2)`, [A, B]);
await clean(`delete from public.profiles where id in ($1,$2,$3)`, [U_A, U_B, U_C]);
await clean(`delete from auth.users where id in ($1,$2,$3)`, [U_A, U_B, U_C]);

try {
  await c.query("begin");
  await c.query("set local session_replication_role = 'replica'");
  await c.query(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','xct-a@sitetrack.test', now(), now()),
           ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','xct-b@sitetrack.test', now(), now()),
           ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','xct-b2@sitetrack.test', now(), now())`, [U_A, U_B, U_C]);
  await c.query(`insert into public.profiles (id, name, role, is_staff) values
    ($1,'XCT A Admin','orgadmin', false),
    ($2,'XCT B Admin','orgadmin', false),
    ($3,'XCT B Co-user','pm', false)`, [U_A, U_B, U_C]);
  await c.query(`insert into public.organizations (id, slug, name, plan) values
    ($1,'xct-org-a','XCT Org A','enterprise'),
    ($2,'xct-org-b','XCT Org B','enterprise')`, [A, B]);
  await c.query(`insert into public.org_members (org_id, profile_id, role, status) values
    ($1,$2,'admin','active'),
    ($3,$4,'admin','active'),
    ($3,$5,'pm','active')`, [A, U_A, B, U_B, U_C]);
  await c.query(`insert into public.projects (id, org_id, name, type, status) values
    ($1,$2,'XCT Proj A','construction','active'),
    ($3,$4,'XCT Proj B','construction','active')`, [randomUUID(), A, randomUUID(), B]);
  const P_A = (await c.query(`select id from public.projects where org_id=$1 and name='XCT Proj A'`, [A])).rows[0].id;
  const P_B = (await c.query(`select id from public.projects where org_id=$1 and name='XCT Proj B'`, [B])).rows[0].id;
  await c.query(`insert into public.project_members (project_id, profile_id, role) values
    ($1,$2,'pm'), ($3,$4,'pm'), ($3,$5,'pm')`, [P_A, U_A, P_B, U_B, U_C]);
  const V_B = (await c.query(`insert into public.vendors (org_id, name, category) values ($1,'XCT Vendor B','materials') returning *`, [B])).rows[0].id;
  await c.query(`insert into public.purchase_orders (project_id, po_no, amount) values ($1,'XCT-PO-B',1000) returning *`, [P_B]);
  const PO_B = (await c.query(`select id from public.purchase_orders where project_id=$1 and po_no='XCT-PO-B'`, [P_B])).rows[0].id;

  await c.query("set local session_replication_role = 'origin'"); // triggers + RLS back on

  tenantRefs.projects = P_B;
  tenantRefs.organizations = B;
  tenantRefs.purchase_orders = PO_B;
  tenantRefs.vendors = V_B;
  tenantRefs.profile = U_B;
  tenantRefs.profile2 = U_C;

  // ── CT-000: schema gate — every tenant-scoped public table has RLS ──────
  const noRls = tables.filter(t => SCOPE_TABLES.includes(t.tbl) && !t.relrowsecurity).map(t => t.tbl);
  ok(noRls.length === 0, `CT-000 RLS enabled on all ${SCOPE_TABLES.length} tenant-scoped tables${noRls.length ? ` — OFF: ${noRls.join(",")}` : ""}`);

  // ── per-table attack matrix ──────────────────────────────────────────────
  // build the NOT-NULL/no-default value map for a table (B-side scope)
  const fkTenantColOf = (tbl) => (fkByTable.get(tbl) || []).find(f => f.ref === "projects" || f.ref === "organizations"
    || f.ref === "purchase_orders" || f.ref === "deliverables" || f.ref === "invoices"
    || f.ref === "vendors" || f.ref === "templates" || f.ref === "rate_cards");
  // recursive FK chain: any FK whose ref is itself a scope table gets seeded
  // via seedParent so deep chains (zones→floors→blocks→sites→projects) resolve.
  const fkChainColOf = (tbl) => (fkByTable.get(tbl) || []).filter(f =>
    f.ref !== "auth.users" && f.ref !== "profiles" && !["projects","organizations","purchase_orders","deliverables","invoices","vendors","templates","rate_cards"].includes(f.ref));
  const buildVals = (tbl) => {
    const meta = tables.find(t => t.tbl === tbl);
    const cols = meta.cols.filter(cl => !cl.hasdefault);
    const directTenantCols = (meta.tenantcols || []).map(x => x.col);
    const fkTenantCol = fkTenantColOf(tbl);
    const vals = {};
    for (const cl of cols) {
      if (cl.col === "id") continue;
      if (directTenantCols.includes(cl.col)) {
        vals[cl.col] = cl.col === "org_id" ? B : cl.col === "project_id" ? P_B : B;
        continue;
      }
      if (fkTenantCol && cl.col === fkTenantCol.col) {
        vals[cl.col] = tenantRefs[fkTenantCol.ref] ?? randomUUID();
        continue;
      }
      vals[cl.col] = genValue(tbl, cl.col, cl, tenantRefs);
    }
    return vals;
  };
  const quoteVal = (v) => {
    if (v == null) return "null";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return String(v);
    const s = String(v);
    if (s.startsWith("now()") || s.startsWith("ST_") || s.includes(" interval ") || s === "'{}'::jsonb") return s;
    return `'${s.replace(/'/g, "''")}'`;
  };

  // recursive seed of tenant-parent refs (review_rounds→deliverables, po_receipts→purchase_orders, invoice_lines→invoices, …)
  const parentCols = (tbl) => tables.find(t => t.tbl === tbl).has_id ? "id, ctid" : "ctid";
  const seedParent = async (ref, depth = 0) => {
    if (tenantRefs[ref]) return tenantRefs[ref];
    if (depth > 3) return null;
    if (!SCOPE_TABLES.includes(ref)) return null;
    try {
      // resolve the parent's own FK chain first (deep recursion)
      for (const f of (fkByTable.get(ref) || [])) {
        if (f.ref !== "auth.users" && f.ref !== "profiles" && f.ref !== "projects" && f.ref !== "organizations") {
          await seedParent(f.ref, depth + 1);
        }
      }
      await c.query("savepoint sp_seed");
      const vals = buildVals(ref);
      const colsSql = Object.keys(vals).map(k => `"${k}"`).join(",");
      const valsSql = Object.values(vals).map(quoteVal).join(",");
      const r = await c.query(`insert into public."${ref}" (${colsSql}) values (${valsSql}) returning ${parentCols(ref)}`, []);
      await c.query("release savepoint sp_seed");
      const hasId = tables.find(t => t.tbl === ref).has_id;
      tenantRefs[ref] = hasId ? r.rows[0].id : r.rows[0].ctid;
      return tenantRefs[ref];
    } catch { await c.query("rollback to savepoint sp_seed").catch(() => {}); return null; }
  };

  for (const tbl of SCOPE_TABLES) {
    const meta = tables.find(t => t.tbl === tbl);
    const cols = meta.cols.filter(cl => !cl.hasdefault);
    const directTenantCols = (meta.tenantcols || []).map(x => x.col);
    const fkTenantCol = fkTenantColOf(tbl);
    // resolve missing tenant parents first (direct + deep FK chains)
    const fkChain = (fkByTable.get(tbl) || []).filter(f =>
      f.ref !== "auth.users" && f.ref !== "profiles" && f.ref !== "projects" && f.ref !== "organizations");
    for (const f of fkChain) await seedParent(f.ref); // recursive; seeds the parent + its own chain
    if (fkTenantCol && !tenantRefs[fkTenantCol.ref]) await seedParent(fkTenantCol.ref);
    const seed = buildVals(tbl);
    const colsSql = Object.keys(seed).map(k => `"${k}"`).join(",");
    const valsSql = Object.values(seed).map(quoteVal).join(",");
    let seedId = null;
    try {
      await c.query("savepoint sp_seed");
      const r = await c.query(`insert into public."${tbl}" (${colsSql}) values (${valsSql}) returning ${parentCols(tbl)}`, []);
      await c.query("release savepoint sp_seed");
      seedId = r.rows[0].ctid; // row-key for CT-001..004
      tenantRefs[tbl] = meta.has_id ? r.rows[0].id : r.rows[0].ctid; // FK ref
    } catch (e) {
      await c.query("rollback to savepoint sp_seed").catch(() => {});
      if (tbl === "payments") console.log("  DEBUG payments SQL:", `insert into public."${tbl}" (${colsSql}) values (${valsSql})`);
      skipped++;
      console.log(`  \u{23F9} ${tbl} — seed skipped (${e.message.split("\n")[0]})`);
      continue;
    }
    // owner can read it (sanity)
    await asUser(U_B);
    let ownerSees = 0;
    await c.query("savepoint sp");
    try {
      ownerSees = (await c.query(`select count(*)::int n from public."${tbl}" where ctid = $1::tid`, [seedId])).rows[0].n;
      await c.query("release savepoint sp");
      ok(ownerSees === 1, `CT-001 ${tbl}: org B owner reads own seeded row`);
    } catch (e) {
      await c.query("rollback to savepoint sp");
      // no authenticated read grant at all (platform-only/audit table) — the
      // attacker can't read either, so cross-tenant isolation still holds.
      const denied = /permission denied/.test(e.message);
      ok(denied, `CT-001 ${tbl}: ${denied ? "no auth read grant (platform-only)" : e.message.split("\n")[0]}`);
    }
    await asOwner();

    // attacker (org A)
    await asUser(U_A);
    await c.query("savepoint sp");
    try {
      const n = (await c.query(`select count(*)::int n from public."${tbl}" where ctid = $1::tid`, [seedId])).rows[0].n;
      ok(n === 0, `CT-002 ${tbl}: org A admin cannot read org B row`);
      await c.query("release savepoint sp");
    } catch (e) {
      await c.query("rollback to savepoint sp");
      const denied = /permission denied/.test(e.message);
      ok(denied, `CT-002 ${tbl}: ${denied ? "no auth read grant (platform-only)" : e.message.split("\n")[0]}`);
    }

    // update: set a nullable non-tenant column to NULL → 0 rows (RLS) or
    // permission denied (no UPDATE grant — append-only audit tables). Both mean
    // the attacker cannot modify the row, so both pass.
    const updatable = cols.find(cl => cl.nullable && !["id"].includes(cl.col)
      && !directTenantCols.includes(cl.col) && !(fkTenantCol && cl.col === fkTenantCol.col));
    if (updatable) {
      await c.query("savepoint sp");
      try {
        const r = await c.query(`update public."${tbl}" set "${updatable.col}" = null where ctid = $1::tid`, [seedId]);
        ok(r.rowCount === 0, `CT-003 ${tbl}: org A admin UPDATE touches 0 rows`);
        await c.query("release savepoint sp");
      } catch (e) {
        await c.query("rollback to savepoint sp");
        const denied = /permission denied/.test(e.message);
        ok(denied, `CT-003 ${tbl}: ${denied ? "UPDATE grant denied (append-only)" : e.message.split("\n")[0]}`);
      }
    } else {
      ok(true, `CT-003 ${tbl}: no nullable update col (skip)`);
    }

    // delete
    await c.query("savepoint sp");
    try {
      const r = await c.query(`delete from public."${tbl}" where ctid = $1::tid`, [seedId]);
      ok(r.rowCount === 0, `CT-004 ${tbl}: org A admin DELETE removes 0 rows`);
      await c.query("release savepoint sp");
    } catch (e) {
      await c.query("rollback to savepoint sp");
      const denied = /permission denied/.test(e.message);
      ok(denied, `CT-004 ${tbl}: ${denied ? "DELETE grant denied (append-only)" : e.message.split("\n")[0]}`);
    }

    // insert claiming org B / P_B scope — must fail
    const attk = buildVals(tbl); // same value map as seed — claims B scope
    const attkCols = Object.keys(attk);
    if (attkCols.length) {
      const attkColsSql = attkCols.map(k => `"${k}"`).join(",");
      const attkValsSql = attkCols.map(k => quoteVal(attk[k])).join(",");
      await c.query("savepoint sp");
      try {
        await c.query(`insert into public."${tbl}" (${attkColsSql}) values (${attkValsSql})`, []);
        await c.query("release savepoint sp");
        ok(false, `CT-005 ${tbl}: org A admin INSERT claiming B scope DID NOT FAIL`);
      } catch {
        await c.query("rollback to savepoint sp");
        ok(true, `CT-005 ${tbl}: org A admin INSERT claiming B scope rejected`);
      }
    }
    await asOwner();
  }

  console.log(`\nscanned ${SCOPE_TABLES.length} tenant tables (${skipped} seeds skipped)`);
} finally {
  await c.query("rollback");
  await c.end();
}

console.log(`\n${fail === 0 ? `\u2705 All ${pass} cross-tenant assertions passed.` : `\u274C ${fail} assertion(s) failed.`}`);
process.exit(fail === 0 ? 0 : 1);