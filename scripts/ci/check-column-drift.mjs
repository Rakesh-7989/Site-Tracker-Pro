// SiteTrack Pro — frontend ↔ live-DB column drift gate.
//
// Run via:   npm run check:columns
//        or: node scripts/check-column-drift.mjs
//
// WHY THIS EXISTS
//   Every read-path PGRST204 bug that hit production was a frontend .select()
//   column that drifted from the live DB schema (dpr_messages.transcript,
//   notifications.message, org_members.is_admin, po_receipts.project_id,
//   safety.title, the `updates` table, projects.slug …). This gate scans every
//   `.from("<table>").select(...)` in src/ and fails the build the moment a
//   column (or table) no longer exists on the live database.
//
// HOW IT READS THE DB
//   Uses `SUPABASE_DB_URL` (the direct Postgres connection string) from the
//   environment if set, else `.env.local`. In CI it runs ONLY when the
//   `SUPABASE_DB_URL` GitHub secret is configured — otherwise it prints SKIP
//   and exits 0, so a missing secret never blocks a deploy.
//
// EXIT CODES
//   0  all columns resolve (or DB not configured — SKIP)
//   1  at least one real drift (table not found, or selected column missing)
//
// The parser is deliberately conservative: embedded relations are resolved
// through real FOREIGN KEY metadata, so `po:purchase_orders(project_id)` and
// `organizations:org_id(id, slug, …)` validate the INNER columns against the
// referenced table instead of false-flagging them. Only genuinely unresolvable
// embeds are reported (as a FAIL — a real relationship that doesn't exist).

import pg from "pg";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ENV_PATH = join(root, ".env.local");

// ── env / config ─────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}

const env = loadEnv();
const DB_URL = env.SUPABASE_DB_URL || "";

if (!DB_URL) {
  console.log("SKIP  SUPABASE_DB_URL not configured (env or .env.local) — column-drift gate not run.");
  process.exit(0);
}

// ── live schema (tables + columns + foreign keys) ────────────────────────────
const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

const cols = new Map(); // table -> Set(column)
const fksOut = new Map(); // table -> [{ col, refTable }]  (FKs owned by table)
const fksIn = new Map(); // table -> [{ table, col }]       (FKs pointing at table)

{
  const cRes = await db.query(
    `select table_name, column_name from information_schema.columns
     where table_schema='public' order by table_name, ordinal_position`);
  for (const r of cRes.rows) {
    if (!cols.has(r.table_name)) cols.set(r.table_name, new Set());
    cols.get(r.table_name).add(r.column_name);
  }

  const fRes = await db.query(`
    select tc.table_name, kcu.column_name, ccu.table_name as ref_table
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    order by tc.table_name, kcu.column_name`);
  for (const r of fRes.rows) {
    if (!fksOut.has(r.table_name)) fksOut.set(r.table_name, []);
    fksOut.get(r.table_name).push({ col: r.column_name, refTable: r.ref_table });
    if (!fksIn.has(r.ref_table)) fksIn.set(r.ref_table, []);
    fksIn.get(r.ref_table).push({ table: r.table_name, col: r.column_name });
  }
}
console.log(`DB connected: ${cols.size} tables`);

// ── source walk ──────────────────────────────────────────────────────────────
function walk(dir, out) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
}
const files = [];
walk(join(root, "src"), files);

