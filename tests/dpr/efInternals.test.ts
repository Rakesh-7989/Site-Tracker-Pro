// SiteTrack Pro — EF internals source-contract tests (Sprint 2 DPR EFs).
//
// Locks the Sprint 2 hardening contracts for the three DPR Edge Functions:
// idempotency (client_token / audio_sha256 / composite PK), retry policy,
// quota guard, cache-first behavior, and the security gate. Pure file
// parsing — no Deno runtime needed (matches tests/efAuthWiring.test.ts).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const efDir = join(process.cwd(), "supabase", "functions");
const src = (name: string) => readFileSync(join(efDir, name, "index.ts"), "utf8");

const dprSend = src("whatsapp_dpr_send");
const voice = src("voice_transcribe");
const anchor = src("buildnow_anchor");

describe("whatsapp_dpr_send — Sprint 2 hardening", () => {
  it("has a client_token idempotency upsert (on_conflict org_id, client_token)", () => {
    expect(dprSend).toMatch(/dpr_messages\?on_conflict=org_id,client_token/);
    expect(dprSend).toMatch(/resolution=merge-duplicates/);
  });

  it("returns cached idempotently when the message is already terminal", () => {
    expect(dprSend).toMatch(/cached:\s*true/);
    expect(dprSend).toMatch(/message\?\.status === "sent" \|\| message\?\.status === "delivered" \|\| message\?\.status === "read"/);
  });

  it("uses the shared retry helper with maxAttempts 3 + exponential backoff", () => {
    expect(dprSend).toMatch(/from\s+["']\.\.\/_shared\/retry\.ts["']/);
    expect(dprSend).toMatch(/maxAttempts:\s*3/);
    expect(dprSend).toMatch(/baseMs:\s*1000/);
  });

  it("does not retry permanent validation/auth errors", () => {
    expect(dprSend).toMatch(/missing\|not implemented\|unauthorized\|forbidden/i);
  });

  it("writes one dpr_delivery_log row per attempt", () => {
    expect(dprSend).toMatch(/dpr_delivery_log/);
    expect(dprSend).toMatch(/attempt_number/);
    expect(dprSend).toMatch(/duration_ms/);
  });

  it("has a budget/quota guard that can hard-block (402)", () => {
    expect(dprSend).toMatch(/incrementQuota/);
    expect(dprSend).toMatch(/whatsapp_quota_increment/);
    expect(dprSend).toMatch(/status: 402/);
    expect(dprSend).toMatch(/budget-blocked/);
  });

  it("sends via the shared real Meta client (not a bare stub)", () => {
    expect(dprSend).toMatch(/from\s+["']\.\.\/_shared\/whatsapp_client\.ts["']/);
    expect(dprSend).toMatch(/sendWhatsAppMessage/);
    expect(dprSend).toMatch(/SITETRACK_DRY_RUN/);
  });

  it("validates required fields + E.164 + confidence range", () => {
    expect(dprSend).toMatch(/missing required field/);
    expect(dprSend).toMatch(/E\.164/);
    expect(dprSend).toMatch(/transcript_confidence must be in \[0, 1\]/);
  });

  it("authenticates the caller with the DPR submit role set", () => {
    expect(dprSend).toMatch(/requireRole/);
    expect(dprSend).toMatch(/site_engineer/);
    expect(dprSend).toMatch(/requirePlanFeature/);
  });
});

describe("voice_transcribe — Sprint 2 hardening", () => {
  it("validates audio_sha256 as 64-char lowercase hex", () => {
    expect(voice).toMatch(/audio_sha256 must be 64-char lowercase hex/);
    expect(voice).toMatch(/\[0-9a-f\]\{64\}/);
  });

  it("is cache-first (looks up voice_transcripts before provider chain)", () => {
    expect(voice).toMatch(/voice_transcripts\?audio_sha256=eq\./);
    expect(voice).toMatch(/cached:\s*true/);
  });

  it("bumps the cache-hit counter via RPC", () => {
    expect(voice).toMatch(/record_voice_cache_hit/);
  });

  it("walks the provider chain in request order and records provider_tried", () => {
    expect(voice).toMatch(/provider_order/);
    expect(voice).toMatch(/provider_tried/);
  });

  it("has mock + shell provider implementations with API-key guards", () => {
    expect(voice).toMatch(/BHASHINI_API_KEY/);
    expect(voice).toMatch(/AWS_ACCESS_KEY_ID/);
    expect(voice).toMatch(/transcribeMock/);
  });

  it("writes the transcript cache row best-effort with ignore-duplicates", () => {
    expect(voice).toMatch(/voice_transcripts/);
    expect(voice).toMatch(/resolution=ignore-duplicates/);
  });

  it("authenticates the caller", () => {
    expect(voice).toMatch(/authenticate\(/);
  });
});

describe("buildnow_anchor — Sprint 2 hardening", () => {
  it("canonicalizes metadata before hashing", () => {
    expect(anchor).toMatch(/canonicalize/);
    expect(anchor).toMatch(/sha256Hex/);
  });

  it("upserts per-day idempotently (project_id, sync_date composite)", () => {
    expect(anchor).toMatch(/on_conflict=project_id,sync_date/);
    expect(anchor).toMatch(/sync_date/);
  });

  it("has api → scrape acquisition path ordering with mock fallback", () => {
    expect(anchor).toMatch(/fetchViaApi/);
    expect(anchor).toMatch(/fetchViaScrape/);
    expect(anchor).toMatch(/fetchViaMock/);
  });

  it("authenticates the caller", () => {
    expect(anchor).toMatch(/authenticate\(/);
  });
});
