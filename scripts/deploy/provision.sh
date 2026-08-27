#!/usr/bin/env bash
# SiteTrack Pro — one-shot local provisioning helper
#
# What it does (interactively):
#   1. Verifies Node 20+ and npm are installed.
#   2. Installs npm dependencies.
#   3. Asks for your Supabase URL + anon key + writes .env.local.
#   4. Optionally installs @supabase/supabase-js.
#   5. Runs `npm test` (lint + build + smoke + vitest).
#   6. Prints the next-step checklist from docs/setup/GOLIVE.md.
#
# Usage:
#   bash scripts/provision.sh

set -euo pipefail

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
dim()  { printf "\033[2m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
ask()  { printf "\033[34m? \033[0m%s " "$*"; }

bold "SiteTrack Pro — local provisioning"
echo

# ── 1. Tooling check ────────────────────────────────────────────────────────
bold "Step 1/6 — Tooling check"
command -v node >/dev/null 2>&1 || { echo "Node is not installed. Install Node 20+ from https://nodejs.org and retry."; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $NODE_MAJOR detected — SiteTrack needs Node 20+. Upgrade and retry."
  exit 1
fi
ok "Node $(node -v) detected"
command -v npm >/dev/null 2>&1 || { echo "npm not installed."; exit 1; }
ok "npm $(npm -v) detected"
echo

# ── 2. Dependencies ─────────────────────────────────────────────────────────
bold "Step 2/6 — Dependencies"
npm install --silent
ok "npm dependencies installed"
echo

# ── 3. .env.local ───────────────────────────────────────────────────────────
bold "Step 3/6 — Environment file"
if [ -f .env.local ]; then
  ok ".env.local already exists — skipping"
else
  ask "Run in backend mode (Supabase)? [y/N]"
  read -r BACKEND_YN
  if [[ "$BACKEND_YN" =~ ^[Yy]$ ]]; then
    ask "Supabase URL (https://*.supabase.co):"
    read -r SUPA_URL
    ask "Supabase anon key (eyJ...):"
    read -r SUPA_KEY
    cat > .env.local <<EOF
VITE_BACKEND=supabase
VITE_SUPABASE_URL=$SUPA_URL
VITE_SUPABASE_ANON_KEY=$SUPA_KEY
EOF
    ok ".env.local written with backend mode"
    ask "Install @supabase/supabase-js now? [Y/n]"
    read -r SDK_YN
    if [[ ! "$SDK_YN" =~ ^[Nn]$ ]]; then
      npm install @supabase/supabase-js --silent
      ok "Supabase SDK installed"
    fi
  else
    cp .env.example .env.local
    ok ".env.local written in local demo mode"
  fi
fi
echo

# ── 4. Run tests ────────────────────────────────────────────────────────────
bold "Step 4/6 — Run full test pipeline"
npm test
ok "All green: lint + build + smoke + vitest"
echo

# ── 5. Print next steps ─────────────────────────────────────────────────────
bold "Step 5/6 — Next steps"
cat <<EOF
  $(dim "─── To run locally:")
  npm run dev
  $(dim "App opens at http://localhost:5173")

  $(dim "─── To deploy to Vercel:")
  See docs/setup/GOLIVE.md (30-minute checklist).

  $(dim "─── To run Supabase schema:")
  Open https://supabase.com → SQL Editor
  Paste each file in order:
    scripts/supabase/01_schema.sql
    scripts/supabase/02_rls.sql
    scripts/supabase/04_rls_tests.sql

  $(dim "─── To migrate demo data into Supabase:")
  Login as super admin → Admin → System Settings → "Run migration now"
EOF
echo

bold "Step 6/6 — Done"
ok "SiteTrack is ready to run."