const CONST_RE = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(["'`])([\s\S]*?)\2/g;
const FROM_RE = /\.from\(\s*["']([a-z_][a-z0-9_]*)["']\s*\)/g;
// First quoted argument of .select(...) — captures `"id"` from the count form
// `.select("id", { count: "exact", head: true })` and multi-line template
// literals. Never requires a trailing `)` (the count form has none).
const SELECT_QUOTED_RE = /\.select\(\s*(["'`])([\s\S]*?)\1/g;
// Identifier form: `.select(ROW_SELECT)` — resolved from consts below.
const SELECT_IDENT_RE = /\.select\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g;

const findings = [];
let totalPairs = 0;
let missingTables = new Set();

// split "a, b(c, d), e" on top-level commas
function splitTop(str) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// resolve an embed relationship on `table` to its referenced table.
// Returns { target } on success, { target: null, ambiguous: false } when no
// relationship exists, or { target: null, ambiguous: true } when the name
// matches MULTIPLE FK paths (PostgREST would reject with PGRST201).
function resolveEmbed(table, rel) {
  // 1. rel is an FK column owned by `table` (e.g. author_id, po_id)
  const owned = (fksOut.get(table) ?? []).filter(f => f.col === rel);
  if (owned.length === 1) return { target: owned[0].refTable, ambiguous: false };
  if (owned.length > 1) return { target: null, ambiguous: true };
  // 2. rel is a table name referenced by `table` via FK (many-to-one by
  //    target name, e.g. `profiles(name)` when the FK col is `owner_id`, or
  //    `projects(id)` when the FK col is `project_id`)
  const refs = (fksOut.get(table) ?? []).filter(f => f.refTable === rel && cols.has(rel));
  if (refs.length === 1) return { target: rel, ambiguous: false };
  if (refs.length > 1) return { target: null, ambiguous: true };
  // 3. rel is a table name with a FK pointing back at `table` (to-many, e.g.
  //    invoice_lines -> invoices.id, milestones.project_id -> projects.id)
  if (cols.has(rel) && (fksOut.get(rel) ?? []).some(f => f.refTable === table)) return { target: rel, ambiguous: false };
  return { target: null, ambiguous: false };
}

function validateSelect(table, selectStr, lineNo, file) {
  for (const item of splitTop(selectStr)) {
    if (!item || item === "*") continue;
    const open = item.indexOf("(");
    if (open >= 0) {
      // embedded relation: [alias:]rel!inner?(subselect)
      let head = item.slice(0, open).replace(/!inner$/i, "");
      const sub = item.slice(open + 1, item.lastIndexOf(")"));
      const colon = head.indexOf(":");
      if (colon >= 0) head = head.slice(colon + 1); // alias:rel → rel
      head = head.trim();
      if (!head) continue;
      const { target, ambiguous } = resolveEmbed(table, head);
      if (ambiguous) {
        findings.push({ file, line: lineNo, table, col: `${table}.${head}`, detail: "ambiguous embed: name resolves to MULTIPLE FK paths (PostgREST rejects with PGRST201)" });
      } else if (!target) {
        findings.push({ file, line: lineNo, table, col: `${table}.${head}`, detail: "embedded relationship does not resolve via FK metadata" });
      } else {
        validateSelect(target, sub, lineNo, file); // recurse into referenced table
      }
    } else {
      // plain column, possibly alias:col
      let real = item;
      const colon = real.indexOf(":");
      if (colon >= 0) real = real.slice(colon + 1);
      real = real.replace(/!inner.*$/i, "").trim();
      if (!real || real === "*") continue;
      if (!cols.get(table)?.has(real)) {
        findings.push({ file, line: lineNo, table, col: real });
      }
    }
  }
}

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const consts = new Map();
  for (const m of src.matchAll(CONST_RE)) consts.set(m[1], m[3]);

  const fromMatches = [];
  for (const m of src.matchAll(FROM_RE)) {
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/storage\s*\.$/.test(before)) continue;
    fromMatches.push({ table: m[1], index: m.index + m[0].length });
  }
  const selMatches = [];
  for (const m of src.matchAll(SELECT_QUOTED_RE)) {
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/storage\s*\.$/.test(before)) continue;
    selMatches.push({ str: m[2].trim(), index: m.index });
  }
  for (const m of src.matchAll(SELECT_IDENT_RE)) {
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/storage\s*\.$/.test(before)) continue;
    const resolved = consts.get(m[1]);
    if (!resolved) continue;
    selMatches.push({ str: resolved.trim(), index: m.index });
  }
  selMatches.sort((a, b) => a.index - b.index);

  for (let i = 0; i < fromMatches.length; i++) {
    const fm = fromMatches[i];
    const nextFrom = i + 1 < fromMatches.length ? fromMatches[i + 1].index : src.length;
    const sel = selMatches.find(s => s.index >= fm.index && s.index < nextFrom);
    if (!sel) continue;
    totalPairs++;
    const colStr = sel.str;
    if (!colStr || colStr === "*") continue;
    if (!cols.has(fm.table)) {
      missingTables.add(fm.table);
      continue;
    }
    const lineNo = src.slice(0, sel.index).split(/\r?\n/).length;
    validateSelect(fm.table, colStr, lineNo, f.replace(root + "\\", "").replace(root + "/", ""));
  }
}

await db.end();

// ── report ───────────────────────────────────────────────────────────────────
console.log(`Scanned ${files.length} files, ${totalPairs} from().select() pairs`);
if (missingTables.size) {
  console.error(`FAIL  table(s) queried but missing on live DB: ${[...missingTables].join(", ")}`);
}
for (const fn of findings) {
  console.error(`FAIL  ${fn.file}:${fn.line}  ${fn.table}.${fn.col}  ${fn.detail ?? "(column not on live table)"}`);
}
if (findings.length || missingTables.size) {
  console.error(`\n${findings.length + missingTables.size} drift(s) — run against the live DB schema and fix the .select() before shipping.`);
  process.exit(1);
}
console.log("PASS  no column/table drift between frontend queries and the live DB schema.");
