-- SiteTrack Pro — Demo project seeder (v5 Growth quick-win).
-- One-click "Load demo project" support for onboarding: creates a realistic
-- villa project with milestones, tasks, issues and expenses so a brand-new
-- org sees a fully-populated dashboard (incl. live Risk signals) in seconds.
--
-- Security: SECURITY DEFINER but gated to ORG ADMINS (is_orgadmin()) — the
-- same surface allowed to create projects in the UI. Idempotent: re-running
-- returns the existing demo project instead of duplicating. Quota/plan-limit
-- triggers still fire (fresh trials have headroom; over-limit raises a clear
-- error).

BEGIN;

create or replace function public.seed_demo_project()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_org      uuid;
  v_existing uuid;
  v_project  uuid;
  v_budget   constant bigint := 25_000_000; -- ₹2.5 Cr
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Resolve the caller's active org (org_members.role = 'admin')
  select om.org_id into v_org
    from public.org_members om
    where om.profile_id = v_uid and om.status = 'active'
    limit 1;
  if v_org is null or not public.is_orgadmin() then
    raise exception 'org admin required';
  end if;

  -- Idempotency: reuse the demo project when it already exists
  select p.id into v_existing
    from public.projects p
    where p.org_id = v_org and p.name = 'Demo Villa — Green Meadows'
    limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.projects (org_id, name, description, location, status, progress,
                               budget, start_date, expected_end_date,
                               client_name, client_email)
  values (
    v_org,
    'Demo Villa — Green Meadows',
    'Sample 4BHK villa project loaded from onboarding — explore DPRs, tasks, materials, finance and risk signals.',
    'Hyderabad, Telangana',
    'active',
    38,
    v_budget,
    current_date - 60,
    current_date + 120,
    'Mr. Ravi Sharma',
    'ravi.sharma@example.com'
  )
  returning id into v_project;

  -- ── Milestones (structure deliberately overdue → live schedule-slip signal)
  insert into public.milestones (project_id, title, status, due_date, completed_date, sort_order) values
    (v_project, 'Excavation & footing',   'completed',   current_date - 50, current_date - 46, 1),
    (v_project, 'Plinth beams',           'completed',   current_date - 35, current_date - 33, 2),
    (v_project, 'Ground floor structure', 'in_progress', current_date - 8,  null,              3),
    (v_project, 'Brickwork & plastering', 'pending',     current_date + 15, null,              4),
    (v_project, 'Finishing & fittings',   'pending',     current_date + 45, null,              5),
    (v_project, 'Handover',               'pending',     current_date + 90, null,              6);

  -- ── Tasks
  insert into public.tasks (project_id, title, status, priority, due_date) values
    (v_project, 'Slab shuttering for ground floor',  'in_progress', 'high',   current_date + 2),
    (v_project, 'Steel reinforcement — column C4',   'in_progress', 'high',   current_date + 1),
    (v_project, 'Order M-sand for plastering',       'pending',     'medium', current_date + 7),
    (v_project, 'Electrical conduit rough-in',       'pending',     'medium', current_date + 12),
    (v_project, 'Book quality inspection — slab',    'pending',     'high',   current_date + 3),
    (v_project, 'Weekly labour attendance review',   'pending',     'low',    current_date + 5);

  -- ── Issues (1 open high + 1 open medium + 1 resolved)
  insert into public.issues (project_id, title, description, severity, status, reported_date) values
    (v_project, 'Hairline cracks in column plaster',
     'Observed hairline cracks on GF column plastering — needs curing review.',
     'high', 'open', current_date - 4),
    (v_project, 'Cement supply delay from vendor',
     'Vendor confirmed dispatch slip; 2-day delay expected on PPC bags.',
     'medium', 'open', current_date - 2),
    (v_project, 'Water pooling near excavation pit',
     'Resolved with a temporary sump pump + grading.',
     'medium', 'resolved', current_date - 20);

  -- ── Expenses (~82% of budget burned → live budget-burn signal)
  insert into public.expenses (project_id, category, description, amount, paid_via, expense_date) values
    (v_project, 'material',  'RCC cement — 800 bags OPC',          3_200_000, 'bank', current_date - 48),
    (v_project, 'material',  'TMT steel 8–16mm — 14 t',            5_000_000, 'bank', current_date - 44),
    (v_project, 'material',  'M-sand & aggregate — 40 loads',      1_850_000, 'upi',  current_date - 40),
    (v_project, 'labour',    'Civil labour gang — month 1',        2_400_000, 'cash', current_date - 30),
    (v_project, 'labour',    'Civil labour gang — month 2',        2_600_000, 'cash', current_date - 12),
    (v_project, 'equipment', 'Concrete mixer + vibrator rental',     9_40_000, 'upi',  current_date - 26),
    (v_project, 'material',  'Shuttering plates & props',          1_720_000, 'bank', current_date - 22),
    (v_project, 'admin',     'Site shed, power & water',             3_60_000, 'cash', current_date - 18),
    (v_project, 'labour',    'Bar-bender crew — slab prep',        1_480_000, 'cash', current_date - 8),
    (v_project, 'material',  'Waterproofing compound & admixtures',  4_90_000, 'upi',  current_date - 5);

  return v_project;
end;
$$;

comment on function public.seed_demo_project() is
  'Growth quick-win: seeds an idempotent demo villa project (milestones/tasks/issues/expenses) for the caller''s org. Org admins only.';

grant execute on function public.seed_demo_project() to authenticated;

do $$ begin
  raise notice '227_seed_demo_project: seed_demo_project() ready (org-admin gated, idempotent)';
end $$;

COMMIT;
