import { readFileSync } from "node:fs";
import pg from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()])
);

const c = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
try {
  const r = await c.query(
    `select pg_get_function_identity_arguments(oid) as args,
            pg_get_function_result(oid) as ret
       from pg_proc where proname = 'platform_users' order by 1`
  );
  console.log(JSON.stringify(r.rows, null, 1));
  const p = await c.query(
    "select staff_tier, org_count, count(*)::int as rows from platform_users(10,0,null) group by 1,2 order by 3 desc limit 5"
  );
  console.log(JSON.stringify(p.rows, null, 1));
} finally {
  await c.end();
}
