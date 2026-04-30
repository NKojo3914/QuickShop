-- Delivery code + escrow split migration
-- Extends the paystack-escrow schema with:
--   • Delivery code (6-digit PIN sent to buyer on payment)
--   • Delivery fee + total_charged split on orders
--   • Auto-release timestamp (48h timer after shipping)
--   • Refund tracking columns
--   • Store-level delivery fee setting
--   • Vendor security deposit + debt tracking
--
-- Run once against the production database:
--   psql $DATABASE_URL -f 2026-04-30-delivery-escrow.sql
-- Or paste into Railway → Postgres → Query console.

-- ── orders ──────────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee              numeric(12,2),
  ADD COLUMN IF NOT EXISTS total_charged             numeric(12,2),
  ADD COLUMN IF NOT EXISTS delivery_code             text,
  ADD COLUMN IF NOT EXISTS delivery_code_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_release_at           timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at               timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reference          text;

-- ── stores ──────────────────────────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS delivery_fee              numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_deposit            numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_deposit_paid_at    timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_deposit_reference  text,
  ADD COLUMN IF NOT EXISTS vendor_debt               numeric(12,2) DEFAULT 0;
