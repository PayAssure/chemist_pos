DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_credit_payer_check'
      AND conrelid = 'sales'::regclass
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_credit_payer_check CHECK (
      (payment_method = 'credit'
        AND payer_name IS NOT NULL AND length(btrim(payer_name)) > 0
        AND payer_phone IS NOT NULL AND length(btrim(payer_phone)) > 0)
      OR (payment_method <> 'credit' AND payer_name IS NULL AND payer_phone IS NULL)
    );
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
  batch_id INTEGER REFERENCES product_batches(id) ON DELETE SET NULL,
  batch_code TEXT,
  batch_expiry_date DATE,
  buying_unit_price_cents INTEGER CHECK (buying_unit_price_cents >= 0),
  supplier_id INTEGER REFERENCES suppliers(id),
  supplier_name TEXT
);

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id) ON DELETE SET NULL;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_code TEXT;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS batch_expiry_date DATE;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS buying_unit_price_cents INTEGER CHECK (buying_unit_price_cents >= 0);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS supplier_name TEXT;

CREATE TABLE IF NOT EXISTS payassure_settlements (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
  merchant_transaction_reference TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  request_payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'accepted', 'failed')),
  collection_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (collection_status IN ('pending', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  provider_request_id TEXT,
  provider_settlement_id TEXT,
  last_event_type TEXT,
  last_event_payload JSONB,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
