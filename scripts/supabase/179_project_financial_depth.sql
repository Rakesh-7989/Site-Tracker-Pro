-- SiteTrack Pro — v6 Phase 6: Project Financial Depth.
-- Earned value management, project P&L, WIP aging, cost-to-complete forecasting, budget reallocation.

BEGIN;

-- 1. Add financial tracking columns to projects
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS contract_value bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_cost bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS committed_cost bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS earned_value bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS wip_value bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS cost_to_complete bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS forecast_final_cost bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS budget_version int DEFAULT 1;

-- 2. Budget reallocation / change log
CREATE TABLE IF NOT EXISTS public.budget_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('increase', 'decrease', 'reallocate', 'contingency_use')),
  category text NOT NULL, -- 'labor', 'material', 'equipment', 'subcontractor', 'overhead', 'contingency'
  amount bigint NOT NULL CHECK (amount > 0),
  from_category text, -- for reallocate type
  reason text NOT NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_changes_project ON public.budget_changes(project_id, created_at DESC);

ALTER TABLE public.budget_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_changes_read ON public.budget_changes;
CREATE POLICY budget_changes_read ON public.budget_changes FOR SELECT
  USING (public.can_read_project(project_id));

DROP POLICY IF EXISTS budget_changes_write ON public.budget_changes;
CREATE POLICY budget_changes_write ON public.budget_changes FOR INSERT
  WITH CHECK (public.can_write_project(project_id));

DROP POLICY IF EXISTS budget_changes_update ON public.budget_changes;
CREATE POLICY budget_changes_update ON public.budget_changes FOR UPDATE
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

GRANT SELECT, INSERT, UPDATE ON public.budget_changes TO authenticated;
REVOKE ALL ON public.budget_changes FROM anon;

-- 3. WIP (Work in Progress) aging entries
CREATE TABLE IF NOT EXISTS public.wip_aging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'labor', 'material', 'equipment', 'subcontractor'
  description text,
  amount bigint NOT NULL CHECK (amount > 0),
  aging_days int NOT NULL DEFAULT 0, -- days since cost incurred but not billed
  incurred_date date NOT NULL DEFAULT current_date,
  billed_amount bigint DEFAULT 0 CHECK (billed_amount >= 0),
  status text DEFAULT 'open' CHECK (status IN ('open', 'partially_billed', 'billed', 'write_off')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wip_aging_project ON public.wip_aging(project_id, aging_days DESC);

ALTER TABLE public.wip_aging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wip_aging_read ON public.wip_aging;
CREATE POLICY wip_aging_read ON public.wip_aging FOR SELECT
  USING (public.can_read_project(project_id));

DROP POLICY IF EXISTS wip_aging_write ON public.wip_aging;
CREATE POLICY wip_aging_write ON public.wip_aging FOR INSERT
  WITH CHECK (public.can_write_project(project_id));

DROP POLICY IF EXISTS wip_aging_update ON public.wip_aging;
CREATE POLICY wip_aging_update ON public.wip_aging FOR UPDATE
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

GRANT SELECT, INSERT, UPDATE ON public.wip_aging TO authenticated;
REVOKE ALL ON public.wip_aging FROM anon;

-- 4. Cost-to-complete forecasting
CREATE TABLE IF NOT EXISTS public.cost_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'labor', 'material', 'equipment', 'subcontractor', 'overhead'
  original_budget bigint DEFAULT 0,
  revised_budget bigint DEFAULT 0,
  actual_to_date bigint DEFAULT 0,
  committed bigint DEFAULT 0,
  estimated_to_complete bigint DEFAULT 0,
  forecast_final bigint DEFAULT 0, -- actual + committed + estimated_to_complete
  variance bigint GENERATED ALWAYS AS (forecast_final - revised_budget) STORED,
  variance_pct numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN revised_budget > 0 THEN ROUND(((forecast_final - revised_budget)::numeric / revised_budget) * 100, 2) ELSE 0 END
  ) STORED,
  notes text,
  forecast_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  forecast_at timestamptz NOT NULL DEFAULT now(),
  version int DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_cost_forecasts_project ON public.cost_forecasts(project_id, forecast_at DESC);

