import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REF = 'nntkxojdeyziemdhyjvg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const FUNCS = join(ROOT, 'supabase', 'functions');
const SHARED = join(FUNCS, '_shared');

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN not set'); process.exit(1); }

// Read all shared files
const sharedCache = {};
function getShared(name) {
  if (sharedCache[name]) return sharedCache[name];
  const p = join(SHARED, name + '.ts');
  if (!existsSync(p)) return null;
  const content = readFileSync(p, 'utf-8');
  // Remove export keywords so they become local
  const clean = content
    .replace(/^export\s+(function|const|class|interface|type|enum|async\s+function|default)\s+/gm, '$1 ')
    .replace(/^export\s*{([^}]*)}\s*;\s*$/gm, '// exports removed: $1')
    .replace(/^export\s*type\s+/gm, 'type ')
    .replace(/^export\s*interface\s+/gm, 'interface ')
    .replace(/^export\s*enum\s+/gm, 'enum ')
    .replace(/^export\s*default\s+/gm, '');
  sharedCache[name] = clean;
  return clean;
}

function bundleFunction(slug) {
  const dir = join(FUNCS, slug);
  const entry = ['index.ts', 'index.tsx', 'index.js', 'mod.ts']
    .find(f => existsSync(join(dir, f)));
  if (!entry) return null;

  let code = readFileSync(join(dir, entry), 'utf-8');

  // Check for bundled version
  const bundledPath = join(dir, 'index.bundled.ts');
  if (existsSync(bundledPath)) {
    code = readFileSync(bundledPath, 'utf-8');
  } else {
    // Replace _shared imports with inlined code
    code = code.replace(/import\s+([\s\S]*?)\s+from\s+"\.\.\/_shared\/(\w+)\.ts";?\s*/g, (match, imports, name) => {
      const shared = getShared(name);
      if (shared) {
        return `// --- inlined _shared/${name}.ts ---\n${shared}\n// --- end _shared/${name}.ts ---\n`;
      }
      console.error(`  WARN: _shared/${name}.ts not found for ${slug}`);
      return match;
    });
  }

  return code;
}

async function deployOne(slug, code) {
  const url = `https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${encodeURIComponent(slug)}`;

  const boundary = '----boundary' + Math.random().toString(36).slice(2);

  const metadata = JSON.stringify({
    name: slug,
    entrypoint_path: 'index.ts',
    verify_jwt: !slug.includes('webhook') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite' && slug !== 'register_org',
  });

  const encoder = new TextEncoder();
  const parts = [
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.ts"\r\nContent-Type: application/octet-stream\r\n\r\n${code}\r\n`),
    encoder.encode(`--${boundary}--\r\n`),
  ];

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) { body.set(p, offset); offset += p.length; }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const text = await res.text();
  if (res.status === 201) {
    return { ok: true, version: JSON.parse(text).version };
  }
  return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
}

async function main() {
  const slugs = readdirSync(FUNCS, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_shared')
    .map(e => e.name)
    .sort();

  console.log(`Bundling + deploying ${slugs.length} functions to ${REF}...\n`);

  let ok = 0, fail = 0;
  for (const slug of slugs) {
    process.stdout.write(`  ${slug}... `);
    const code = bundleFunction(slug);
    if (!code) { console.log('SKIP (no entrypoint)'); fail++; continue; }
    const res = await deployOne(slug, code);
    if (res.ok) {
      console.log(`OK v${res.version}`);
      ok++;
    } else {
      console.log(`FAIL: ${res.error}`);
      fail++;
    }
  }

  console.log(`\n${ok} deployed, ${fail} failed (${slugs.length} total)`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
