-- SiteTrack Pro — project-ceiling backstop (plan-gating step 7, 2026-06-06).
--
-- Migration 96 set projects_max=null (="unlimited") for Pro/Business but added a
-- safety projects_ceiling (Pro 50, Business 200). The existing check_project_limit
-- trigger (mig 35) returns early when projects_max is null, so "unlimited" plans
-- had NO ceiling — one runaway org could create 10,000 projects and wreck shared
-- query perf. This makes the trigger fall back to projects_ceiling.
--
-- Effective cap = coalesce(projects_max, projects_ceiling). Both null = truly
-- unlimited (Enterprise/Custom). IDEMPOTENT.
--
-- NOTE: storage_gb enforcement is NOT added — the attachments table has no
-- file-size column, so we can't sum bytes per org yet. Tracked as a follow-up
-- (needs the upload pipeline to record size_bytes first).

BEGIN;

CREATE OR REPLACE FUNCTION public.check_project_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cap int; cnt int;
BEGIN
  -- Hard max = explicit projects_max, else the safety ceiling.
  cap := COALESCE(public.plan_cap(new.org_id, 'projects_max'),
                  public.plan_cap(new.org_id, 'projects_ceiling'));
  IF cap IS NULL THEN RETURN new; END IF;          -- truly unlimited
  SELECT count(*) INTO cnt FROM public.projects
    WHERE org_id = new.org_id AND archived_at IS NULL;
  IF cnt >= cap THEN
    RAISE EXCEPTION 'plan-limit-exceeded: % project(s) of %', cnt, cap
      USING errcode = 'P0001',
            hint = 'Upgrade your plan in Org Admin → Billing to add more projects.';
  END IF;
  RETURN new;
END;
$$;

-- Mirror the same effective cap in the UI snapshot RPC so the "+ New project"
-- button greys out at the real ceiling.
CREATE OR REPLACE FUNCTION public.org_quota_snapshot(p_org_id uuid)
RETURNS table(resource text, current_count bigint, max_allowed int, at_quota boolean)
LANGUAGE plpgsql STABLE AS $$
DECLARE cap int;
BEGIN
  cap := COALESCE(public.plan_cap(p_org_id, 'projects_max'),
                  public.plan_cap(p_org_id, 'projects_ceiling'));
  resource := 'projects';
  SELECT count(*) INTO current_count FROM public.projects
    WHERE org_id = p_org_id AND archived_at IS NULL;
  max_allowed := cap;
  at_quota := cap IS NOT NULL AND current_count >= cap;
  RETURN next;

  cap := public.plan_cap(p_org_id, 'users_max');
  resource := 'users';
  SELECT count(*) INTO current_count FROM public.org_members WHERE org_id = p_org_id;
  max_allowed := cap;
  at_quota := cap IS NOT NULL AND current_count >= cap;
  RETURN next;
END;
$$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, COALESCE((feature_caps->>'projects_max'),(feature_caps->>'projects_ceiling'),'unlimited') AS cap
           FROM public.plans WHERE id IN ('basic','pro','business','enterprise') ORDER BY display_order LOOP
    RAISE NOTICE '97_project_ceiling: % → effective project cap = %', r.id, r.cap;
  END LOOP;
END $$;

COMMIT;
