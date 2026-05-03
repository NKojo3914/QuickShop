-- One-time token sent to the buyer after delivery so they can leave a review
-- without needing an account. Validated against the order on POST.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS review_token text;

CREATE TABLE IF NOT EXISTS reviews (
  id            serial PRIMARY KEY,
  order_id      integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id      integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  rating        integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          text,
  customer_name text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One review per order
CREATE UNIQUE INDEX IF NOT EXISTS reviews_order_id_unique ON reviews(order_id);
-- Fast per-store lookups for storefront display
CREATE INDEX IF NOT EXISTS reviews_store_id_idx ON reviews(store_id);
