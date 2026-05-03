-- Promo / discount codes per store
CREATE TABLE IF NOT EXISTS promo_codes (
  id           serial PRIMARY KEY,
  store_id     integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code         text NOT NULL,                        -- e.g. "SAVE10"
  type         text NOT NULL DEFAULT 'percent',      -- 'percent' | 'fixed'
  value        numeric(10,2) NOT NULL,               -- % or currency amount
  max_uses     integer,                              -- NULL = unlimited
  used_count   integer NOT NULL DEFAULT 0,
  expires_at   timestamptz,                          -- NULL = no expiry
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One code per store (case-insensitive enforced at app level by uppercasing)
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_store_code_unique
  ON promo_codes (store_id, code);
