import fs from 'fs'
import path from 'path'

const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', 'dist', 'build', '.git'].includes(e.name)) walk(p)
    } else if (e.name.endsWith('.tsx')) files.push(p)
  }
}
walk('src')

// Card whose FIRST child is a header row (flex justify-between) or a heading,
// with no prop-driven header already in use.
const re = /<Card\s+([^>]*?)>(\s*(?:{\s*)?|\n\s*)(<(?:h2|h3|h4)\b|<div[^>]*className="[^"]*(?:flex items-center justify-between|header)[^"]*")/g

const hits = []
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  let m
  while ((m = re.exec(s))) {
    const ln = s.slice(0, m.index).split('\n').length
    const attrs = m[1]
    const hasPropHeader = /title=|action=/.test(attrs)
    hits.push({ file: f, line: ln, hasPropHeader })
  }
}
const actionable = hits.filter((h) => !h.hasPropHeader)
console.log('matches:', hits.length, '| without title/action prop already:', actionable.length)
console.log(actionable.map((h) => `${h.file}:${h.line}`).join('\n'))
