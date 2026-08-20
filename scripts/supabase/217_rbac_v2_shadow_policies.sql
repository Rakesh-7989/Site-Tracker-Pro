-- SiteTrack Pro — RBAC V2 → RLS shadow wiring (2026-08-19). Phase 1 / 1.1 (SEC-01, RBAC V2).
--
-- Goal: adopt `v2_check_access()` into the DOMAIN RLS policies in SHADOW mode —
-- zero behavior change while the V2 engine runs inside every row's decision.
--
--   v2_policy_check()  — SECURITY DEFINER STABLE dispatcher ANDed into domain
--                        policies. Per-org mode comes from org_rbac_settings
--                        (migration 203); absent row = 'matrix' (V2 off):
--                          matrix  → true  (V2 off — matrix decides)
--                          shadow  → computes v2_check_access() but returns
--                                    true  (matrix still decides; the V2 path is
--                                    exercised on every row, and any error in it
--                                    is swallowed + NOTICE-logged so a broken V2
--                                    layer can NEVER change live behavior — the
--                                    zero-behavior-change guarantee is absolute)
--                          enforce → returns v2_check_access() (V2 decides)
--
-- A NULL resource id (e.g. a child-table parent lookup returned nothing) also
-- returns true so the existing matrix gate does the real filtering.
--
-- Wired into the core ORG-SCOPED domain tables (the Policy-Core flagship set):
--   leads (CRM)                → crm:view / crm:manage
--   research_documents         → research:view / research:manage
--   research_collections       → research:view / research:manage
--   collection_documents       → research:view / research:manage
--   procurement_quotes         → procurement:view
--
-- In enforce mode the V2 fallback (org membership) mirrors the matrix gate, so
-- the ONLY behavioral delta is an explicit deny/allow ACL row — the
-- shadow → enforce cutover is low-risk and capability-specific.
--
-- IDEMPOTENT.

BEGIN;

-- ── 1. The mode-aware policy gate ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.v2_policy_check(
  p_capability    text,
  p_resource_type text,
  p_resource_id   uuid,
  p_org_id        uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mode text;
  v_verdict boolean;
BEGIN
  -- No resource context (child-table parent lookup returned NULL) → the matrix
  -- gate does the filtering; never spurious-deny.
  IF p_org_id IS NULL THEN
    RETURN true;
  END IF;

  -- Org mode: absent row = 'matrix' (V2 off — back-compat, zero change).
  SELECT mode INTO v_mode FROM public.org_rbac_settings WHERE org_id = p_org_id;
  IF v_mode IS NULL OR v_mode = 'matrix' THEN
    RETURN true;
  END IF;

  -- enforce: V2 decides.
  IF v_mode = 'enforce' THEN
    RETURN public.v2_check_access(p_capability, p_resource_type, p_resource_id, NULL);
  END IF;

  -- shadow: compute the V2 verdict (exercises the path) but matrix still
  -- decides. Any V2-path error is swallowed + NOTICE-logged → zero behavior
  -- change is absolute even if the V2 layer breaks.
  BEGIN
    v_verdict := public.v2_check_access(p_capability, p_resource_type, p_resource_id, NULL);
    RETURN true;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'v2_policy_check shadow: % (%)', SQLERRM, p_capability;
    RETURN true;
  END;
END;
$$;

COMMENT ON FUNCTION public.v2_policy_check(text, text, uuid, uuid) IS
  'RBAC V2 mode-aware RLS policy gate: matrix=off(true) | shadow=compute+true (matrix decides) | enforce=V2 verdict.';

GRANT EXECUTE ON FUNCTION public.v2_policy_check(text, text, uuid, uuid) TO authenticated, anon;

-- ── 2. leads (CRM) ────────────────────────────────────────────────────────────
drop policy if exists leads_read on public.leads;
create policy leads_read on public.leads for select
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('crm:view', 'org', org_id, org_id)
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('crm:manage', 'org', org_id, org_id)
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads for update
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('crm:manage', 'org', org_id, org_id)
  )
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('crm:manage', 'org', org_id, org_id)
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
    and public.v2_policy_check('crm:manage', 'org', org_id, org_id)
  );

-- ── 3. research_documents ─────────────────────────────────────────────────────
drop policy if exists research_docs_read on public.research_documents;
create policy research_docs_read on public.research_documents for select
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:view', 'org', org_id, org_id)
  );

