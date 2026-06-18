#!/usr/bin/env node
// Starts Vite for Playwright in local backend mode so E2E runs never create
// real Supabase users or send real auth email.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
const port = process.env.E2E_PORT || "5174";
const child = spawn(
  process.execPath,
  [viteCli, "--host", "127.0.0.1", "--port", port, "--strictPort", "--open", "false"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_BACKEND: "local",
    },
  },
);

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
