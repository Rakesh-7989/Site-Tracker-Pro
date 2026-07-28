-- SiteTrack Pro — 22-role CRUD audit: RLS end-to-end verification.
--
-- Creates test fixtures, runs CRUD assertions for every identity role,
-- and outputs a pass/fail matrix for each (role, table, operation) triple.
--
-- Safe to run: wrapped in a transaction that ROLLBACKs at the end.
-- No test data persists.
--
-- Usage:  supabase db query --linked --file scripts/supabase/124_role_crud_audit.sql
-- Output: tabular matrix in the query result

BEGIN;

-- ============================================================================
-- 0. INFRASTRUCTURE
-- ============================================================================

DROP TABLE IF EXISTS crud_results;
CREATE TEMP TABLE crud_results (
  role        text,
  tbl         text,
  op          text,
  expected    text,
  actual      text,
  detail      text
);
GRANT SELECT ON TABLE crud_results TO authenticated;
-- Helper: SECURITY DEFINER wrapper to insert into temp table from any role.
CREATE OR REPLACE FUNCTION public.write_result(
  p_role text, p_tbl text, p_op text, p_expected text, p_actual text, p_detail text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO crud_results VALUES (p_role, p_tbl, p_op, p_expected, p_actual, p_detail);
END;
$$;

-- Helper: execute SQL and return ALLOW / DENY / ERROR.
CREATE OR REPLACE FUNCTION public.try_sql(p_sql text, OUT result text, OUT detail text)
RETURNS record LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  result := 'ALLOW'; detail := '';
EXCEPTION WHEN OTHERS THEN
  result := 'DENY'; detail := SQLERRM;
END;
$$;

-- Restoration helpers (run as DEFINER to bypass RLS after mutation tests).
CREATE OR REPLACE FUNCTION public.restore_milestone(p_id uuid, p_proj_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.milestones(id,project_id,title,due_date) VALUES(p_id,p_proj_id,'Test Milestone',now()+interval'30d') ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.reset_po_amount(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.purchase_orders SET amount=10000 WHERE id=p_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.reset_issue_status(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.issues SET status='open' WHERE id=p_id;
END;
$$;

-- Shorthand to record one assertion.
CREATE OR REPLACE FUNCTION public.record_crud(
  p_role text, p_tbl text, p_op text, p_expected text, p_sql text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_actual text; v_detail text;
BEGIN
  SELECT * INTO v_actual, v_detail FROM public.try_sql(p_sql);
  PERFORM public.write_result(p_role, p_tbl, p_op, p_expected, v_actual, v_detail);
END;
$$;

-- ============================================================================
-- 1. FIXTURES
-- ============================================================================

DO $$
DECLARE
  v_org_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_proj_id uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO public.organizations(id, slug, name)
    VALUES (v_org_id, 'crud-test-org', 'CRUD Test Org')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.projects (id, org_id, name)
    VALUES (v_proj_id, v_org_id, 'CRUD Test Project')
    ON CONFLICT DO NOTHING;

  -- Only 5 org_members allowed (plan limit). Project-level roles use project_members instead.
  DELETE FROM public.project_members WHERE profile_id >= '00000000-0000-0000-0000-000000000010' AND profile_id <= '00000000-0000-0000-0000-000000000031';
  DELETE FROM public.org_members WHERE profile_id >= '00000000-0000-0000-0000-000000000010' AND profile_id <= '00000000-0000-0000-0000-000000000031';

  -- 22 test users (UUIDs 10–31)
  -- Note: auth.users INSERT fires handle_new_signup trigger which creates
  --       a profile with role='client'. We must UPDATE profiles after
  --       to override the trigger-injected role.
  INSERT INTO auth.users(id,email) VALUES
    ('00000000-0000-0000-0000-000000000010','su@crud.test'),
    ('00000000-0000-0000-0000-000000000011','oa@crud.test'),
    ('00000000-0000-0000-0000-000000000012','promoter@crud.test'),
    ('00000000-0000-0000-0000-000000000013','pa@crud.test'),
    ('00000000-0000-0000-0000-000000000014','prospector@crud.test'),
    ('00000000-0000-0000-0000-000000000015','pm@crud.test'),
    ('00000000-0000-0000-0000-000000000016','arch@crud.test'),
    ('00000000-0000-0000-0000-000000000017','sa@crud.test'),
    ('00000000-0000-0000-0000-000000000018','ja@crud.test'),
    ('00000000-0000-0000-0000-000000000019','dai@crud.test'),
    ('00000000-0000-0000-0000-000000000020','dh@crud.test'),
    ('00000000-0000-0000-0000-000000000021','ch@crud.test'),
    ('00000000-0000-0000-0000-000000000022','mep@crud.test'),
    ('00000000-0000-0000-0000-000000000023','struc@crud.test'),
    ('00000000-0000-0000-0000-000000000024','cons@crud.test'),
    ('00000000-0000-0000-0000-000000000025','designer@crud.test'),
    ('00000000-0000-0000-0000-000000000026','se@crud.test'),
    ('00000000-0000-0000-0000-000000000027','con@crud.test'),
    ('00000000-0000-0000-0000-000000000028','subcon@crud.test'),
    ('00000000-0000-0000-0000-000000000029','vendor@crud.test'),
    ('00000000-0000-0000-0000-000000000030','client@crud.test'),
    ('00000000-0000-0000-0000-000000000031','si@crud.test')
  ON CONFLICT DO NOTHING;

  -- Override the handle_new_signup trigger which would have set role='client'
  UPDATE public.profiles SET role = v.role, name = v.name
  FROM (VALUES
    ('00000000-0000-0000-0000-000000000010'::uuid,'Super Admin','superadmin'),
    ('00000000-0000-0000-0000-000000000011','Org Admin','orgadmin'),
    ('00000000-0000-0000-0000-000000000012','Promoter','project_admin'),
    ('00000000-0000-0000-0000-000000000013','Proj Admin','project_admin'),
    ('00000000-0000-0000-0000-000000000014','Prospector','prospector'),
    ('00000000-0000-0000-0000-000000000015','PM','pm'),
    ('00000000-0000-0000-0000-000000000016','Architect','architect'),
    ('00000000-0000-0000-0000-000000000017','Sr Architect','architect'),
    ('00000000-0000-0000-0000-000000000018','Jr Architect','architect'),
    ('00000000-0000-0000-0000-000000000019','Interior','design_architect_interior'),
    ('00000000-0000-0000-0000-000000000020','Design Head','architect'),
    ('00000000-0000-0000-0000-000000000021','Consultant Head','architect'),
    ('00000000-0000-0000-0000-000000000022','MEP Consultant','mep_consultant'),
    ('00000000-0000-0000-0000-000000000023','Structural','architect'),
    ('00000000-0000-0000-0000-000000000024','Consultant','consultant'),
    ('00000000-0000-0000-0000-000000000025','Designer','designer'),
    ('00000000-0000-0000-0000-000000000026','Site Engineer','site_engineer'),
    ('00000000-0000-0000-0000-000000000027','Contractor','contractor'),
    ('00000000-0000-0000-0000-000000000028','Sub Contractor','sub_contractor'),
    ('00000000-0000-0000-0000-000000000029','Vendor','contractor'),
    ('00000000-0000-0000-0000-000000000030','Client','client'),
    ('00000000-0000-0000-0000-000000000031','Site Inspector','site_inspector')
  ) AS v(id, name, role)
  WHERE profiles.id = v.id;

  INSERT INTO public.org_members(org_id,profile_id,role) VALUES (v_org_id,'00000000-0000-0000-0000-000000000011','admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.org_members(org_id,profile_id,role) VALUES (v_org_id,'00000000-0000-0000-0000-000000000012','admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.org_members(org_id,profile_id,role) VALUES (v_org_id,'00000000-0000-0000-0000-000000000013','admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.org_members(org_id,profile_id,role) VALUES (v_org_id,'00000000-0000-0000-0000-000000000014','admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.org_members(org_id,profile_id,role) VALUES (v_org_id,'00000000-0000-0000-0000-000000000015','pm') ON CONFLICT DO NOTHING;

  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000016','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000017','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000018','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000019','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000020','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000021','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000022','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000023','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000024','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000025','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000026','architect') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000027','contractor') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000028','contractor') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000029','contractor') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000030','client') ON CONFLICT DO NOTHING;
  INSERT INTO public.project_members(project_id,profile_id,role) VALUES (v_proj_id,'00000000-0000-0000-0000-000000000031','architect') ON CONFLICT DO NOTHING;

  -- ── Seed data for write tests (using correct column names per schema) ──
  INSERT INTO public.milestones(id,project_id,title,due_date)
    VALUES ('00000000-0000-0000-0000-000000000040',v_proj_id,'Test Milestone',now()+interval'30d') ON CONFLICT DO NOTHING;
  INSERT INTO public.issues(id,project_id,title,status,severity)
    VALUES ('00000000-0000-0000-0000-000000000041',v_proj_id,'Test Issue','open','medium') ON CONFLICT DO NOTHING;
  INSERT INTO public.site_updates(id,project_id,notes)
    VALUES ('00000000-0000-0000-0000-000000000042',v_proj_id,'Test update') ON CONFLICT DO NOTHING;
  INSERT INTO public.drawings(id,project_id,title,type,storage_path)
    VALUES ('00000000-0000-0000-0000-000000000043',v_proj_id,'Test Drawing','arch','https://ex.com/dwg.pdf') ON CONFLICT DO NOTHING;
  INSERT INTO public.materials(id,project_id,material)
    VALUES ('00000000-0000-0000-0000-000000000044',v_proj_id,'Test Material') ON CONFLICT DO NOTHING;
  INSERT INTO public.purchase_orders(id,project_id,po_no,amount)
    VALUES ('00000000-0000-0000-0000-000000000045',v_proj_id,'PO-001',10000) ON CONFLICT DO NOTHING;
  INSERT INTO public.invoices(id,project_id,no,amount)
    VALUES ('00000000-0000-0000-0000-000000000046',v_proj_id,'INV-001',2500) ON CONFLICT DO NOTHING;
  INSERT INTO public.ra_bills(id,project_id,no,bill_amount)
    VALUES ('00000000-0000-0000-0000-000000000047',v_proj_id,'RA-001',5000) ON CONFLICT DO NOTHING;
  INSERT INTO public.expenses(id,project_id,category,description,amount)
    VALUES ('00000000-0000-0000-0000-000000000048',v_proj_id,'materials','Test expense',1000) ON CONFLICT DO NOTHING;
  INSERT INTO public.labour_register(id,project_id,name,trade)
    VALUES ('00000000-0000-0000-0000-000000000049',v_proj_id,'Test Labourer','mason') ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- 2. CRUD ASSERTIONS PER ROLE
-- ============================================================================

DO $$
DECLARE
  v_org_id     uuid := '00000000-0000-0000-0000-000000000001';
  v_proj_id    uuid := '00000000-0000-0000-0000-000000000002';
  v_ms_id      uuid := '00000000-0000-0000-0000-000000000040';
  v_issue_id   uuid := '00000000-0000-0000-0000-000000000041';
  v_update_id  uuid := '00000000-0000-0000-0000-000000000042';
  v_dwg_id     uuid := '00000000-0000-0000-0000-000000000043';
  v_mat_id     uuid := '00000000-0000-0000-0000-000000000044';
  v_po_id      uuid := '00000000-0000-0000-0000-000000000045';
  v_inv_id     uuid := '00000000-0000-0000-0000-000000000046';
  v_ra_id      uuid := '00000000-0000-0000-0000-000000000047';
  v_exp_id     uuid := '00000000-0000-0000-0000-000000000048';
  v_lab_id     uuid := '00000000-0000-0000-0000-000000000049';
BEGIN

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1  superadmin
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
  PERFORM record_crud('superadmin','projects','SELECT','ALLOW',
    'SELECT count(*) FROM public.projects');
  PERFORM record_crud('superadmin','org_members','SELECT','ALLOW',
    'SELECT count(*) FROM public.org_members');
  PERFORM record_crud('superadmin','audit_log_v2','SELECT','ALLOW',
    'SELECT count(*) FROM public.audit_log_v2');
  PERFORM record_crud('superadmin','milestones','INSERT','ALLOW',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''SA ms'',now()+interval''10d'')');
  PERFORM record_crud('superadmin','purchase_orders','INSERT','ALLOW',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''SA-PO'',500)');
  PERFORM record_crud('superadmin','milestones','DELETE','ALLOW',
    'DELETE FROM public.milestones WHERE id='''||v_ms_id||'''');
  PERFORM public.restore_milestone(v_ms_id, v_proj_id);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2  orgadmin
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
  PERFORM record_crud('orgadmin','projects','SELECT','ALLOW',
    'SELECT count(*) FROM public.projects WHERE org_id='''||v_org_id||'''');
  PERFORM record_crud('orgadmin','org_members','SELECT','ALLOW',
    'SELECT count(*) FROM public.org_members WHERE org_id='''||v_org_id||'''');
  -- Free a slot below the plan limit (5) so the INSERT test does not hit check_user_limit
  DELETE FROM public.org_members WHERE profile_id = '00000000-0000-0000-0000-000000000015';
  PERFORM record_crud('orgadmin','org_members','INSERT','ALLOW',
    'INSERT INTO public.org_members(org_id,profile_id,role) VALUES('''||v_org_id||''',''00000000-0000-0000-0000-000000000010'',''pm'')');
  DELETE FROM public.org_members WHERE profile_id = '00000000-0000-0000-0000-000000000010';
  INSERT INTO public.org_members(org_id,profile_id,role) VALUES (v_org_id,'00000000-0000-0000-0000-000000000015','pm');
  PERFORM record_crud('orgadmin','milestones','INSERT','ALLOW',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''OA ms'',now()+interval''10d'')');
  PERFORM record_crud('orgadmin','purchase_orders','INSERT','ALLOW',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''OA-PO'',500)');
  PERFORM record_crud('orgadmin','purchase_orders','UPDATE','ALLOW',
    'UPDATE public.purchase_orders SET amount=600 WHERE id='''||v_po_id||'''');
  PERFORM record_crud('orgadmin','milestones','DELETE','ALLOW',
    'DELETE FROM public.milestones WHERE id='''||v_ms_id||'''');
  PERFORM public.restore_milestone(v_ms_id, v_proj_id);
  PERFORM public.reset_po_amount(v_po_id);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3  promoter
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
  PERFORM record_crud('promoter','projects','SELECT','ALLOW',
    'SELECT count(*) FROM public.projects WHERE org_id='''||v_org_id||'''');
  PERFORM record_crud('promoter','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''PR ms'',now()+interval''10d'')');
  PERFORM record_crud('promoter','purchase_orders','INSERT','DENY',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''PR-PO'',500)');
  PERFORM record_crud('promoter','ra_bills','SELECT','ALLOW',
    'SELECT count(*) FROM public.ra_bills WHERE project_id='''||v_proj_id||'''');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4  project_admin
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000013',true);
  PERFORM record_crud('project_admin','invoices','INSERT','ALLOW',
    'INSERT INTO public.invoices(project_id,no,amount) VALUES('''||v_proj_id||''',''PA-INV'',3000)');
  PERFORM record_crud('project_admin','invoices','UPDATE','ALLOW',
    'UPDATE public.invoices SET amount=3500 WHERE id='''||v_inv_id||'''');
  PERFORM record_crud('project_admin','purchase_orders','UPDATE','ALLOW',
    'UPDATE public.purchase_orders SET amount=7000 WHERE id='''||v_po_id||'''');
  PERFORM record_crud('project_admin','ra_bills','INSERT','ALLOW',
    'INSERT INTO public.ra_bills(project_id,no,bill_amount) VALUES('''||v_proj_id||''',''PA-RA'',6000)');
  PERFORM record_crud('project_admin','expenses','INSERT','DENY',
    'INSERT INTO public.expenses(project_id,category,description,amount) VALUES('''||v_proj_id||''',''travel'',''PA exp'',100)');
  PERFORM record_crud('project_admin','labour_register','INSERT','DENY',
    'INSERT INTO public.labour_register(project_id,name,trade) VALUES('''||v_proj_id||''',''PA lab'',''helper'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5  prospector
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000014',true);
  PERFORM record_crud('prospector','projects','SELECT','ALLOW',
    'SELECT count(*) FROM public.projects WHERE org_id='''||v_org_id||'''');
  PERFORM record_crud('prospector','projects','INSERT','ALLOW',
    'INSERT INTO public.projects(org_id,name) VALUES('''||v_org_id||''',''Prospector project'')');
  PERFORM record_crud('prospector','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''PR ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6  pm
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000015',true);
  PERFORM record_crud('pm','milestones','INSERT','ALLOW',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''PM ms'',now()+interval''10d'')');
  PERFORM record_crud('pm','milestones','UPDATE','ALLOW',
    'UPDATE public.milestones SET title=''PM upd'' WHERE id='''||v_ms_id||'''');
  PERFORM record_crud('pm','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''PM update'')');
  PERFORM record_crud('pm','issues','INSERT','ALLOW',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''PM issue'',''open'',''high'')');
  PERFORM record_crud('pm','purchase_orders','INSERT','ALLOW',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''PM-PO'',500)');
  PERFORM record_crud('pm','purchase_orders','UPDATE','DENY',
    'UPDATE public.purchase_orders SET amount=9999 WHERE id='''||v_po_id||'''');
  PERFORM record_crud('pm','expenses','INSERT','ALLOW',
    'INSERT INTO public.expenses(project_id,category,description,amount) VALUES('''||v_proj_id||''',''travel'',''PM exp'',200)');
  PERFORM record_crud('pm','milestones','DELETE','ALLOW',
    'DELETE FROM public.milestones WHERE id='''||v_ms_id||'''');
  PERFORM public.restore_milestone(v_ms_id, v_proj_id);
  PERFORM public.reset_po_amount(v_po_id);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7  architect
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000016',true);
  PERFORM record_crud('architect','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''Arch dwg'',''arch'',''https://ex.com/a.pdf'')');
  PERFORM record_crud('architect','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''Arch upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('architect','drawings','DELETE','DENY',
    'DELETE FROM public.drawings WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('architect','issues','INSERT','ALLOW',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''Arch issue'',''open'',''low'')');
  PERFORM record_crud('architect','issues','UPDATE','DENY',
    'UPDATE public.issues SET status=''resolved'' WHERE id='''||v_issue_id||'''');
  PERFORM record_crud('architect','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''Arch ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8  senior_architect
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000017',true);
  PERFORM record_crud('senior_architect','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''SA dwg'',''arch'',''https://ex.com/sa.pdf'')');
  PERFORM record_crud('senior_architect','drawings','DELETE','DENY',
    'DELETE FROM public.drawings WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('senior_architect','issues','UPDATE','ALLOW',
    'UPDATE public.issues SET status=''resolved'' WHERE id='''||v_issue_id||'''');
  PERFORM record_crud('senior_architect','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''SA ms'',now()+interval''10d'')');
  PERFORM public.reset_issue_status(v_issue_id);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 9  junior_architect
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000018',true);
  PERFORM record_crud('junior_architect','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''JA dwg'',''arch'',''https://ex.com/ja.pdf'')');
  PERFORM record_crud('junior_architect','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''JA upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('junior_architect','drawings','DELETE','DENY',
    'DELETE FROM public.drawings WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('junior_architect','issues','INSERT','ALLOW',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''JA issue'',''open'',''low'')');
  PERFORM record_crud('junior_architect','issues','UPDATE','DENY',
    'UPDATE public.issues SET status=''resolved'' WHERE id='''||v_issue_id||'''');
  PERFORM record_crud('junior_architect','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''JA ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 10  design_architect_interior
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000019',true);
  PERFORM record_crud('design_architect_interior','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''DAI dwg'',''arch'',''https://ex.com/dai.pdf'')');
  PERFORM record_crud('design_architect_interior','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''DAI upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('design_architect_interior','drawings','DELETE','DENY',
    'DELETE FROM public.drawings WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('design_architect_interior','materials','INSERT','ALLOW',
    'INSERT INTO public.materials(project_id,material) VALUES('''||v_proj_id||''',''DAI mat'')');
  PERFORM record_crud('design_architect_interior','materials','UPDATE','ALLOW',
    'UPDATE public.materials SET material=''DAI upd'' WHERE id='''||v_mat_id||'''');
  PERFORM record_crud('design_architect_interior','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''DAI ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 11  design_head
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000020',true);
  PERFORM record_crud('design_head','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''DH dwg'',''arch'',''https://ex.com/dh.pdf'')');
  PERFORM record_crud('design_head','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''DH upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('design_head','issues','UPDATE','DENY',
    'UPDATE public.issues SET status=''resolved'' WHERE id='''||v_issue_id||'''');
  PERFORM record_crud('design_head','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''DH update'')');
  PERFORM record_crud('design_head','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''DH ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 12  consultant_head
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000021',true);
  PERFORM record_crud('consultant_head','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''CH upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('consultant_head','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''CH dwg'',''arch'',''https://ex.com/ch.pdf'')');
  PERFORM record_crud('consultant_head','issues','UPDATE','DENY',
    'UPDATE public.issues SET status=''resolved'' WHERE id='''||v_issue_id||'''');
  PERFORM record_crud('consultant_head','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''CH update'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 13  mep_consultant
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000022',true);
  PERFORM record_crud('mep_consultant','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''MEP dwg'',''arch'',''https://ex.com/mep.pdf'')');
  PERFORM record_crud('mep_consultant','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''MEP upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('mep_consultant','drawings','DELETE','DENY',
    'DELETE FROM public.drawings WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('mep_consultant','issues','INSERT','DENY',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''MEP issue'',''open'',''low'')');
  PERFORM record_crud('mep_consultant','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''MEP ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 14  structural_consultant
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000023',true);
  PERFORM record_crud('structural_consultant','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''SC dwg'',''arch'',''https://ex.com/sc.pdf'')');
  PERFORM record_crud('structural_consultant','drawings','UPDATE','ALLOW',
    'UPDATE public.drawings SET title=''SC upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('structural_consultant','issues','INSERT','DENY',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''SC issue'',''open'',''low'')');
  PERFORM record_crud('structural_consultant','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''SC ms'',now()+interval''10d'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 15  consultant
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000024',true);
  PERFORM record_crud('consultant','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''C dwg'',''arch'',''https://ex.com/c.pdf'')');
  PERFORM record_crud('consultant','drawings','UPDATE','DENY',
    'UPDATE public.drawings SET title=''C upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('consultant','issues','INSERT','DENY',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''C issue'',''open'',''low'')');
  PERFORM record_crud('consultant','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''C update'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 16  designer
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000025',true);
  PERFORM record_crud('designer','drawings','INSERT','ALLOW',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''D dwg'',''arch'',''https://ex.com/d.pdf'')');
  PERFORM record_crud('designer','drawings','UPDATE','DENY',
    'UPDATE public.drawings SET title=''D upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('designer','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''D ms'',now()+interval''10d'')');
  PERFORM record_crud('designer','issues','INSERT','DENY',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''D issue'',''open'',''low'')');
  PERFORM record_crud('designer','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''D update'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 17  site_engineer
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000026',true);
  PERFORM record_crud('site_engineer','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''SE update'')');
  PERFORM record_crud('site_engineer','site_updates','UPDATE','ALLOW',
    'UPDATE public.site_updates SET notes=''SE upd'' WHERE id='''||v_update_id||'''');
  PERFORM record_crud('site_engineer','issues','INSERT','ALLOW',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''SE issue'',''open'',''high'')');
  PERFORM record_crud('site_engineer','issues','UPDATE','ALLOW',
    'UPDATE public.issues SET status=''resolved'' WHERE id='''||v_issue_id||'''');
  PERFORM record_crud('site_engineer','materials','INSERT','ALLOW',
    'INSERT INTO public.materials(project_id,material) VALUES('''||v_proj_id||''',''SE mat'')');
  PERFORM record_crud('site_engineer','materials','UPDATE','ALLOW',
    'UPDATE public.materials SET material=''SE upd'' WHERE id='''||v_mat_id||'''');
  PERFORM record_crud('site_engineer','labour_register','INSERT','ALLOW',
    'INSERT INTO public.labour_register(project_id,name,trade) VALUES('''||v_proj_id||''',''SE lab'',''helper'')');
  PERFORM record_crud('site_engineer','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''SE dwg'',''arch'',''https://ex.com/se.pdf'')');
  PERFORM record_crud('site_engineer','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''SE ms'',now()+interval''10d'')');
  PERFORM record_crud('site_engineer','purchase_orders','INSERT','DENY',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''SE-PO'',500)');
  PERFORM public.reset_issue_status(v_issue_id);

  -- ══════════════════════════════════════════════════════════════════════════
  -- 18  contractor
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000027',true);
  PERFORM record_crud('contractor','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''CON update'')');
  PERFORM record_crud('contractor','ra_bills','INSERT','ALLOW',
    'INSERT INTO public.ra_bills(project_id,no,bill_amount) VALUES('''||v_proj_id||''',''CON-RA'',7000)');
  PERFORM record_crud('contractor','materials','INSERT','ALLOW',
    'INSERT INTO public.materials(project_id,material) VALUES('''||v_proj_id||''',''CON mat'')');
  PERFORM record_crud('contractor','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''CON ms'',now()+interval''10d'')');
  PERFORM record_crud('contractor','purchase_orders','INSERT','DENY',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''CON-PO'',500)');
  PERFORM record_crud('contractor','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''CON dwg'',''arch'',''https://ex.com/con.pdf'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 19  sub_contractor
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000028',true);
  PERFORM record_crud('sub_contractor','site_updates','INSERT','ALLOW',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''SUB update'')');
  PERFORM record_crud('sub_contractor','ra_bills','INSERT','DENY',
    'INSERT INTO public.ra_bills(project_id,no,bill_amount) VALUES('''||v_proj_id||''',''SUB-RA'',7000)');
  PERFORM record_crud('sub_contractor','materials','INSERT','DENY',
    'INSERT INTO public.materials(project_id,material) VALUES('''||v_proj_id||''',''SUB mat'')');
  PERFORM record_crud('sub_contractor','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''SUB ms'',now()+interval''10d'')');
  PERFORM record_crud('sub_contractor','purchase_orders','INSERT','DENY',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''SUB-PO'',500)');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 20  vendor
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000029',true);
  -- vendor has org_members.role='vendor' but NO project_members row.
  -- Vendor portal is org-level (PO quotes + invoices), not project-level.
  PERFORM record_crud('vendor','projects','SELECT','DENY',
    'SELECT count(*) FROM public.projects WHERE org_id='''||v_org_id||'''');
  PERFORM record_crud('vendor','purchase_orders','INSERT','ALLOW',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''VEN-PO'',500)');
  PERFORM record_crud('vendor','invoices','INSERT','ALLOW',
    'INSERT INTO public.invoices(project_id,no,amount) VALUES('''||v_proj_id||''',''VEN-INV'',3000)');
  PERFORM record_crud('vendor','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''VEN ms'',now()+interval''10d'')');
  PERFORM record_crud('vendor','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''VEN dwg'',''arch'',''https://ex.com/v.pdf'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 21  client
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000030',true);
  PERFORM record_crud('client','projects','SELECT','ALLOW',
    'SELECT count(*) FROM public.projects WHERE org_id='''||v_org_id||'''');
  PERFORM record_crud('client','site_updates','SELECT','ALLOW',
    'SELECT count(*) FROM public.site_updates WHERE project_id='''||v_proj_id||'''');
  PERFORM record_crud('client','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''CL ms'',now()+interval''10d'')');
  PERFORM record_crud('client','site_updates','INSERT','DENY',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''CL update'')');
  PERFORM record_crud('client','ra_bills','INSERT','DENY',
    'INSERT INTO public.ra_bills(project_id,no,bill_amount) VALUES('''||v_proj_id||''',''CL-RA'',7000)');
  PERFORM record_crud('client','purchase_orders','INSERT','DENY',
    'INSERT INTO public.purchase_orders(project_id,po_no,amount) VALUES('''||v_proj_id||''',''CL-PO'',500)');
  PERFORM record_crud('client','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''CL dwg'',''arch'',''https://ex.com/cl.pdf'')');

  -- ══════════════════════════════════════════════════════════════════════════
  -- 22  site_inspector
  -- ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000031',true);
  PERFORM record_crud('site_inspector','projects','SELECT','ALLOW',
    'SELECT count(*) FROM public.projects WHERE org_id='''||v_org_id||'''');
  PERFORM record_crud('site_inspector','drawings','INSERT','DENY',
    'INSERT INTO public.drawings(project_id,title,type,storage_path) VALUES('''||v_proj_id||''',''SI dwg'',''arch'',''https://ex.com/si.pdf'')');
  PERFORM record_crud('site_inspector','drawings','UPDATE','DENY',
    'UPDATE public.drawings SET title=''SI upd'' WHERE id='''||v_dwg_id||'''');
  PERFORM record_crud('site_inspector','site_updates','INSERT','DENY',
    'INSERT INTO public.site_updates(project_id,notes) VALUES('''||v_proj_id||''',''SI update'')');
  PERFORM record_crud('site_inspector','milestones','INSERT','DENY',
    'INSERT INTO public.milestones(project_id,title,due_date) VALUES('''||v_proj_id||''',''SI ms'',now()+interval''10d'')');
  PERFORM record_crud('site_inspector','issues','INSERT','DENY',
    'INSERT INTO public.issues(project_id,title,status,severity) VALUES('''||v_proj_id||''',''SI issue'',''open'',''low'')');
  PERFORM record_crud('site_inspector','compliance','SELECT','ALLOW',
    'SELECT count(*) FROM public.compliance WHERE project_id='''||v_proj_id||'''');

END $$;

-- ============================================================================
-- 3. OUTPUT RESULTS
-- ============================================================================

SELECT line FROM (
  SELECT 1 AS ord, '--- PER-ROLE SUMMARY ---' AS line
  UNION ALL
  SELECT 2, role || ': ' || count(*) FILTER (WHERE actual = expected)::text || '/' || count(*)::text || ' passed'
  FROM crud_results GROUP BY role
  UNION ALL
  SELECT 3, '--- TOTAL: ' || count(*) FILTER (WHERE actual = expected)::text || '/' || count(*)::text || ' passed, ' || count(*) FILTER (WHERE actual <> expected)::text || ' failed ---'
  FROM crud_results
  UNION ALL
  SELECT 4, '--- FAILURES ---'
  UNION ALL
  SELECT 5, role || ' ' || tbl || ' ' || op || ' e=' || expected || ' a=' || actual
  FROM crud_results WHERE actual <> expected
) sub ORDER BY ord, line;

-- ============================================================================
ROLLBACK;
