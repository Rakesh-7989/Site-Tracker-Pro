// Deploy edge functions via Supabase Management API
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import FormData from 'form-data';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REF = 'nntkxojdeyziemdhyjvg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const FUNCS = join(ROOT, 'supabase', 'functions');
const API = `https://api.supabase.com/v1/projects/${REF}/functions`;

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN not set'); process.exit(1); }

function formFetch(url, form) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? httpsRequest : httpRequest;
    form.submit(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, text: () => data }));
      }
    );
    form.on('error', reject);
  });
}

async function deploy(slug, filePath, ep) {
  const form = new FormData();
  form.append('slug', slug);
  form.append('entrypoint_path', ep);
  form.append('verify_jwt', String(!slug.includes('webhook') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite' && slug !== 'register_org'));
  form.append('body', readFileSync(filePath), {
    filename: 'index.ts',
    contentType: 'application/vnd.deno.script',
  });

  const res = await formFetch(`${API}/deploy?slug=${slug}`, form);
  const text = await res.text();
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
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
    if (!entry) { console.log(`  SKIP ${slug} (no entrypoint)`); fail++; continue; }

    const filePath = join(dir, entry);
    const ep = `supabase/functions/${slug}/${entry}`;

    process.stdout.write(`  ${slug}... `);
    try {
      const result = await deploy(slug, filePath, ep);
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
