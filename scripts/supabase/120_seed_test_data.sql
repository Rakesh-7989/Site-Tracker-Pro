-- Seed test data for QA / demo.
-- 4 test auth users exist but have no profiles + no org memberships.
-- Creates profiles, org members, and sample projects.

-- Step 1: create profiles for auth users that lack them
insert into public.profiles (id, name, role, profile_completed)
values
  ('22222222-2222-2222-2222-222222222222', 'Test PM',           'pm',         true),
  ('33333333-3333-3333-3333-333333333333', 'Test Contractor',   'contractor', true),
  ('44444444-4444-4444-4444-444444444444', 'Test Client',       'client',     true),
  ('55555555-5555-5555-5555-555555555555', 'Test Org Admin',    'orgadmin',   true)
on conflict (id) do nothing;

-- Step 2: add them to orgs with appropriate roles
insert into public.org_members (org_id, profile_id, role)
values
  ('4592883d-a022-4934-ace6-30aded7947b1', '22222222-2222-2222-2222-222222222222', 'pm'),
  ('4592883d-a022-4934-ace6-30aded7947b1', '33333333-3333-3333-3333-333333333333', 'contractor'),
  ('4592883d-a022-4934-ace6-30aded7947b1', '44444444-4444-4444-4444-444444444444', 'client'),
  ('556c9432-3edf-4c86-b10b-a97b7c8045da', '55555555-5555-5555-5555-555555555555', 'admin')
on conflict (org_id, profile_id) do nothing;

-- Step 3: create sample projects
insert into public.projects (org_id, name, description, location, status, progress, budget, start_date, expected_end_date, client_name, client_email, type)
values
  ('4592883d-a022-4934-ace6-30aded7947b1',
   'Green Valley Residency',
   '24-unit apartment complex with 2BHK and 3BHK configurations. Includes basement parking, clubhouse, and landscaped garden.',
   'Hitech City, Hyderabad, Telangana 500081',
   'active', 35, 1200000000,
   '2026-01-15', '2027-06-30',
   'Prasad Constructions', 'prasad@example.com',
   'construction'),
  ('4592883d-a022-4934-ace6-30aded7947b1',
   'Maple Heights',
   'Premium villa project — 8 independent villas with modern architecture, swimming pool, and smart home automation.',
   'Kokapet, Hyderabad, Telangana 500075',
   'active', 15, 800000000,
   '2026-03-01', '2027-09-30',
   'Maple Developers', 'maple@example.com',
   'construction'),
  ('556c9432-3edf-4c86-b10b-a97b7c8045da',
   'City Square Commercial',
   'Mixed-use commercial complex with retail outlets, food court, and 3 floors of office space.',
   'Gachibowli, Hyderabad, Telangana 500032',
   'active', 5, 2500000000,
   '2026-06-01', '2028-12-31',
   'Arova Group', 'arova@example.com',
   'construction');

-- Step 4: create a fresh pending + unpaid signup for UPI demo
insert into public.signup_requests (firm_name, contact_name, email, phone, plan, message, status, payment_status)
values (
  'Demo Builder — UPI Test',
  'Demo User',
  'demo.upi@sitetrack.in',
  '9876543210',
  'pro',
  'Testing UPI payment flow end-to-end.',
  'pending',
  'unpaid'
);
