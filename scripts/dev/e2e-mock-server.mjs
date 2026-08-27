#!/usr/bin/env node
// Starts Vite in the DEFAULT (supabase-backed) backend mode so the app boots
// the real shell + router, but with NO real Supabase authentication. Playwright
// specs seed a fake session in localStorage (sb-<ref>-auth-token) and
// route-intercept every /rest/v1/* call to return canned, per-role rows.
//
// This makes role-access specs credential-free + CI-runnable: they render the
// real v3 router, real nav, and real <AccessDenied> gates — without touching
// the live DB, sending auth email, or needing prod credentials.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const viteCli = join(root, "node_modules", "vite", "bin", "vite.js");
const port = process.env.E2E_MOCK_PORT || "5176";
const child = spawn(
  process.execPath,
  [viteCli, "--host", "127.0.0.1", "--port", port, "--strictPort", "--open", "false"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      // Deliberately NOT setting VITE_BACKEND=local: we want supabase mode so
      // getSupabaseClient() returns a real client whose REST calls we can mock.
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
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