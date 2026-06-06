-- SiteTrack Pro — project messages v3 bridge (2026-06-06).
-- Project discussion/chat. GRANT SELECT+INSERT + v3 policies via can_read_project
-- (anyone who can read the project can read + post). No UPDATE/DELETE grant —
-- messages are append-only from the UI. IDEMPOTENT. Depends on migration 72.

BEGIN;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.messages TO authenticated;
REVOKE ALL ON public.messages FROM anon;

DROP POLICY IF EXISTS v3_read_messages   ON public.messages;
DROP POLICY IF EXISTS v3_insert_messages ON public.messages;
CREATE POLICY v3_read_messages   ON public.messages FOR SELECT USING (public.can_read_project(project_id));
CREATE POLICY v3_insert_messages ON public.messages FOR INSERT WITH CHECK (public.can_read_project(project_id));

COMMIT;
