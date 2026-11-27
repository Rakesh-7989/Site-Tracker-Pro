import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function buildAssetWorkerSource() {
  return `const MIME_TYPES = ${JSON.stringify(MIME_TYPES)};

function inferContentType(pathname) {
  const lastSegment = pathname.split("/").pop() || "";
  const dot = lastSegment.lastIndexOf(".");
  if (dot === -1) return "text/html; charset=utf-8";
  const ext = lastSegment.slice(dot).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    if (res.headers.get("content-type")) return res;
    const headers = new Headers(res.headers);
    const pathname = new URL(request.url).pathname;
    headers.set("Content-Type", inferContentType(pathname));
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  },
};
`;
}

function loadEnvLocal(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function walkDir(dir, baseDir = dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, results);
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, fullPath).replace(/\\/g, "/");
      results.push({ fullPath, key: "/" + rel });
    }
  }
  return results;
}

async function main() {
  const rootDir = process.cwd();
  const fileEnv = loadEnvLocal(path.join(rootDir, ".env.local"));
  const token = process.env.CLOUDFLARE_API_TOKEN || fileEnv.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || fileEnv.CLOUDFLARE_ACCOUNT_ID;
  const scriptName = process.env.CLOUDFLARE_ASSETS_WORKER || "sitetrackpro";
  const distDir = path.join(rootDir, "dist");

  if (!token || !accountId) {
    throw new Error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID in environment or .env.local");
  }
  if (!fs.existsSync(distDir)) {
    throw new Error(`dist/ directory not found at ${distDir}`);
  }

  const files = walkDir(distDir);
  const manifest = {};
  const byHash = new Map();

  for (const { fullPath, key } of files) {
    const buf = fs.readFileSync(fullPath);
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
    manifest[key] = { hash, size: buf.length };
    byHash.set(hash, { key, buf });
  }

  console.log(`Prepared manifest for ${files.length} files (${byHash.size} unique hashes).`);

  const sessionRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/assets-upload-session`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ manifest }),
    }
  );
  const sessionData = await sessionRes.json();
  if (!sessionData.success) {
    throw new Error(`assets-upload-session failed (${sessionRes.status}): ${JSON.stringify(sessionData.errors)}`);
  }

  const uploadJwt = sessionData.result?.jwt;
  const buckets = sessionData.result?.buckets || [];
  let completionJwt = uploadJwt;

  console.log(`Upload session created. Buckets to upload: ${buckets.length}`);

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const form = new FormData();
    for (const hash of bucket) {
      const item = byHash.get(hash);
      if (!item) throw new Error(`Missing file for hash ${hash}`);
      form.append(
        hash,
        new Blob([item.buf.toString("base64")], { type: getMimeType(item.key) }),
        hash
      );
    }

    const upRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/assets/upload?base64=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${uploadJwt}`,
        },
        body: form,
      }
    );
    const upData = await upRes.json();
    if (!upData.success) {
      throw new Error(`assets/upload bucket ${i + 1} failed (${upRes.status}): ${JSON.stringify(upData.errors)}`);
    }
    if (upData.result?.jwt) {
      completionJwt = upData.result.jwt;
    }
    console.log(`Uploaded bucket ${i + 1}/${buckets.length} (${bucket.length} files).`);
  }

  if (!completionJwt) {
    throw new Error("No completion JWT returned from assets upload.");
  }

  const metadata = {
    main_module: "worker.js",
    compatibility_date: "2026-11-25",
    bindings: [
      {
        type: "assets",
        name: "ASSETS",
      },
    ],
    assets: {
      jwt: completionJwt,
      config: {
        not_found_handling: "single-page-application",
        run_worker_first: true,
      },
    },
  };

  const deployForm = new FormData();
  deployForm.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  deployForm.append("worker.js", new Blob([buildAssetWorkerSource()], { type: "application/javascript+module" }), "worker.js");

  const deployRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: deployForm,
    }
  );
  const deployData = await deployRes.json();
  if (!deployData.success) {
    throw new Error(`PUT workers/scripts/${scriptName} failed (${deployRes.status}): ${JSON.stringify(deployData.errors)}`);
  }

  console.log(
    `Deployed ${scriptName} successfully:`,
    JSON.stringify({
      success: deployData.success,
      id: deployData.result?.id,
      etag: deployData.result?.etag,
      modified_on: deployData.result?.modified_on,
    })
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
