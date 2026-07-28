-- SiteTrack Pro — DAU/WAU/MAU counter materialized view + cron + helper RPCs.
--
-- Tracks distinct active users per org per day. Designed with a hybrid
-- query pattern so counters are always live (MV caches history, raw
-- activity_log covers today without waiting for cron).
--
-- Order:
--   1. Performance index on activity_log (by_profile_id, created_at)
--   2. Materialized view org_dau_rollup
--   3. Unique index (required for CONCURRENTLY refresh)
--   4. admin_refresh_dau_rollup() RPC (for manual + cron/EF invocation)
--   5. get_org_dau_wau_mau(p_org_id) — per-org live counters
--   6. get_platform_dau_wau_mau() — superadmin-only platform totals
--   7. pg_cron schedule (idempotent — no-op if job name exists)
--   8. Initial MV load
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. Performance index ────────────────────────────────────────────────
-- Speeds up the MV build query (JOIN activity_log → profiles → GROUP BY)
-- AND today's live DAU query (range scan on created_at >= CURRENT_DATE).
CREATE INDEX IF NOT EXISTS idx_activity_log_profile_time
  ON public.activity_log(by_profile_id, created_at);

-- ── 2. Materialized View ────────────────────────────────────────────────
-- One row per (org_id, activity_date, profile_id) where the user performed
-- at least one action. ~160 bytes/row × ~100 rows/org/day = tiny footprint.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.org_dau_rollup AS
SELECT
  om.org_id,
  a.created_at::date AS activity_date,
  a.by_profile_id
FROM public.activity_log a
JOIN public.org_members om ON om.profile_id = a.by_profile_id
GROUP BY om.org_id, a.created_at::date, a.by_profile_id
WITH NO DATA;

-- ── 3. Unique Index ─────────────────────────────────────────────────────
-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY. Also speeds up
-- the WAU/MAU queries (covering index for org_id + activity_date scans).
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_dau_rollup_pk
  ON public.org_dau_rollup (org_id, activity_date, by_profile_id);

-- ── 4. Admin refresh RPC ────────────────────────────────────────────────
-- Called by the Edge Function (refresh_dau_rollup) or manually.
-- Returns row count + elapsed time for observability.
CREATE OR REPLACE FUNCTION public.admin_refresh_dau_rollup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_rows  int;
BEGIN
  v_start := clock_timestamp();
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.org_dau_rollup;
  SELECT count(*) INTO v_rows FROM public.org_dau_rollup;
  RETURN jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'elapsed_ms', extract(epoch from clock_timestamp() - v_start) * 1000
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_refresh_dau_rollup() TO authenticated;

-- ── 5. Per-org DAU/WAU/MAU counters ─────────────────────────────────────
-- DAU: today only — always from raw activity_log (live, small range scan).
-- WAU: MV for [D-6, D-1] UNION today from raw — always fresh.
-- MAU: MV for [D-29, D-1] UNION today from raw — always fresh.
CREATE OR REPLACE FUNCTION public.get_org_dau_wau_mau(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dau int;
  v_wau int;
  v_mau int;
BEGIN
  -- ── DAU: today from raw activity_log (always live) ──
  SELECT COUNT(DISTINCT a.by_profile_id) INTO v_dau
  FROM public.activity_log a
  JOIN public.org_members om ON om.profile_id = a.by_profile_id
  WHERE om.org_id = p_org_id AND a.created_at >= CURRENT_DATE;

  -- ── WAU: MV for [D-6, D-1] UNION today from raw ──
  WITH today AS (
    SELECT DISTINCT a.by_profile_id
    FROM public.activity_log a
    JOIN public.org_members om ON om.profile_id = a.by_profile_id
    WHERE om.org_id = p_org_id AND a.created_at >= CURRENT_DATE
  ),
  past AS (
    SELECT by_profile_id FROM public.org_dau_rollup
    WHERE org_id = p_org_id
      AND activity_date BETWEEN CURRENT_DATE - 6 AND CURRENT_DATE - 1
  )
  SELECT COUNT(*) INTO v_wau FROM (
    SELECT by_profile_id FROM today
    UNION
    SELECT by_profile_id FROM past
  ) combined;

  -- ── MAU: MV for [D-29, D-1] UNION today from raw ──
  WITH today AS (
    SELECT DISTINCT a.by_profile_id
    FROM public.activity_log a
    JOIN public.org_members om ON om.profile_id = a.by_profile_id
    WHERE om.org_id = p_org_id AND a.created_at >= CURRENT_DATE
  ),
  past AS (
    SELECT by_profile_id FROM public.org_dau_rollup
    WHERE org_id = p_org_id
      AND activity_date BETWEEN CURRENT_DATE - 29 AND CURRENT_DATE - 1
  )
  SELECT COUNT(*) INTO v_mau FROM (
    SELECT by_profile_id FROM today
    UNION
    SELECT by_profile_id FROM past
  ) combined;

  RETURN jsonb_build_object(
    'dau', v_dau,
    'wau', v_wau,
    'mau', v_mau,
    'org_id', p_org_id,
    'as_of', CURRENT_DATE::text
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_org_dau_wau_mau(uuid) TO authenticated;

-- ── 6. Platform-wide DAU/WAU/MAU (superadmin only) ──────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_dau_wau_mau()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dau int;
  v_wau int;
  v_mau int;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only superadmin can view platform-wide active-user metrics';
  END IF;

  SELECT COUNT(DISTINCT by_profile_id) INTO v_dau
  FROM public.activity_log
  WHERE created_at >= CURRENT_DATE;

  WITH today AS (
    SELECT by_profile_id FROM public.activity_log WHERE created_at >= CURRENT_DATE
  ),
  past AS (
    SELECT by_profile_id FROM public.org_dau_rollup WHERE activity_date >= CURRENT_DATE - 6
  )
  SELECT COUNT(*) INTO v_wau FROM (
    SELECT by_profile_id FROM today UNION SELECT by_profile_id FROM past
  ) x;

  WITH today AS (
    SELECT by_profile_id FROM public.activity_log WHERE created_at >= CURRENT_DATE
  ),
  past AS (
    SELECT by_profile_id FROM public.org_dau_rollup WHERE activity_date >= CURRENT_DATE - 29
  )
  SELECT COUNT(*) INTO v_mau FROM (
    SELECT by_profile_id FROM today UNION SELECT by_profile_id FROM past
  ) x;

  RETURN jsonb_build_object(
    'dau', v_dau,
    'wau', v_wau,
    'mau', v_mau,
    'as_of', CURRENT_DATE::text
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_platform_dau_wau_mau() TO authenticated;

-- ── 7. Cron schedule ────────────────────────────────────────────────────
-- pg_cron: daily at 3 AM server time (roughly 03:00 UTC = 08:30 IST).
-- Idempotent: cron.schedule is a no-op if the job name already exists.
SELECT cron.schedule(
  'refresh-dau-rollup',
  '0 3 * * *',
  'SELECT public.admin_refresh_dau_rollup()'
);

COMMIT;

-- ── 8. Initial MV load (outside transaction — CONCURRENTLY not allowed on empty MV) ──
REFRESH MATERIALIZED VIEW public.org_dau_rollup;
