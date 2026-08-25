-- SiteTrack Pro — migration 237: SECURITY DEFINER search-path hardening.
--
-- Production-audit P0: "Verify every SECURITY DEFINER function". A definer
-- function without a pinned search_path executes under the owner's
-- privileges with an attacker-influenceable lookup path (search_path
-- hijack via temp-object shadowing). Live survey (check:definer, 2026-08-24):
--   157 definer functions total, 146 pinned, 6 of OURS unpinned:
--     accept_org_invitation(text), create_org_invitation(text,text),
--     audit_flag_change(), chat_channel_readable(chat_channels),
--     record_cashfree_event(...), record_voice_cache_hit(text).
--   5 unpinned are EXTENSION-OWNED (graphql.get/increment_schema_version,
--   st_estimatedextent x3) — intentionally NOT touched here; the platform/
--   extension replaces them on upgrade and the checker allowlists them.
--
-- Pin = `public, extensions, pg_temp`: app objects resolve from public,
-- pgcrypto/pg_net-style helpers from the Supabase `extensions` schema,
-- temp objects last (never first — that's the shadowing vector).
-- ALTER FUNCTION is idempotent and safe for RLS-predicate helpers
-- (chat_channel_readable is referenced by live policies — config-only
-- change, no policy rewrite needed).

alter function public.accept_org_invitation(p_token text)
  set search_path = public, extensions, pg_temp;

alter function public.create_org_invitation(p_email text, p_role text)
  set search_path = public, extensions, pg_temp;

alter function public.audit_flag_change()
  set search_path = public, extensions, pg_temp;

alter function public.chat_channel_readable(cc public.chat_channels)
  set search_path = public, extensions, pg_temp;

alter function public.record_cashfree_event(
  p_event_id text, p_org_id uuid, p_subscription_id text,
  p_event_type text, p_signature text, p_raw jsonb)
  set search_path = public, extensions, pg_temp;

alter function public.record_voice_cache_hit(p_audio_sha256 text)
  set search_path = public, extensions, pg_temp;
