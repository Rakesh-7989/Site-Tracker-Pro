-- SiteTrack Pro — notifications inbox v3 bridge (2026-06-06).
-- The notifications table already has correct RLS (read/update your OWN rows)
-- but no table GRANT to authenticated (the recurring Phase-3 bug). Add it +
-- an unread-count RPC for the sidebar badge. IDEMPOTENT.

BEGIN;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
REVOKE ALL ON public.notifications FROM anon;

CREATE OR REPLACE FUNCTION public.unread_notification_count()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.notifications WHERE user_id = auth.uid() AND read_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.unread_notification_count() TO authenticated;

COMMIT;
