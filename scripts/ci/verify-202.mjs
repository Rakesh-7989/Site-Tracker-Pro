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

  const f = await client.query(
    "select p.proname, p.prosecdef, has_function_privilege('service_role', format('%I.%I(%s)', p.pronamespace::regnamespace, p.proname, pg_get_function_identity_arguments(p.oid)), 'EXECUTE') as svc_exec, has_function_privilege('authenticated', format('%I.%I(%s)', p.pronamespace::regnamespace, p.proname, pg_get_function_identity_arguments(p.oid)), 'EXECUTE') as auth_exec from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'admin_expire_trials' and n.nspname = 'public'"
  );
  for (const x of f.rows) {
    console.log(`admin_expire_trials: SECURITY DEFINER=${x.prosecdef} · svc_role exec=${x.svc_exec} · authenticated exec=${x.auth_exec}`);
  }

  const j = await client.query(
    "select jobid, jobname, schedule, command from cron.job where jobname = 'expire-expired-trials'"
  );
  for (const x of j.rows) {
    console.log(`cron job: ${x.jobname} · ${x.schedule} · ${x.command}`);
  }
} finally {
  await client.end();
}