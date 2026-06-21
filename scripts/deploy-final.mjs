import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const ref = "nntkxojdeyziemdhyjvg";
const token = process.env.SUPABASE_ACCESS_TOKEN;

const slugs = ["create_org_with_admin", "invite_org_member"];

for (const slug of slugs) {
  const content = readFileSync(`supabase/functions/${slug}/index.bundled.ts`, "utf8");
  const payload = JSON.stringify({ body: content, name: slug });
  const outPath = process.env.TEMP + `/ef_deploy_${slug}.json`;
  writeFileSync(outPath, payload, "utf8");
  
  const result = execSync(
    `curl.exe -s -X PATCH "https://api.supabase.com/v1/projects/${ref}/functions/${slug}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d "@${outPath}"`,
    { encoding: "utf8", timeout: 60000 }
  );
  
  const info = JSON.parse(result);
  console.log(`✓ ${slug}: version=${info.version} status=${info.status} verify_jwt=${info.verify_jwt}`);
}
