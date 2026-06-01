// One-shot helper: extract the finalDoc field from the workflow output JSON
// and write it to docs/SITETRACK_V3_PLAN.md.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'C:\\Users\\boyap\\AppData\\Local\\Temp\\claude\\C--Users-boyap\\0a931bca-607b-4a8a-93ed-f7cb9639f13a\\tasks\\w957hlybp.output';
const DST = path.join(process.cwd(), 'docs', 'SITETRACK_V3_PLAN.md');

const raw = fs.readFileSync(SRC, 'utf8');
const data = JSON.parse(raw);
const doc = data.result.finalDoc;
if (typeof doc !== 'string' || !doc.length) {
  console.error('finalDoc missing or empty');
  process.exit(1);
}
fs.writeFileSync(DST, doc, 'utf8');
console.log(`Wrote ${doc.length} chars to ${DST}`);
console.log(`First 120 chars: ${doc.slice(0, 120)}`);
