-- 266_push_subscription.sql — self-contained Web Push subscriptions.
-- Adds per-profile push subscription columns, widens the notification channel
-- CHECKs to admit 'push', and a self-service RPC to save/clear the subscription
-- (mirrors complete_my_profile: SECURITY DEFINER, writes only the caller's own row).

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='push_endpoint') then
    alter table public.profiles add column push_endpoint text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='profiles' and column_name='push_keys') then
    alter table public.profiles add column push_keys jsonb;
  end if;
end $$;

-- push_keys must be an object carrying the two RFC 8291 parts (base64url p256dh
-- ECDH public key + auth secret). NULL stays allowed (no subscription yet).
alter table public.profiles drop constraint if exists profiles_push_keys_shape_check;
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname='profiles_push_keys_shape_check' and conrelid='public.profiles'::regclass) then
    execute 'alter table public.profiles add constraint profiles_push_keys_shape_check check (
      push_keys is null or (
        jsonb_typeof(push_keys) = ''object'' and push_keys ? ''p256dh'' and push_keys ? ''auth''
      )
    )';
  end if;
end $$;

-- Widen the channel CHECKs so 'push' is a legal notification channel everywhere
-- email/whatsapp already are.
alter table public.notification_rules drop constraint if exists notification_rules_channel_check;
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname='notification_rules_channel_check' and conrelid='public.notification_rules'::regclass) then
    execute 'alter table public.notification_rules add constraint notification_rules_channel_check check (
      channel = any (array[''in_app'',''email'',''whatsapp'',''push''])
    )';
  end if;
end $$;

alter table public.notification_templates drop constraint if exists notification_templates_channel_check;
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname='notification_templates_channel_check' and conrelid='public.notification_templates'::regclass) then
    execute 'alter table public.notification_templates add constraint notification_templates_channel_check check (
      channel = any (array[''email'',''whatsapp'',''push''])
    )';
  end if;
end $$;

-- Self-service: the signed-in user saves their own browser push subscription.
-- SECURITY DEFINER so it works regardless of the profiles UPDATE RLS; it only
-- ever writes the caller's own row (id = auth.uid()).
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text
) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_endpoint,'')),'') is null then
    raise exception 'Push endpoint is required' using errcode = '23514';
  end if;
  if nullif(trim(coalesce(p_p256dh,'')),'') is null
     or nullif(trim(coalesce(p_auth_secret,'')),'') is null then
    raise exception 'Push keys are required' using errcode = '23514';
  end if;
  update public.profiles set
    push_endpoint = trim(p_endpoint),
    push_keys = jsonb_build_object('p256dh', trim(p_p256dh), 'auth', trim(p_auth_secret))
  where id = auth.uid();
  return found;
end $$;

grant execute on function public.save_push_subscription(text,text,text) to authenticated;

-- Self-service: the signed-in user clears their own subscription (opt-out).
create or replace function public.clear_push_subscription() returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  update public.profiles set
    push_endpoint = null,
    push_keys = null
  where id = auth.uid();
  return found;
end $$;

grant execute on function public.clear_push_subscription() to authenticated;