ALTER TABLE public.cost_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_forecasts_read ON public.cost_forecasts;
CREATE POLICY cost_forecasts_read ON public.cost_forecasts FOR SELECT
  USING (public.can_read_project(project_id));

DROP POLICY IF EXISTS cost_forecasts_write ON public.cost_forecasts;
CREATE POLICY cost_forecasts_write ON public.cost_forecasts FOR INSERT
  WITH CHECK (public.can_write_project(project_id));

DROP POLICY IF EXISTS cost_forecasts_update ON public.cost_forecasts;
CREATE POLICY cost_forecasts_update ON public.cost_forecasts FOR UPDATE
  USING (public.can_write_project(project_id))
  WITH CHECK (public.can_write_project(project_id));

GRANT SELECT, INSERT, UPDATE ON public.cost_forecasts TO authenticated;
REVOKE ALL ON public.cost_forecasts FROM anon;

-- 5. Earned Value calculation RPC
CREATE OR REPLACE FUNCTION public.calculate_earned_value(p_project_id uuid)
RETURNS TABLE (
  project_id uuid,
  contract_value bigint,
  planned_value bigint,
  earned_value bigint,
  actual_cost bigint,
  cost_variance bigint,
  schedule_variance bigint,
  cpi numeric(5,2),
  spi numeric(5,2),
  eac bigint,
  etc bigint,
  vac bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project RECORD;
  v_pv bigint := 0;
  v_ev bigint := 0;
  v_ac bigint := 0;
  v_cpi numeric := 0;
  v_spi numeric := 0;
  v_eac bigint := 0;
  v_etc bigint := 0;
  v_vac bigint := 0;
BEGIN
  -- Fetch project data
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;

  -- Planned Value (PV) = sum of milestone budgets up to today
  -- For now, use a simplified approach: PV = (contract_value * progress_planned / 100)
  -- where progress_planned = expected progress based on timeline
  SELECT COALESCE(SUM(cf.revised_budget), 0) INTO v_pv
  FROM public.cost_forecasts cf
  WHERE cf.project_id = p_project_id;

  -- Earned Value (EV) = % complete * contract_value
  v_ev := ROUND(v_project.contract_value * GREATEST(0, LEAST(100, v_project.progress)) / 100);

  -- Actual Cost (AC) = sum of expenses + PO committed + RA paid + labor costs
  SELECT COALESCE(SUM(e.amount), 0) INTO v_ac
  FROM public.expenses e
  WHERE e.project_id = p_project_id
    AND e.status NOT IN ('rejected', 'cancelled');

  SELECT COALESCE(SUM(po.amount), 0) INTO v_ac
  FROM public.purchase_orders po
  WHERE po.project_id = p_project_id
    AND po.status NOT IN ('cancelled', 'rejected');

  SELECT COALESCE(SUM(r.paid_amount), 0) INTO v_ac
  FROM public.ra_bills r
  WHERE r.project_id = p_project_id
    AND r.status IN ('approved', 'paid');

  -- Cost Variance (CV) = EV - AC
  -- Schedule Variance (SV) = EV - PV
  -- CPI = EV / AC (cost performance index)
  -- SPI = EV / PV (schedule performance index)
  -- EAC = Contract Value / CPI (Estimate at Completion)
  -- ETC = EAC - AC (Estimate to Complete)
  -- VAC = Contract Value - EAC (Variance at Completion)

  v_cpi := CASE WHEN v_ac > 0 THEN ROUND(v_ev::numeric / v_ac, 2) ELSE 0 END;
  v_spi := CASE WHEN v_pv > 0 THEN ROUND(v_ev::numeric / v_pv, 2) ELSE 0 END;
  v_eac := CASE WHEN v_cpi > 0 THEN ROUND(v_project.contract_value::numeric / v_cpi) ELSE v_project.contract_value END;
  v_etc := GREATEST(0, v_eac - v_ac);
  v_vac := v_project.contract_value - v_eac;

  -- Update project with calculated values
  UPDATE public.projects
  SET earned_value = v_ev,
      actual_cost = v_ac,
      cost_to_complete = v_etc,
      forecast_final_cost = v_eac
  WHERE id = p_project_id;

  RETURN QUERY SELECT
    p_project_id,
    v_project.contract_value,
    v_pv,
    v_ev,
    v_ac,
    v_ev - v_ac,                          -- cost_variance
    v_ev - v_pv,                          -- schedule_variance
    v_cpi,
    v_spi,
    v_eac,
    v_etc,
    v_vac;
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_earned_value(uuid) TO authenticated;

-- 6. Update project financials from actuals (run periodically)
CREATE OR REPLACE FUNCTION public.recompute_project_financials(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ac bigint := 0;
  v_committed bigint := 0;
  v_ev bigint := 0;
  v_cpi numeric := 0;
  v_eac bigint := 0;
  v_etc bigint := 0;
  v_wip bigint := 0;
BEGIN
  -- Actual cost: expenses + PO committed + RA paid
  SELECT COALESCE(SUM(amount), 0) INTO v_ac
  FROM public.expenses
  WHERE project_id = p_project_id AND status NOT IN ('rejected', 'cancelled');

  SELECT COALESCE(SUM(amount), 0) INTO v_committed
  FROM public.purchase_orders
  WHERE project_id = p_project_id AND status NOT IN ('cancelled', 'rejected');

  SELECT COALESCE(SUM(paid_amount), 0) INTO v_committed
  FROM public.ra_bills
  WHERE project_id = p_project_id AND status IN ('approved', 'paid');

  v_ac := v_ac + v_committed;

  -- Earned value from progress %
  SELECT contract_value, progress INTO v_ev, v_cpi
  FROM public.projects WHERE id = p_project_id;

  v_ev := ROUND(v_ev * GREATEST(0, LEAST(100, v_cpi)) / 100);
  v_cpi := CASE WHEN v_ac > 0 THEN ROUND(v_ev::numeric / v_ac, 2) ELSE 0 END;

  -- WIP: costs incurred but not yet billed
  SELECT COALESCE(SUM(amount - billed_amount), 0) INTO v_wip
  FROM public.wip_aging
  WHERE project_id = p_project_id AND status IN ('open', 'partially_billed');

  -- EAC and ETC
  v_eac := CASE WHEN v_cpi > 0 THEN ROUND((SELECT contract_value FROM public.projects WHERE id = p_project_id)::numeric / v_cpi) ELSE (SELECT contract_value FROM public.projects WHERE id = p_project_id) END;
  v_etc := GREATEST(0, v_eac - v_ac);

  -- Update project
  UPDATE public.projects
  SET actual_cost = v_ac,
      committed_cost = v_committed,
      earned_value = v_ev,
      wip_value = v_wip,
      cost_to_complete = v_etc,
      forecast_final_cost = v_eac
  WHERE id = p_project_id;

  -- Log audit
  PERFORM public.record_audit_v2(
    'UPDATE', 'projects', p_project_id::text,
    p_project_id,
    to_jsonb(jsonb_build_object('actual_cost', v_ac, 'earned_value', v_ev)),
    to_jsonb(jsonb_build_object('actual_cost', v_ac, 'earned_value', v_ev, 'cpi', v_cpi, 'eac', v_eac, 'etc', v_etc, 'wip', v_wip)),
    'Project financials recomputed'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_project_financials(uuid) TO authenticated;

-- 7. Auto-update aging days for WIP (daily cron)
CREATE OR REPLACE FUNCTION public.update_wip_aging()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wip_aging
  SET aging_days = (current_date - incurred_date);
END $$;

GRANT EXECUTE ON FUNCTION public.update_wip_aging() TO authenticated;

-- 8. Cron jobs
SELECT cron.unschedule('update-wip-aging') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-wip-aging');
SELECT cron.schedule(
  'update-wip-aging',
  '0 1 * * *',  -- 01:00 UTC daily
  $$SELECT public.update_wip_aging()$$
);

SELECT cron.unschedule('recompute-project-financials') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-project-financials');
SELECT cron.schedule(
  'recompute-project-financials',
  '0 3 * * *',  -- 03:00 UTC daily
  $$SELECT public.recompute_project_financials(p.id) FROM public.projects p WHERE p.status = 'active'$$
);

COMMIT;