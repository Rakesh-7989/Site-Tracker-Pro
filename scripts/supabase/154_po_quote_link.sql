-- SiteTrack Pro — v4 Phase D6: register cross-links.
-- Run AFTER 153_procurement_quotes.sql. Idempotent.
--
-- Two changes:
--   1. purchase_orders.quote_id → procurement_quotes(id) ON DELETE SET NULL.
--      When a manager raises a PO from a selected quote (ProcurementView),
--      the PO row records which quote produced it so the design → quote → PO
--      chain is traceable end-to-end. Read-only provenance link; no RLS
--      change (purchase_orders write gate already covers managers + org admin
--      incl. has_project_role).
--   2. org_calendar() gains a third branch: expiring approved NOCs
--      (valid_until within the next 30 days) so renewals surface in the org
--      /calendar agenda as kind='noc' rows.

BEGIN;

-- ── 1. PO ↔ quote provenance ──────────────────────────────────────────────
alter table public.purchase_orders
  add column if not exists quote_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_orders_quote_id_fkey'
      and conrelid = 'public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_quote_id_fkey
      foreign key (quote_id) references public.procurement_quotes(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_purchase_orders_quote_id
  on public.purchase_orders(quote_id) where quote_id is not null;

-- ── 2. org_calendar NOC branch ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_calendar(p_org uuid)
RETURNS TABLE (kind text, id uuid, project_id uuid, project_name text, title text, due_date date, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'milestone'::text, m.id, m.project_id, p.name, m.title, m.due_date, m.status
  FROM public.milestones m JOIN public.projects p ON p.id = m.project_id
  WHERE p.org_id = p_org AND m.due_date IS NOT NULL
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  UNION ALL
  SELECT 'task'::text, t.id, t.project_id, p.name, t.title, t.due_date, t.status
  FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
  WHERE p.org_id = p_org AND t.due_date IS NOT NULL
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  UNION ALL
  SELECT 'noc'::text, s.id, s.project_id, p.name, s.title, s.valid_until, s.status
  FROM public.statutory_approvals s JOIN public.projects p ON p.id = s.project_id
  WHERE p.org_id = p_org AND s.status = 'approved' AND s.valid_until IS NOT NULL
    AND s.valid_until >= current_date
    AND s.valid_until <= current_date + interval '30 days'
    AND (public.is_superadmin() OR p_org = ANY(public.user_org_ids()))
  ORDER BY due_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.org_calendar(uuid) TO authenticated;
COMMENT ON FUNCTION public.org_calendar(uuid) IS 'Dated milestones + tasks + expiring NOCs across an org''s projects (calendar). Empty for non-members.';

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.purchase_orders WHERE quote_id IS NOT NULL;
  RAISE NOTICE '154_po_quote_link: purchase_orders_with_quote=%', n;
END $$;

COMMIT;
