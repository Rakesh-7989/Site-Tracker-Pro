// Deploy edge functions via old JSON API endpoint.
// Uses POST /v1/projects/{ref}/functions with application/json.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REF = 'nntkxojdeyziemdhyjvg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const FUNCS = join(ROOT, 'supabase', 'functions');

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN not set'); process.exit(1); }

const BASE = `https://api.supabase.com/v1/projects/${REF}/functions`;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const slugs = readdirSync(FUNCS, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_shared')
    .map(e => e.name)
    .sort();

  console.log(`Deploying ${slugs.length} functions to ${REF}...\n`);

  let ok = 0, fail = 0;
  for (const slug of slugs) {
    const dir = join(FUNCS, slug);
    const entry = ['index.ts', 'index.tsx', 'index.js', 'mod.ts']
      .find(f => existsSync(join(dir, f)));
    if (!entry) { console.log(`  ⏭ ${slug} — no entrypoint`); fail++; continue; }

    const code = readFileSync(join(dir, entry), 'utf-8');
    const ep = `supabase/functions/${slug}/${entry}`;

    process.stdout.write(`  ${slug}... `);
    try {
      const result = await api('POST', '', {
        slug,
        name: slug,
        body: code,
        entrypoint_path: ep,
        verify_jwt: !slug.includes('webhook') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite' && slug !== 'register_org',
      });
      console.log(`OK v${result.version}`);
      ok++;
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n${ok} deployed, ${fail} failed (${slugs.length} total)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
