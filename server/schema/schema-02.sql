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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'mpesa', 'credit'));
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payer_phone TEXT;
ALTER TABLE sales DROP COLUMN IF EXISTS prescription_reference;
ALTER TABLE sales DROP COLUMN IF EXISTS prescription_checked_by;
