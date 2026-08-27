// Deploy all Edge Functions via Supabase Management REST API.
// Bypasses CLI token format issue (sbp_v0_ not supported in v2.108.0).
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PROJECT_REF = 'nntkxojdeyziemdhyjvg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN not set');
  process.exit(1);
}

const BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`;

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

async function deployOne(slug) {
  const dir = join(FUNCTIONS_DIR, slug);
  if (!existsSync(dir)) { console.log(`  ⏭  ${slug} — dir not found`); return; }

  const entry = findEntry(dir);
  if (!entry) { console.log(`  ⏭  ${slug} — no entrypoint`); return; }

  const code = readFileSync(entry, 'utf-8');
  const ep = `supabase/functions/${slug}/${entry.split('\\').pop().split('/').pop()}`;

  process.stdout.write(`  📤 ${slug}… `);
  try {
    const result = await api('POST', `/${slug}/deploy`, {
      body: code,
      entrypoint_path: ep,
      verify_jwt: !slug.includes('webhook') && !slug.includes('signup') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite',
      import_map_path: null,
    });
    console.log(`✅ v${result.version}`);
    return true;
  } catch (e) {
    console.log(`❌ ${e.message}`);
    return false;
  }
}

function findEntry(dir) {
  for (const f of ['index.ts', 'index.tsx', 'index.js', 'mod.ts']) {
    const p = join(dir, f);
    if (existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const slugs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_shared')
    .map(e => e.name)
    .sort();

  console.log(`🚀 Deploying ${slugs.length} functions to ${PROJECT_REF}…\n`);

  let ok = 0, fail = 0;
  for (const slug of slugs) {
    const r = await deployOne(slug);
    if (r) ok++; else fail++;
  }

  console.log(`\n📊 ${ok} deployed · ${fail} failed (of ${slugs.length})`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
