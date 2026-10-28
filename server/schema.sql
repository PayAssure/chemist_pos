CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  payassure_merchant_id TEXT,
  payassure_enrolled BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT suppliers_payassure_registration_check CHECK (
    (payassure_enrolled AND payassure_merchant_id IS NOT NULL
      AND length(btrim(payassure_merchant_id)) > 0)
    OR (NOT payassure_enrolled AND payassure_merchant_id IS NULL)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE suppliers ALTER COLUMN payassure_merchant_id DROP NOT NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payassure_enrolled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_payassure_merchant_id_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'suppliers_payassure_registration_check'
      AND conrelid = 'suppliers'::regclass
  ) THEN
    ALTER TABLE suppliers ADD CONSTRAINT suppliers_payassure_registration_check CHECK (
      (payassure_enrolled AND payassure_merchant_id IS NOT NULL
        AND length(btrim(payassure_merchant_id)) > 0)
      OR (NOT payassure_enrolled AND payassure_merchant_id IS NULL)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  buying_price_cents INTEGER CHECK (buying_price_cents >= 0),
  stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  active_ingredient TEXT NOT NULL DEFAULT '',
  prescription_required BOOLEAN NOT NULL DEFAULT FALSE,
  brand TEXT NOT NULL DEFAULT '',
  preferred_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Medicine',
  dosage_form TEXT NOT NULL DEFAULT '',
  strength TEXT NOT NULL DEFAULT '',
  sale_unit TEXT NOT NULL DEFAULT 'single'
    CHECK (sale_unit IN ('single', 'kit', 'bottle', 'blister_pack', 'tin', 'pack', 'box')),
  units_per_pack INTEGER CHECK (units_per_pack > 0),
  reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  barcode TEXT,
  stock_code TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS active_ingredient TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS prescription_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS buying_price_cents INTEGER CHECK (buying_price_cents >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS preferred_name TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Medicine';
ALTER TABLE products ADD COLUMN IF NOT EXISTS dosage_form TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS strength TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_unit TEXT NOT NULL DEFAULT 'single';
ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_pack INTEGER CHECK (units_per_pack > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sale_unit_check;
ALTER TABLE products ADD CONSTRAINT products_sale_unit_check
  CHECK (sale_unit IN ('single', 'kit', 'bottle', 'blister_pack', 'tin', 'pack', 'box'));

UPDATE products
SET category = CASE
      WHEN lower(name) ~ '(thermometer|dressing|bandage)' THEN 'Medical supplies'
      ELSE 'Medicine'
    END,
    dosage_form = COALESCE(
      substring(name FROM '(?i)(tablets|capsules|sachets|solution|inhaler|cream|drops|spray|powder|pack)'),
      ''
    ),
    strength = COALESCE(substring(name FROM '(?i)[0-9]+[.]?[0-9]*[ ]?mg|[0-9]+[.]?[0-9]*[ ]?mcg|[0-9]+[.]?[0-9]*[ ]?g|[0-9]+[.]?[0-9]*[ ]?%'), '')
WHERE category = 'Medicine'
  AND dosage_form = ''
  AND strength = '';

CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique_idx
  ON products (lower(barcode)) WHERE barcode IS NOT NULL AND length(btrim(barcode)) > 0;
CREATE UNIQUE INDEX IF NOT EXISTS products_stock_code_unique_idx
  ON products (lower(stock_code)) WHERE stock_code IS NOT NULL AND length(btrim(stock_code)) > 0;

CREATE TABLE IF NOT EXISTS product_batches (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_code TEXT NOT NULL,
  expiry_date DATE,
  stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, batch_code)
);

INSERT INTO product_batches (product_id, batch_code, expiry_date, stock_count)
SELECT p.id, 'LEGACY-UNVERIFIED', NULL, p.stock_count
FROM products p
WHERE p.stock_count > 0
  AND NOT EXISTS (
    SELECT 1 FROM product_batches b WHERE b.product_id = p.id
  )
ON CONFLICT (product_id, batch_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'credit')),
  status TEXT NOT NULL CHECK (status IN ('completed', 'pending', 'failed')),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  payer_name TEXT,
  payer_phone TEXT,
  prescription_reference TEXT,
  prescription_checked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'mpesa', 'credit'));
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payer_phone TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS prescription_reference TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS prescription_checked_by TEXT;

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
