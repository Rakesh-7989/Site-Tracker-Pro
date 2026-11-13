# SiteTrack Pro — Cloudflare Migration Audit & Architecture Roadmap

This document serves as the single source of truth for migrating SiteTrack Pro from Vercel + Supabase to Cloudflare Native (Pages + Workers + D1 + R2 + Queues).

## Key Metric Baseline
- **Database Tables**: 161
- **Database Functions / RPCs**: 192
- **PostgreSQL Migrations**: 258
- **Deployed Edge Functions**: 26 (including 2 deprecated WhatsApp functions)
- **Frontend App**: React 19 + TypeScript 5.9 + Vite 8
- **Mobile**: Capacitor 8 (Android)

## Working Branch Policy
All migration artifacts, workers code, and D1 schemas are developed exclusively on the `cloudflare-migration` branch. `main` and `prod` remain completely untouched until cutover.

