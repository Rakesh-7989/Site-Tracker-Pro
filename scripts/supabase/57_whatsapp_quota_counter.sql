-- Sprint 2/3 zero-spend guard (Session 30.11) — WhatsApp Cloud API quota meter.
--
-- Meta Cloud API gives 1,000 free service conversations per month per
-- WhatsApp Business Account. Beyond that, each conversation costs
-- ~₹0.40 (marketing-template tier is more). The founder's zero-spend
-- window through June 2027 means we MUST refuse to send when the
-- monthly counter hits the cap unless WHATSAPP_OVERRIDE_PAID=1 is
-- explicitly set by the founder.
--
-- This table tracks per-WABA, per-UTC-month message counts. The
-- whatsapp_dpr_send EF increments the counter via the
-- `whatsapp_quota_increment(waba_id)` RPC right BEFORE attempting the
-- Meta API call. If the counter would exceed the cap, the EF refuses
-- and returns a structured 'budget-blocked' response so the client UI
-- can surface a clear message.
--
-- Why a counter table instead of querying dpr_messages: dpr_messages
-- contains both delivered + failed + queued + dry-run rows. The
-- counter only increments on rows that ACTUALLY hit Meta's API
-- (success or billable failure). Easier to reset for testing.

CREATE TABLE IF NOT EXISTS public.whatsapp_quota_counter (
  waba_id          text NOT NULL,
  utc_month        text NOT NULL,   -- 'YYYY-MM'
  sent_count       integer NOT NULL DEFAULT 0,
  soft_limit       integer NOT NULL DEFAULT 800,   -- warn at 80%
  hard_limit       integer NOT NULL DEFAULT 1000,  -- refuse at 100% (Meta free tier)
  last_increment   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_quota_counter_pk PRIMARY KEY (waba_id, utc_month),
  CONSTRAINT whatsapp_quota_sent_nonneg CHECK (sent_count >= 0)
);

COMMENT ON TABLE public.whatsapp_quota_counter IS
  'Tracks WhatsApp Cloud API service-conversation count per WABA per UTC month. Used by whatsapp_dpr_send EF to enforce the 1k/mo free-tier cap during the founder zero-spend window (June 2026 → June 2027). Soft/hard limits configurable per WABA.';

-- RLS: server-only. The EF uses the service role; no client should touch this.
ALTER TABLE public.whatsapp_quota_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_quota_counter FROM anon, authenticated;

-- Atomic increment helper. Returns the post-increment row so the EF can
-- decide pass / soft-warn / hard-block in one round-trip.
--
-- Idempotency guarantee: the UPSERT + RETURNING is atomic at the row
-- level, so two concurrent EF invocations can't both squeeze through
-- when the counter is at 999.
CREATE OR REPLACE FUNCTION public.whatsapp_quota_increment(
  p_waba_id text,
  p_now timestamptz DEFAULT now()
) RETURNS public.whatsapp_quota_counter
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM');
  v_row public.whatsapp_quota_counter;
BEGIN
  INSERT INTO public.whatsapp_quota_counter (waba_id, utc_month, sent_count, last_increment)
  VALUES (p_waba_id, v_month, 1, p_now)
  ON CONFLICT (waba_id, utc_month)
  DO UPDATE SET
    sent_count = public.whatsapp_quota_counter.sent_count + 1,
    last_increment = EXCLUDED.last_increment
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_quota_increment(text, timestamptz) FROM PUBLIC, anon, authenticated;

-- Read-only helper for the env-config checker + admin dashboard.
CREATE OR REPLACE FUNCTION public.whatsapp_quota_current(p_waba_id text)
RETURNS public.whatsapp_quota_counter
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.whatsapp_quota_counter
  WHERE waba_id = p_waba_id
    AND utc_month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_quota_current(text) FROM PUBLIC, anon, authenticated;
