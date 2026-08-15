-- SiteTrack Pro — B4: Wire notification email delivery.
-- The 186 trigger read app.* GUC settings that were never set anywhere, so
-- net.http_post(url := NULL) failed silently on every insert. This migration:
--   1. Adds a notify_config key/value table (deliver_url seeded; deliver_token
--      is set by scripts/configure-notify-delivery.mjs — never committed).
--   2. Rebuilds trigger_notify_deliver() to read config from the table
--      (falling back to the GUC settings, which are now optional).
--   3. Restricts notify_config reads to service_role only.

BEGIN;

-- 1. Config table
CREATE TABLE IF NOT EXISTS public.notify_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.notify_config (key, value) VALUES
  ('deliver_url', 'https://nntkxojdeyziemdhyjvg.supabase.co/functions/v1/notify-deliver')
ON CONFLICT (key) DO NOTHING;

-- 2. Rebuild trigger function to read config from the table
CREATE OR REPLACE FUNCTION public.trigger_notify_deliver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_token text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Read wiring from notify_config (falls back to GUC settings if absent)
    SELECT value INTO v_url FROM public.notify_config WHERE key = 'deliver_url';
    SELECT value INTO v_token FROM public.notify_config WHERE key = 'deliver_token';
    v_url := coalesce(v_url, current_setting('app.notify_deliver_url', true));
    v_token := coalesce(v_token, current_setting('app.notify_internal_token', true));

    IF v_url IS NULL OR v_token IS NULL THEN
      RAISE NOTICE 'notify-deliver not configured (url=%, token=%)', v_url IS NOT NULL, v_token IS NOT NULL;
      RETURN NEW;
    END IF;

    v_payload := jsonb_build_object('id', NEW.id);

    -- Call notify-deliver via net.http_post (requires supabase.net_http extension)
    -- Idempotent: notify-deliver checks delivered_at and no-ops if already set
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Internal-Token', v_token
      ),
      body := v_payload,
      timeout_milliseconds := 5000
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fail silently: don't block notification creation if delivery EF is down
  RAISE NOTICE 'notify-deliver trigger failed: %', SQLERRM;
  RETURN NEW;
END $$;

-- 3. RLS: only service_role can read config (trigger runs as postgres owner)
ALTER TABLE public.notify_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notify_config_read ON public.notify_config;
CREATE POLICY notify_config_read ON public.notify_config FOR SELECT
  TO service_role USING (true);

REVOKE ALL ON public.notify_config FROM authenticated, anon;
GRANT SELECT ON public.notify_config TO service_role;

-- 4. Verification notice
DO $$ DECLARE
  cfg int; trg int;
BEGIN
  SELECT count(*) INTO cfg FROM public.notify_config;
  SELECT count(*) INTO trg FROM information_schema.triggers WHERE trigger_name = 'trg_notify_deliver';
  RAISE NOTICE '198_notify_delivery_wiring: notify_config=%, trg_notify_deliver=%', cfg, trg;
END $$;

COMMIT;
