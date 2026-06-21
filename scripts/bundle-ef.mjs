// SiteTrack Pro — bundle Edge Function with inlined _shared/auth.ts
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function removeLines(text, excludes) {
  return text.split("\n").filter(l => !excludes.some(e => l.includes(e))).join("\n");
}

function bundle(slug) {
  const authPath = join(ROOT, "supabase/functions/_shared/auth.ts");
  const indexPath = join(ROOT, `supabase/functions/${slug}/index.ts`);
  const outPath = join(ROOT, `supabase/functions/${slug}/index.bundled.ts`);

  let auth = readFileSync(authPath, "utf8");
  let index = readFileSync(indexPath, "utf8");

  // Remove from auth: createClient import, Deno declare, json helper, export keywords
  auth = removeLines(auth, [
    'import { createClient',
    'declare const Deno:',
  ]);
  // Remove const json from auth (keep function's version with CORS)
  // Remove the json helper from auth (keep function's version with CORS)
  auth = auth.replace(
    /const json = \(data: unknown, status: number\): Response =>[\s\S]*?\r?\n\s*\}\);/,
    ""
  );
  // Remove `export` keyword from interfaces/functions (they'll be internal)
  auth = auth.replace(/^export /gm, "");
  // Clean up
  auth = auth.replace(/\n{3,}/g, "\n\n").trim();

  // Remove from index: authenticate import, createClient import (keep one), Deno declare
  index = removeLines(index, [
    'import { authenticate }',
    "import { authenticate }",
    '../_shared/auth.ts',
    "../_shared/auth.ts",
  ]);
  // Remove createClient import from index (we'll add it once)
  index = removeLines(index, [
    'import { createClient }',
  ]);
  // Remove Deno declare from index (we'll add it once)
  index = removeLines(index, [
    'declare const Deno:',
  ]);

  const combined = `// SiteTrack Pro — ${slug} (bundled with shared auth code)
// AUTO-GENERATED — do not edit directly. Edit source files and re-run bundle-ef.mjs

// @ts-ignore — npm specifier; resolved at runtime by Deno.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: { env: { get(n: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

// ── Shared auth code ──

${auth}

// ── Function code ──

${index.trim()}
`;

  writeFileSync(outPath, combined, "utf8");
  console.log(`✓ ${slug}: bundled (${combined.length} chars)`);
}

bundle("create_org_with_admin");
bundle("invite_org_member");
