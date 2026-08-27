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

const sharedFiles = {};
for (const f of readdirSync(SHARED).filter(f => f.endsWith('.ts'))) {
  sharedFiles[f.replace('.ts', '')] = readFileSync(join(SHARED, f), 'utf-8');
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
    // Replace _shared imports with inline code
    code = code.replace(/import\s+{([^}]*)}\s+from\s+"\.\.\/_shared\/(\w+)\.ts";?\s*/g, (match, imports, name) => {
      if (sharedFiles[name]) {
        return `// --- inlined from _shared/${name}.ts ---\n${sharedFiles[name]}\n// --- end _shared/${name}.ts ---`;
      }
      return match;
    });
    // Also try single imports
    code = code.replace(/import\s+(\w+)\s+from\s+"\.\.\/_shared\/(\w+)\.ts";?\s*/g, (match, def, name) => {
      if (sharedFiles[name]) {
        return `// --- inlined from _shared/${name}.ts ---\n${sharedFiles[name]}\n// --- end _shared/${name}.ts ---`;
      }
      return match;
    });
  }

  // Fix import path for esm.sh to use deno.land compatible
  code = code.replace(/from\s+"https:\/\/esm\.sh\//g, 'from "https://esm.sh/');

  return code;
}

async function deployOne(slug, code) {
  const url = `https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${encodeURIComponent(slug)}`;

  const metadata = {
    name: slug,
    entrypoint_path: 'index.ts',
    verify_jwt: !slug.includes('webhook') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite' && slug !== 'register_org',
  };

  const boundary = '----boundary' + Math.random().toString(36).slice(2);
  let body = '';
  body += `--${boundary}\r\n`;
  body += 'Content-Disposition: form-data; name="metadata"\r\n';
  body += 'Content-Type: application/json\r\n\r\n';
  body += JSON.stringify(metadata) + '\r\n';
  body += `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="index.ts"\r\n`;
  body += 'Content-Type: application/octet-stream\r\n\r\n';
  body += code + '\r\n';
  body += `--${boundary}--\r\n`;

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
    const result = JSON.parse(text);
    return { ok: true, version: result.version };
  }
  return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
}
async function main() {
  const slugs = readdirSync(FUNCS, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_shared')
    .map(e => e.name)
    .sort();

  console.log(`Deploying ${slugs.length} functions to ${REF}...\n`);

  let ok = 0, fail = 0;
  for (const slug of slugs) {
    process.stdout.write(`  ${slug}... `);
    const code = bundleFunction(slug);
    if (!code) {
      console.log('SKIP (no entrypoint)');
      fail++;
      continue;
    }
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
