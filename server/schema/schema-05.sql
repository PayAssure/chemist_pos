CREATE TABLE IF NOT EXISTS failed_checkout_attempts (
  id SERIAL PRIMARY KEY,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'credit')),
  total_cents BIGINT CHECK (total_cents >= 0),
  failure_reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE failed_checkout_attempts DROP CONSTRAINT IF EXISTS failed_checkout_attempts_payment_method_check;
ALTER TABLE failed_checkout_attempts ADD CONSTRAINT failed_checkout_attempts_payment_method_check
  CHECK (payment_method IN ('cash', 'mpesa', 'credit'));

CREATE INDEX IF NOT EXISTS failed_checkout_attempts_created_at_idx
  ON failed_checkout_attempts (created_at DESC);

CREATE INDEX IF NOT EXISTS sales_created_at_idx ON sales (created_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS product_batches_expiry_idx ON product_batches (product_id, expiry_date);
