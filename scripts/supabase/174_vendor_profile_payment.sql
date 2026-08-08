-- SiteTrack Pro — V6 Phase 1.2: Vendor Portal — link vendors to auth users.
-- Adds profile_id FK to vendors so a vendor user can auto-identify their record.
-- Also adds payment tracking columns to purchase_orders for vendor-facing payment status.

BEGIN;

-- 1. Add profile_id to vendors (links to auth user)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vendors_profile_idx ON public.vendors(profile_id) WHERE profile_id IS NOT NULL;

-- 2. Add payment tracking to purchase_orders (for vendor-facing payment status)
-- These columns track the linked invoice and payment status without changing invoice logic
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','partial','paid','overdue'));

CREATE INDEX IF NOT EXISTS purchase_orders_invoice_idx ON public.purchase_orders(invoice_id) WHERE invoice_id IS NOT NULL;

-- 3. Update purchase_orders RLS to allow vendor users to read their own POs
-- (vendors have org-tier role 'vendor' which has po:create capability)
DROP POLICY IF EXISTS po_vendor_read ON public.purchase_orders;
CREATE POLICY po_vendor_read ON public.purchase_orders
  FOR SELECT
  USING (
    vendor_id IN (
      SELECT id FROM public.vendors
      WHERE profile_id = auth.uid() AND org_id = ANY(public.user_org_ids())
    )
  );

COMMIT;