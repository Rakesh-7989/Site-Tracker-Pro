-- SiteTrack Pro -- Razorpay payment link columns (migration 253)
-- Adds columns to invoices for tracking Razorpay payment link state.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS razorpay_payment_link_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS razorpay_status TEXT DEFAULT 'pending';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS razorpay_payment_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_razorpay_status ON invoices(razorpay_status)
  WHERE razorpay_status != 'paid';

COMMENT ON COLUMN invoices.razorpay_payment_link_id IS 'Razorpay payment link ID (razorpay_payment_links table)';
COMMENT ON COLUMN invoices.razorpay_status IS 'pending | created | paid | failed | expired | cancelled | partial';
COMMENT ON COLUMN invoices.razorpay_payment_at IS 'When Razorpay confirmed the payment';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'invoices_razorpay_status_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_razorpay_status_check
      CHECK (razorpay_status IN ('pending', 'created', 'paid', 'failed', 'expired', 'cancelled', 'partial'));
  END IF;
END $$;