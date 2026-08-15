-- 197_kiosk_clock_out.sql — let kiosk operators clock workers out (P-F follow-up).
--
-- Gap: the Labour kiosk's clock-out did a raw UPDATE on `attendance`, but the
-- `attendance_update` RLS policy is PM+ only (pm/project_admin/project_head/
-- orgadmin/superadmin). A contractor or site_inspector running the kiosk
-- (who CAN clock in — `attendance_insert` is any project member) hit a 42501
-- permission denied the moment they tapped "Clock out".
--
-- Fix: a SECURITY DEFINER RPC that mirrors the clock-in membership gate
-- (caller must be a member of the attendance row's project) but ONLY writes
-- out_time + hours on a single row, and refuses to touch rows that are not
-- checked in. Direct UPDATE/DELETE stays PM+ (correcting kiosk errors),
-- matching the documented policy intent. Mirrors the RPC-gate pattern of
-- approve_time_entry / generate_hourly_invoice.

create or replace function public.kiosk_clock_out(p_attendance_id uuid, p_out_time time, p_hours numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
begin
  if p_out_time is null then
    raise exception 'out time required' using errcode = '22023';
  end if;

  select project_id into v_project_id
    from public.attendance
   where id = p_attendance_id;

  if v_project_id is null then
    raise exception 'attendance row not found' using errcode = 'P0002';
  end if;

  if not (v_project_id in (select public.user_project_ids())) then
    raise exception 'not a member of this project' using errcode = '42501';
  end if;

  update public.attendance
     set out_time = p_out_time,
         hours    = p_hours
   where id = p_attendance_id
     and in_time is not null
     and out_time is null;

  if not found then
    raise exception 'worker is not checked in' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.kiosk_clock_out(uuid, time, numeric) to authenticated;
revoke execute on function public.kiosk_clock_out(uuid, time, numeric) from public, anon;

DO $$ DECLARE n int; BEGIN
  RAISE NOTICE '197_kiosk_clock_out: kiosk_clock_out RPC ready (member-gated clock-out for kiosk operators)';
END $$;
