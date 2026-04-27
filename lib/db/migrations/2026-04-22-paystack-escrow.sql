-- Paystack escrow migration
-- Run this once against the production database (Railway → Postgres → Query):
--   psql $DATABASE_URL -f 2026-04-22-paystack-escrow.sql
-- Or paste into Railway's web SQL console.

-- ── orders ──────────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount             numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency           text,
  ADD COLUMN IF NOT EXISTS payment_reference  text,
  ADD COLUMN IF NOT EXISTS payment_status     text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at            timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at         timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_photo_url  text,
  ADD COLUMN IF NOT EXISTS received_at        timestamptz,
  ADD COLUMN IF NOT EXISTS released_at        timestamptz,
  ADD COLUMN IF NOT EXISTS payout_reference   text,
  ADD COLUMN IF NOT EXISTS payout_status      text,
  ADD COLUMN IF NOT EXISTS dispute_raised_at  timestamptz,
  ADD COLUMN IF NOT EXISTS platform_fee       numeric(12,2);

-- A payment_reference must be unique so we can look up an order from the
-- Paystack webhook payload.
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_reference_uniq
  ON orders (payment_reference)
  WHERE payment_reference IS NOT NULL;

-- ── stores ──────────────────────────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS paystack_bank_code        text,
  ADD COLUMN IF NOT EXISTS paystack_account_number   text,
  ADD COLUMN IF NOT EXISTS paystack_account_name     text,
  ADD COLUMN IF NOT EXISTS paystack_recipient_code   text;
