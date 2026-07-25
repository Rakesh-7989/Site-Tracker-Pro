import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REF = 'nntkxojdeyziemdhyjvg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const FUNCS = join(ROOT, 'supabase', 'functions');

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN not set'); process.exit(1); }

function createTar(files) {
  const encoder = new TextEncoder();
  const chunks = [];

  for (const [name, content] of files) {
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    const header = new Uint8Array(512);
    const nameBytes = encoder.encode(name);

    // name (100 bytes)
    header.set(nameBytes.slice(0, 100));
    // mode (8 bytes) - 644
    encoder.encodeInto('0000644', header.subarray(100, 108));
    // uid (8)
    encoder.encodeInto('0001750', header.subarray(108, 116));
    // gid (8)
    encoder.encodeInto('0001750', header.subarray(116, 124));
    // size (12 bytes) - octal
    const sizeStr = data.length.toString(8).padStart(11, '0');
    encoder.encodeInto(sizeStr, header.subarray(124, 135));
    // mtime (12) - current time octal
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
    encoder.encodeInto(mtime, header.subarray(136, 147));
    // checksum placeholder (8 spaces)
    encoder.encodeInto('        ', header.subarray(148, 156));
    // type - '0' for file
    header[156] = 48; // '0'
    // link name (100)
    // magic (6) - "ustar"
    encoder.encodeInto('ustar', header.subarray(257, 262));
    // version (2) - "00"
    encoder.encodeInto('00', header.subarray(263, 265));
    // uname (32)
    // gname (32)

    // Calculate checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    const chkStr = checksum.toString(8).padStart(6, '0');
    encoder.encodeInto(chkStr + '\0 ', header.subarray(148, 156));

    chunks.push(header);

    // File data, padded to 512 bytes
    const paddedLen = Math.ceil(data.length / 512) * 512;
    const padded = new Uint8Array(paddedLen);
    padded.set(data);
    chunks.push(padded);
  }

  // End of archive: two 512-byte zero blocks
  chunks.push(new Uint8Array(1024));

  // Combine all chunks
  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

function getFilesForFunction(slug) {
  const dir = join(FUNCS, slug);
  const files = [];

  // Entry file
  const entry = ['index.ts', 'index.tsx', 'index.js', 'mod.ts']
    .find(f => existsSync(join(dir, f)));
  if (!entry) return null;

  const entryContent = readFileSync(join(dir, entry), 'utf-8');

  // Check for bundled version
  const bundledPath = join(dir, 'index.bundled.ts');
  if (existsSync(bundledPath)) {
    // Bundled already has everything, just use it
    files.push(['index.ts', readFileSync(bundledPath, 'utf-8')]);
    return files;
  }

  files.push(['index.ts', entryContent]);

  // Add _shared files that are imported
  const importRegex = /from\s+"\.\.\/_shared\/(\w+)\.ts"/g;
  const neededShared = new Set();
  let match;
  while ((match = importRegex.exec(entryContent)) !== null) {
    neededShared.add(match[1]);
  }

  for (const name of neededShared) {
    const sharedPath = join(FUNCS, '_shared', `${name}.ts`);
    if (existsSync(sharedPath)) {
      const content = readFileSync(sharedPath, 'utf-8');
      files.push([`_shared/${name}.ts`, content]);
    }
  }

  return files;
}

async function deployOne(slug, files) {
  if (!files) return { ok: false, error: 'no entrypoint' };

  const url = `https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${encodeURIComponent(slug)}`;
  const tarData = createTar(files);

  const metadata = {
    name: slug,
    entrypoint_path: `index.ts`,
    verify_jwt: !slug.includes('webhook') && slug !== 'cashfree-checkout' && slug !== 'create_org_with_admin' && slug !== 'redeem-staff-invite' && slug !== 'register_org',
  };

  const boundary = '----boundary' + Math.random().toString(36).slice(2);
  const encoder = new TextEncoder();
  const headerParts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="metadata"\r\n',
    'Content-Type: application/json\r\n\r\n',
    JSON.stringify(metadata) + '\r\n',
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="file"; filename="archive.tar"\r\n',
    'Content-Type: application/octet-stream\r\n\r\n',
  ].map(s => encoder.encode(s));

  const footer = encoder.encode(`\r\n--${boundary}--\r\n`);

  const totalLen = headerParts.reduce((s, p) => s + p.length, 0) + tarData.length + footer.length;
  const body = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of headerParts) { body.set(p, offset); offset += p.length; }
  body.set(tarData, offset); offset += tarData.length;
  body.set(footer, offset);

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
    const files = getFilesForFunction(slug);
    if (!files) {
      console.log('SKIP (no entrypoint)');
      fail++;
      continue;
    }
    const res = await deployOne(slug, files);
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
