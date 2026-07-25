// Deploy edge functions via Supabase Management REST API (v2 - multipart).
// Uses the correct /v1/projects/{ref}/functions/deploy endpoint.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REF = 'nntkxojdeyziemdhyjvg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const FUNCS = join(ROOT, 'supabase', 'functions');

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN not set'); process.exit(1); }

const API = `https://api.supabase.com/v1/projects/${REF}/functions/deploy`;

function apiFetch(url, form) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    form.submit(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        protocol: u.protocol,
        headers: { Authorization: `Bearer ${TOKEN}` },
      },
      (err, res) => {
        if (err) { reject(err); return; }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    form.on('error', reject);
  });
}

function makeForm(slug, filePath, ep) {
  const form = new FormData();
  const metadata = {
    name: slug,
    entrypoint_path: ep,
    verify_jwt: !slug.includes('webhook') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite' && slug !== 'register_org',
  };
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', readFileSync(filePath), {
    filename: ep,
    contentType: 'application/octet-stream',
  });
  return form;
}

async function deployOne(slug) {
  const dir = join(FUNCS, slug);
  const entry = ['index.ts', 'index.tsx', 'index.js', 'mod.ts']
    .find(f => existsSync(join(dir, f)));
  if (!entry) { return { ok: false, error: 'no entrypoint' }; }

  const filePath = join(dir, entry);
  const ep = `supabase/functions/${slug}/${entry}`;
  const url = `${API}?slug=${encodeURIComponent(slug)}`;
  const form = makeForm(slug, filePath, ep);

  process.stdout.write(`  ${slug}... `);
  try {
    const res = await apiFetch(url, form);
    if (res.status === 201) {
      const result = JSON.parse(res.body);
      console.log(`OK v${result.version}`);
      return { ok: true, version: result.version };
    }
    const msg = `HTTP ${res.status}: ${res.body.slice(0, 300)}`;
    console.log(`FAIL: ${msg}`);
    return { ok: false, error: msg };
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function main() {
  const slugs = readdirSync(FUNCS, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_shared')
    .map(e => e.name)
    .sort();

  console.log(`Deploying ${slugs.length} functions to ${REF}...\n`);

  let ok = 0, fail = 0;
  for (const slug of slugs) {
    const r = await deployOne(slug);
    if (r.ok) ok++; else fail++;
  }

  console.log(`\n${ok} deployed, ${fail} failed (${slugs.length} total)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
