-- Add category and hasVariants flag to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false;

-- Product variants table (for size/colour/etc picking)
CREATE TABLE IF NOT EXISTS product_variants (
  id            serial PRIMARY KEY,
  product_id    integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label         text NOT NULL,
  in_stock      boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants(product_id);
