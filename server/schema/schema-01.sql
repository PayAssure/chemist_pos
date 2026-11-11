CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sample_seed_runs (
  seed_name TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payassure_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT,
  refresh_token TEXT,
  user_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payassure_tokens ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  payassure_merchant_id TEXT,
  payassure_enrolled BOOLEAN NOT NULL DEFAULT TRUE,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  CONSTRAINT suppliers_payassure_registration_check CHECK (
    (payassure_enrolled AND payassure_merchant_id IS NOT NULL
      AND length(btrim(payassure_merchant_id)) > 0)
    OR (NOT payassure_enrolled AND (
      payassure_merchant_id IS NULL OR payassure_merchant_id ~ '^pos_supplier_[0-9]{3,}$'
    ))
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE suppliers ALTER COLUMN payassure_merchant_id DROP NOT NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payassure_enrolled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_payassure_merchant_id_check;
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_payassure_registration_check;

ALTER TABLE suppliers ADD CONSTRAINT suppliers_payassure_registration_check CHECK (
  (payassure_enrolled AND payassure_merchant_id IS NOT NULL
    AND length(btrim(payassure_merchant_id)) > 0)
  OR (NOT payassure_enrolled AND (
    payassure_merchant_id IS NULL OR payassure_merchant_id ~ '^pos_supplier_[0-9]{3,}$'
  ))
);

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
