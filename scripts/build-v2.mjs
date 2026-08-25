import { cpSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const v2Dir = path.join(root, "v2");

if (!existsSync(path.join(v2Dir, "package.json"))) {
  console.log("[build-v2] v2/ not present — skipping v2 build");
  process.exit(0);
}

execSync("npm ci --no-audit --no-fund", { cwd: v2Dir, stdio: "inherit" });
execSync("npm run typecheck && npm run lint && npm test", { cwd: v2Dir, stdio: "inherit" });
execSync("npm run build", { cwd: v2Dir, stdio: "inherit" });

const dest = path.join(root, "public", "v2");
rmSync(dest, { recursive: true, force: true });
cpSync(path.join(v2Dir, "dist"), dest, { recursive: true });
console.log("[build-v2] v2 bundle copied to public/v2 (served at /v2/)");
