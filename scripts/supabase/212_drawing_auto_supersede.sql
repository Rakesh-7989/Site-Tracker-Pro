-- SiteTrack Pro — ST-016: auto-supersede old drawing revisions on release.
--
-- The drawings table already enforces "one current per (project, title, type)"
-- via the unique_current_drawing_per_title partial exclusion constraint
-- (01_schema.sql). But nothing flips the OLD current row when a NEWER revision
-- is released — so an architect who releases "Plan Rev B" for a title that
-- still has a "Plan Rev A" at status=current gets an EXCLUSION violation
-- instead of the intended ST-016 behaviour (old revision superseded, latest
-- released revision visible). The DrawingsTab workaround was a manual
-- current/superseded Select.
--
-- This migration adds a BEFORE INSERT trigger that mirrors the old App.jsx
-- auto-supersede behaviour in the database:
--   - when a new row lands with status = 'current', any existing row with the
--     same (project_id, lower(trim(title)), lower(trim(type))) at
--     status = 'current' is flipped to 'superseded' with
--     superseded_by = NEW.id;
--   - the superseded_by FK (drawings_superseded_by_fkey) is made DEFERRABLE
--     INITIALLY DEFERRED so the trigger can set it on the OLD row before the
--     NEW row is physically inserted (both commit together);
--   - SECURITY DEFINER + search_path=public so the flip works even when the
--     releasing user is a member outside the narrow drawings UPDATE role set
--     (matches the GRN trigger posture in migration 167).
--
-- The trigger runs BEFORE INSERT so the partial exclusion constraint (checked
-- at statement end) sees the old row already superseded when the new current
-- row is validated. Idempotent.

BEGIN;

alter table public.drawings
  alter constraint drawings_superseded_by_fkey
  deferrable initially deferred;

create or replace function public.auto_supersede_drawing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'current' then
    update public.drawings
      set status = 'superseded',
          superseded_by = new.id
    where project_id = new.project_id
      and lower(trim(title)) = lower(trim(new.title))
      and lower(trim(type)) = lower(trim(new.type))
      and status = 'current'
      and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_drawings_auto_supersede on public.drawings;
create trigger trg_drawings_auto_supersede
  before insert on public.drawings
  for each row execute function public.auto_supersede_drawing();

comment on function public.auto_supersede_drawing() is
  'ST-016: before a current drawing insert, flip any same (project, title, type) current row to superseded with superseded_by = new.id.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.drawings'::regclass AND tgname = 'trg_drawings_auto_supersede'
  ) AND EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drawings'::regclass AND conname = 'drawings_superseded_by_fkey'
      AND condeferrable AND condeferred
  ) THEN
    RAISE NOTICE 'migration 212 ok: auto-supersede trigger + deferrable FK present';
  ELSE
    RAISE EXCEPTION 'migration 212 FAILED: trigger or deferrable FK missing';
  END IF;
END $$;

COMMIT;