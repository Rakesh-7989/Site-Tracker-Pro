-- Seed test data for QA / demo.
-- Only creates profiles/org_members/projects for orgs/users that actually exist.
-- Uses the first available org from the live DB.

-- Step 1: create profiles for auth users that lack them
-- Only insert if the auth user exists (FK enforced by WHERE EXISTS)
insert into public.profiles (id, name, role, profile_completed)
select v.id::uuid, v.name, v.role, v.profile_completed
from (values
  ('22222222-2222-2222-2222-222222222222', 'Test PM',           'pm',         true),
  ('33333333-3333-3333-3333-333333333333', 'Test Contractor',   'contractor', true),
  ('44444444-4444-4444-4444-444444444444', 'Test Client',       'client',     true),
  ('55555555-5555-5555-5555-555555555555', 'Test Org Admin',    'orgadmin',   true)
) as v(id, name, role, profile_completed)
where exists (select 1 from auth.users u where u.id = v.id::uuid)
on conflict (id) do nothing;

-- Step 2: add them to orgs with appropriate roles (only if profile exists)
-- Use the first available org from the live DB
insert into public.org_members (org_id, profile_id, role)
select o.id, p.id, m.role
from (values
  ('pm'), ('contractor'), ('client'), ('admin')
) as m(role)
cross join lateral (
  select id from public.organizations limit 1
) o
join public.profiles p on p.role = m.role
on conflict (org_id, profile_id) do nothing;

-- Step 3: create sample projects in the first available org
insert into public.projects (org_id, name, description, location, status, progress, budget, start_date, expected_end_date, client_name, client_email, type)
select o.id, v.name, v.description, v.location, v.status, v.progress, v.budget, v.start_date, v.expected_end_date, v.client_name, v.client_email, v.type
from (values
  ('Green Valley Residency',
   '24-unit apartment complex with 2BHK and 3BHK configurations. Includes basement parking, clubhouse, and landscaped garden.',
   'Hitech City, Hyderabad, Telangana 500081',
   'active', 35, 1200000000,
   '2026-01-15'::date, '2027-06-30'::date,
   'Prasad Constructions', 'prasad@example.com',
   'construction'),
  ('Maple Heights',
   'Premium villa project — 8 independent villas with modern architecture, swimming pool, and smart home automation.',
   'Kokapet, Hyderabad, Telangana 500075',
   'active', 15, 800000000,
   '2026-03-01'::date, '2027-09-30'::date,
   'Maple Developers', 'maple@example.com',
   'construction'),
  ('City Square Commercial',
   'Mixed-use commercial complex with retail outlets, food court, and 3 floors of office space.',
   'Gachibowli, Hyderabad, Telangana 500032',
   'active', 5, 2500000000,
   '2026-06-01'::date, '2028-12-31'::date,
   'Arova Group', 'arova@example.com',
   'construction')
) as v(name, description, location, status, progress, budget, start_date, expected_end_date, client_name, client_email, type)
cross join lateral (
  select id from public.organizations limit 1
) o;

-- Step 4: create a fresh pending + unpaid signup for UPI demo
insert into public.signup_requests (firm_name, contact_name, email, phone, plan, message, status, payment_status)
values (
  'Demo Builder — UPI Test',
  'Demo User',
  'demo.upi@sitetrackpro.in',
  '9876543210',
  'pro',
  'Testing UPI payment flow end-to-end.',
  'pending',
  'unpaid'
);