drop policy if exists research_docs_insert on public.research_documents;
create policy research_docs_insert on public.research_documents for insert
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  );

drop policy if exists research_docs_update on public.research_documents;
create policy research_docs_update on public.research_documents for update
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  )
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  );

drop policy if exists research_docs_delete on public.research_documents;
create policy research_docs_delete on public.research_documents for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  );

-- ── 4. research_collections ───────────────────────────────────────────────────
drop policy if exists research_collections_read on public.research_collections;
create policy research_collections_read on public.research_collections for select
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:view', 'org', org_id, org_id)
  );

drop policy if exists research_collections_insert on public.research_collections;
create policy research_collections_insert on public.research_collections for insert
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  );

drop policy if exists research_collections_update on public.research_collections;
create policy research_collections_update on public.research_collections for update
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  )
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  );

drop policy if exists research_collections_delete on public.research_collections;
create policy research_collections_delete on public.research_collections for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
    and public.v2_policy_check('research:manage', 'org', org_id, org_id)
  );

-- ── 5. collection_documents (gate via the parent collection's org) ───────────
drop policy if exists collection_docs_read on public.collection_documents;
create policy collection_docs_read on public.collection_documents for select
  using (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and public.v2_policy_check(
      'research:view', 'org',
      (select org_id from public.research_collections where id = collection_id),
      (select org_id from public.research_collections where id = collection_id)
    )
  );

drop policy if exists collection_docs_write on public.collection_documents;
create policy collection_docs_write on public.collection_documents for insert
  with check (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and document_id in (
      select id from public.research_documents
      where org_id = any(public.user_org_ids())
    )
    and public.v2_policy_check(
      'research:manage', 'org',
      (select org_id from public.research_collections where id = collection_id),
      (select org_id from public.research_collections where id = collection_id)
    )
  );

drop policy if exists collection_docs_update on public.collection_documents;
create policy collection_docs_update on public.collection_documents for update
  using (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and public.v2_policy_check(
      'research:manage', 'org',
      (select org_id from public.research_collections where id = collection_id),
      (select org_id from public.research_collections where id = collection_id)
    )
  )
  with check (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and document_id in (
      select id from public.research_documents
      where org_id = any(public.user_org_ids())
    )
    and public.v2_policy_check(
      'research:manage', 'org',
      (select org_id from public.research_collections where id = collection_id),
      (select org_id from public.research_collections where id = collection_id)
    )
  );

drop policy if exists collection_docs_delete on public.collection_documents;
create policy collection_docs_delete on public.collection_documents for delete
  using (
    collection_id in (
      select id from public.research_collections
      where org_id = any(public.user_org_ids())
    )
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','superadmin')
    )
    and public.v2_policy_check(
      'research:manage', 'org',
      (select org_id from public.research_collections where id = collection_id),
      (select org_id from public.research_collections where id = collection_id)
    )
  );

-- ── 6. procurement_quotes ─────────────────────────────────────────────────────
drop policy if exists procurement_quotes_read on public.procurement_quotes;
create policy procurement_quotes_read on public.procurement_quotes for select
  using (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('procurement:view', 'org', org_id, org_id)
  );

drop policy if exists procurement_quotes_insert on public.procurement_quotes;
create policy procurement_quotes_insert on public.procurement_quotes for insert
  with check (
    org_id = any(public.user_org_ids())
    and (
      public.has_org_tier(org_id, 'vendor')
      or is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
    and public.v2_policy_check('procurement:view', 'org', org_id, org_id)
  );

drop policy if exists procurement_quotes_update on public.procurement_quotes;
create policy procurement_quotes_update on public.procurement_quotes for update
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
    and public.v2_policy_check('procurement:view', 'org', org_id, org_id)
  )
  with check (
    org_id = any(public.user_org_ids())
    and public.v2_policy_check('procurement:view', 'org', org_id, org_id)
  );

drop policy if exists procurement_quotes_delete on public.procurement_quotes;
create policy procurement_quotes_delete on public.procurement_quotes for delete
  using (
    org_id = any(public.user_org_ids())
    and (
      is_orgadmin()
      or current_role_text() in ('pm','project_admin','design_head','consultant_head','superadmin')
    )
    and public.v2_policy_check('procurement:view', 'org', org_id, org_id)
  );

DO $$ BEGIN
  RAISE NOTICE '217_rbac_v2_shadow_policies: v2_policy_check wired into leads/research/procurement domain policies (shadow).';
END $$;

COMMIT;