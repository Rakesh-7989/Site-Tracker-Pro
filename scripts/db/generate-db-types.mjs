#!/usr/bin/env node
// SiteTrack Pro — generate src/lib/supabase/database.types.ts from the LIVE database.
//
// Self-hosted alternative to `supabase gen types` (which shells out to a
// container runtime we don't require). Reads information_schema via pg and
// emits the supabase-js `Database` shape (Row / Insert / Update per table,
// Enums, Function arg maps). Deterministic output — safe to commit and diff.
//
//   node scripts/generate-db-types.mjs           # write the file
//   node scripts/generate-db-types.mjs --check   # exit 1 if it would change
//
// Env: SUPABASE_DB_URL in .env.local (same contract as apply-migrations.mjs).

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const envPath = join(root, ".env.local");
const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
        .filter(Boolean)
        .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
    )
  : {};
// CI supplies SUPABASE_DB_URL as a workflow env var; locally it lives in .env.local.
const dbUrl = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;
if (!dbUrl || dbUrl.includes("YOUR_") || dbUrl.length < 20) {
  console.error("❌ SUPABASE_DB_URL not set in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: enumRows } = await client.query(`
  select t.typname, e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  order by t.typname, e.enumsortorder
`);
const enums = new Map();
for (const r of enumRows) {
  if (!enums.has(r.typname)) enums.set(r.typname, []);
  enums.get(r.typname).push(r.enumlabel);
}

const { rows: cols } = await client.query(`
  select c.table_name, c.column_name, c.data_type, c.udt_name,
         c.is_nullable, c.column_default, c.is_generated, c.is_identity
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by c.table_name, c.ordinal_position
`);

const { rows: fns } = await client.query(`
  select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (
      select 1 from pg_depend d
      join pg_extension e on e.oid = d.refobjid
      where d.objid = p.oid and d.deptype = 'e'
    )
  order by p.proname
`).catch(() => ({ rows: [] }));

const { rows: fks } = await client.query(`
  select
    tc.constraint_name,
    tc.table_name as source_table,
    kcu.column_name as source_column,
    ccu.table_name as target_table,
    ccu.column_name as target_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
    and ccu.table_schema = tc.table_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
  order by tc.table_name, tc.constraint_name, kcu.ordinal_position
`);
await client.end();

if (cols.length === 0) {
  console.error("❌ No public tables found — wrong database?");
  process.exit(1);
}

const ENUM_TYPES = new Set(enums.keys());

function tsType(udtName, dataType) {
  if (udtName.startsWith("_")) return `${tsType(udtName.slice(1), "base")}[]`;
  if (ENUM_TYPES.has(udtName)) return `Database["public"]["Enums"]["${udtName}"]`;
  switch (udtName) {
    case "int2": case "int4": case "int8":
    case "float4": case "float8": case "numeric":
    case "oid": return "number";
    case "bool": return "boolean";
    case "json": case "jsonb": return "Json";
    case "bytea": return "string";
    case "uuid": case "text": case "varchar": case "bpchar":
    case "citext": case "name": case "xml":
    case "timestamptz": case "timestamp": case "date":
    case "time": case "timetz": case "inet": case "money":
      return "string";
    default:
      if (dataType === "ARRAY") return "Json[]";
      return "unknown";
  }
}

function pascal(s) {
  return s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("");
}

const tables = new Map();
for (const c of cols) {
  if (!tables.has(c.table_name)) tables.set(c.table_name, []);
  tables.get(c.table_name).push(c);
}

// Build Relationships map: source_table → [{ foreignKeyName, columns, isOneToOne, referencedRelation, referencedColumns }]
const relsByTable = new Map();
for (const fk of fks) {
  if (!relsByTable.has(fk.source_table)) relsByTable.set(fk.source_table, []);
  // Group multi-column FKs by constraint name
  const existing = relsByTable.get(fk.source_table).find(r => r.foreignKeyName === fk.constraint_name);
  if (existing) {
    existing.columns.push(fk.source_column);
    existing.referencedColumns.push(fk.target_column);
  } else {
    relsByTable.get(fk.source_table).push({
      foreignKeyName: fk.constraint_name,
      columns: [fk.source_column],
      isOneToOne: false, // will be refined below
      referencedRelation: fk.target_table,
      referencedColumns: [fk.target_column],
    });
  }
}

// Determine isOneToOne: FK columns include the target table's PRIMARY KEY
const pkByTable = new Map();
for (const [table, tableCols] of tables) {
  const pks = tableCols.filter(c => c.is_identity === "YES" || c.column_default?.includes("gen_random_uuid"));
  if (pks.length === 1) pkByTable.set(table, pks[0].column_name);
}
for (const [, rels] of relsByTable) {
  for (const r of rels) {
    const pk = pkByTable.get(r.referencedRelation);
    if (pk && r.referencedColumns.length === 1 && r.referencedColumns[0] === pk) {
      // Check uniqueness: is there a unique constraint on the source columns?
      r.isOneToOne = false; // conservative default; PostgREST infers from DB constraints
    }
  }
}

const out = [];
out.push(`// AUTO-GENERATED by scripts/generate-db-types.mjs - DO NOT EDIT.`);
out.push(`// Source: LIVE public schema (${tables.size} tables, ${enumRows.length} enum values, ${fns.length} functions, ${fks.length} foreign keys).`);
out.push(`// Regenerate: npm run db:types`);
out.push(``);
out.push(`export type Json =`);
out.push(`  | string`);
out.push(`  | number`);
out.push(`  | boolean`);
out.push(`  | null`);
out.push(`  | { [key: string]: Json | undefined }`);
out.push(`  | Json[];`);
out.push(``);
out.push(`export interface Relationship {`);
out.push(`  foreignKeyName: string;`);
out.push(`  columns: string[];`);
out.push(`  isOneToOne: boolean;`);
out.push(`  referencedRelation: string;`);
out.push(`  referencedColumns: string[];`);
out.push(`}`);
out.push(``);
out.push(`export type Embed<T extends { columns: string[]; referencedRelation: keyof Database["public"]["Tables"] }> = {`);
out.push(`  [K in T["columns"][number]]: Database["public"]["Tables"][T["referencedRelation"]]["Row"];`);
out.push(`};`);
out.push(``);
out.push(`export interface Database {`);
out.push(`  public: {`);
out.push(`    Tables: {`);

for (const [table, tableCols] of [...tables.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const T = pascal(table);
  out.push(`      ${table}: {`);
  // Row
  out.push(`        Row: {`);
  for (const c of tableCols) {
    const nullable = c.is_nullable === "YES" ? " | null" : "";
    out.push(`          ${c.column_name}: ${tsType(c.udt_name, c.data_type)}${nullable};`);
  }
  out.push(`        };`);
  // Insert
  out.push(`        Insert: {`);
  for (const c of tableCols) {
    const generated = c.is_generated === "ALWAYS" || c.is_identity === "YES";
    if (generated) continue;
    const optional = c.is_nullable === "YES" || c.column_default !== null;
    out.push(`          ${c.column_name}${optional ? "?" : ""}: ${tsType(c.udt_name, c.data_type)}${optional ? " | null" : ""};`);
  }
  out.push(`        };`);
  // Update
  out.push(`        Update: {`);
  for (const c of tableCols) {
    const generated = c.is_generated === "ALWAYS" || c.is_identity === "YES";
    if (generated) continue;
    out.push(`          ${c.column_name}?: ${tsType(c.udt_name, c.data_type)} | null;`);
  }
  out.push(`        };`);
  out.push(`        Relationships: Relationship[];`);
  out.push(`      };`);
  void T;
}

out.push(`    };`);
out.push(`    Views: {`);
out.push(`      _: never;`);
out.push(`    };`);
out.push(`    Functions: {`);

const seenFns = new Set();
for (const f of [...fns].sort((a, b) => a.proname.localeCompare(b.proname))) {
  if (seenFns.has(f.proname)) continue; // overloads: first wins deterministically
  seenFns.add(f.proname);
  const argPairs = [];
  const argsStr = String(f.args || "").trim();
  if (argsStr) {
    // Split top-level commas (respecting parens for TABLE()/array defaults).
    let depth = 0, cur = "";
    const parts = [];
    for (const ch of argsStr) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    for (const part of parts) {
      const cleaned = part.replace(/DEFAULT\s+.*$/i, "").trim();
      const m = cleaned.match(/^(?:INOUT|OUT|IN|VARIADIC)?\s*"?([A-Za-z_][A-Za-z0-9_]*)?"?\s+(.+)$/i);
      if (!m) continue;
      const [, name, typeSig] = m;
      const udt = typeSig.trim().replace(/\s+/g, " ").toLowerCase();
      let ts = "unknown";
      const arrM = udt.match(/^([a-z_ ][a-z0-9_ ]*?)\[\]$/);
      const base = arrM ? arrM[1].trim().split(" ")[0] : udt.split(" ")[0];
      const mapped = base === "text" ? "string"
        : base === "integer" || base === "int" || base === "bigint" ? "number"
        : base === "boolean" || base === "bool" ? "boolean"
        : base === "json" || base === "jsonb" ? "Json"
        : base === "uuid" ? "string"
        : base === "timestamptz" || base === "timestamp" || base === "date" ? "string"
        : base === "numeric" ? "number"
        : null;
      if (mapped) ts = arrM ? `${mapped}[]` : mapped;
      else if (ENUM_TYPES.has(base)) ts = `Database["public"]["Enums"]["${base}"]${arrM ? "[]" : ""}`;
      argPairs.push(`${name ?? "arg"}${/DEFAULT/i.test(part) ? "?" : ""}: ${ts}`);
    }
  }
  out.push(`      ${f.proname}: {`);
  out.push(`        Args: ${argPairs.length ? `{ ${argPairs.join("; ")} }` : "Record<string, never>"};`);
  out.push(`        Returns: unknown;`);
  out.push(`      };`);
}

out.push(`    };`);
out.push(`    Enums: {`);
if (enums.size === 0) {
  out.push(`      _: never;`);
} else {
  for (const [name, labels] of [...enums.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`      ${name}: ${labels.map(l => JSON.stringify(l)).join(" | ")};`);
  }
}
out.push(`    };`);
out.push(`    CompositeTypes: {`);
out.push(`      _: never;`);
out.push(`    };`);
out.push(`  };`);
out.push(`}`);
out.push(``);

const content = out.join("\n");
const target = join(root, "src/lib/supabase/database.types.ts");

if (process.argv.includes("--check")) {
  const existing = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (existing !== content) {
    console.error("❌ database.types.ts is STALE vs live schema. Run: npm run db:types");
    console.error(`   fingerprint now=${createHash("sha256").update(content).digest("hex").slice(0, 12)} file=${existing ? createHash("sha256").update(existing).digest("hex").slice(0, 12) : "(missing)"}`);
    process.exit(1);
  }
  console.log(`✅ database.types.ts matches live schema (${tables.size} tables)`);
} else {
  writeFileSync(target, content, "utf8");
  console.log(`✅ wrote src/lib/supabase/database.types.ts (${tables.size} tables, ${seenFns.size} functions, ${fks.length} FKs, ${(content.length / 1024).toFixed(0)} KB)`);
}
