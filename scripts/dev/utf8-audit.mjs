import { execSync } from 'child_process';
import { readFileSync } from 'fs';

function isValidUTF8(buf) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try { decoder.decode(buf); return true; }
  catch { return false; }
}

function describeCorruption(buf) {
  let details = [];
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b <= 0x7F) { i++; }
    else if (b >= 0xC2 && b <= 0xDF) {
      if (i + 1 >= buf.length || (buf[i+1] & 0xC0) !== 0x80) {
        details.push(`pos ${i}: truncated 2-byte (lead 0x${b.toString(16)})`);
        i++;
      } else { i += 2; }
    } else if (b >= 0xE0 && b <= 0xEF) {
      if (i + 2 >= buf.length || (buf[i+1] & 0xC0) !== 0x80 || (buf[i+2] & 0xC0) !== 0x80) {
        details.push(`pos ${i}: truncated 3-byte (lead 0x${b.toString(16)})`);
        i++;
      } else { i += 3; }
    } else if (b >= 0xF0 && b <= 0xF4) {
      if (i + 3 >= buf.length || (buf[i+1] & 0xC0) !== 0x80 || (buf[i+2] & 0xC0) !== 0x80 || (buf[i+3] & 0xC0) !== 0x80) {
        details.push(`pos ${i}: truncated 4-byte (lead 0x${b.toString(16)})`);
        i++;
      } else { i += 4; }
    } else if (b >= 0x80 && b <= 0xBF) {
      details.push(`pos ${i}: orphaned continuation byte 0x${b.toString(16)}`);
      i++;
    } else if (b >= 0xF5 && b <= 0xFF) {
      details.push(`pos ${i}: invalid start byte 0x${b.toString(16)}`);
      i++;
    } else { i++; }
    if (details.length >= 5) break;
  }
  return details;
}

function scanRef(ref) {
  let hash;
  try { hash = execSync(`git rev-parse ${ref}`, { encoding: 'utf8', timeout: 10000 }).trim(); }
  catch { return null; }

  const gitFiles = execSync(`git ls-tree -r --name-only ${ref}`, { encoding: 'utf8', timeout: 30000 })
    .trim().split('\n').filter(Boolean);

  let corrupted = [];
  for (const file of gitFiles) {
    if (!/\.(tsx?|jsx?|css|json|md|mjs|html)$/i.test(file)) continue;
    try {
      const buf = execSync(`git cat-file blob "${ref}:${file}"`, { encoding: 'buffer', timeout: 10000 });
      if (!isValidUTF8(buf)) {
        const details = describeCorruption(buf);
        corrupted.push({ file, details });
      }
    } catch { /* file not found in this ref */ }
  }
  return { hash, total: gitFiles.length, corrupted };
}

// main
const refs = process.argv.slice(2);
if (refs.length === 0) refs.push('HEAD');

for (const ref of refs) {
  const result = scanRef(ref);
  if (!result) { console.log(`${ref}: not found`); continue; }
  console.log(`\n${ref} (${result.hash.substring(0,12)}): ${result.corrupted.length}/${result.total} source files corrupted`);
  if (result.corrupted.length > 0) {
    for (const { file, details } of result.corrupted) {
      console.log(`  ❌ ${file}`);
      for (const d of details) console.log(`     ${d}`);
    }
    console.log(`\n  Fix: git checkout <clean-ref> -- <files>`);
  } else {
    console.log('  ✅ All clean');
  }
}

// Also check working tree
const gitFiles = execSync('git ls-files', { encoding: 'utf8', timeout: 30000 })
  .trim().split('\n').filter(Boolean);
let wtCorrupted = [];
for (const file of gitFiles) {
  if (!/\.(tsx?|jsx?|css|json|md|mjs|html)$/i.test(file)) continue;
  try {
    const buf = readFileSync(file);
    if (!isValidUTF8(buf)) wtCorrupted.push(file);
  } catch { /* skip unreadable files */ }
}
console.log(`\nWorking tree: ${wtCorrupted.length}/${gitFiles.length} source files corrupted`);
if (wtCorrupted.length > 0) {
  for (const f of wtCorrupted) console.log(`  ❌ ${f}`);
} else {
  console.log('  ✅ All clean');
}
