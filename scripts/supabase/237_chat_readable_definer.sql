-- SiteTrack Pro — chat_channel_readable runs as definer.
-- The function reads org/project membership tables whose own RLS contexts
-- differ inside storage-object policy evaluation; making it SECURITY DEFINER
-- computes access authoritatively (identical semantics, owner privileges).

BEGIN;

alter function public.chat_channel_readable(cc public.chat_channels)
  security definer;

COMMIT;
