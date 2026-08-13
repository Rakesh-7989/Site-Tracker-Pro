import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const r = await client.query(
    "select proname, pg_get_functiondef(oid) d from pg_proc where proname in ('generate_hourly_invoice','generate_retainer_invoice')"
  );
  for (const x of r.rows) {
    const gate = x.d.includes("has_project_role");
    const bounds = x.d.includes("period starts before") || x.d.includes("period ends after");
    const lines = x.d.includes("invoice_lines");
    console.log(`${x.proname}: project-tier gate=${gate} · retainer bounds=${bounds} · line items=${lines}`);
  }
} finally {
  await client.end();
}