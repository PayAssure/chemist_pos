# PayAssure Pharmacy POS

A lightweight pharmacy point of sale for private staff accounts. It provides medicine inventory by batch, expiry-aware cash and credit checkout, required payer details on credit sales, prescription-reference capture, supplier-linked products, and an informational transaction history. It is not an accounting or dispensing system.

## Requirements and setup

- Node.js 20 or newer
- PostgreSQL

Set `DATABASE_URL` and a random `SESSION_SECRET` (at least 32 characters) in `.env`.

```sh
npm install
npm run dev
```

The API applies the schema and additive pharmacy migrations on startup. The web UI is available at `http://localhost:5173`; the API uses the `PORT` value from `.env` (default `3000`), and the web development proxy forwards `/api` requests to that port.

Create a normal staff account privately; there is no public registration. Passwords must be at least 12 characters. For a localhost development database only, the private provisioning command allows a minimum of 8 characters for disposable test accounts:

```sh
POS_USER_EMAIL=staff@example.test POS_USER_PASSWORD='use-a-long-unique-password' npm run user:create
```

## Pharmacy flows

- Each product requires a recorded supplier. Suppliers are marked as enrolled or not enrolled in PayAssure; only enrolled suppliers require a merchant ID.
- Product records include brand, category, active ingredient, dosage form, strength, selling unit, optional units per pack, barcode/stock code, description, reorder level, and a prescription-required flag. Product details can be edited without changing batch stock. Stock and prices are counted per selected selling unit; pack size is informational.
- Inventory is recorded by batch code, expiry date, and quantity. Unknown-expiry legacy stock is retained for audit/count purposes, but cannot be sold.
- Checkout locks stock, consumes the earliest-expiring unexpired batches first, and records the batch on each sale item. Credit checkout requires the payer’s name and phone number.
- Checkout requires a prescription reference for any cart containing a prescription-required medicine. The signed-in staff account is recorded as having checked it; this is an operator attestation, not external prescription verification.
- Transaction history shows payment status, items, batches, and prescription reference. It is informational, not an accounting ledger.
- M-Pesa requests and status checks go only through the backend. Until the PayAssure API contract is available, those endpoints return `503 MPESA_NOT_CONFIGURED`; no successful M-Pesa payment is simulated.

## Sample data and users

For a local development database only, set `NODE_ENV=development` and `POS_ALLOW_SAMPLE_DATA=true`, then run:

```sh
npm run seed:sample
```

The seeder refuses to run outside development or against a non-localhost database. On an empty sample dataset it creates 12 suppliers, 46 medicines, 92 batches, 360 completed transactions, and three recent failed checkout attempts, plus three private sample users (`sample.cashier@payassure.local`, `sample.pharmacist@payassure.local`, and `sample.manager@payassure.local`). The sample includes 12 transactions for today, four on credit, so the dashboard has sales, supplier cost, credit, and failed-checkout data to display immediately. Strong one-time passwords are generated and printed after successful seeding; save them then. Sample customer contact details and suppliers are demo-only; supplier IDs use clearly marked `DEMO-PA-TEST-*` values and must not be used for real PayAssure payments. Sample M-Pesa transactions are never generated.

## API

All endpoints except health and login require an authenticated session.

- `GET /api/health`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/suppliers`
- `GET/POST /api/products` — creating a product also requires its initial batch code and expiry
- `GET /api/batches`
- `POST /api/products/:id/batches` — receive a batch
- `PATCH /api/batches/:id/stock` — correct one batch's on-hand count
- `POST /api/checkout` — cash or credit checkout (credit requires `payerName` and `payerPhone`), or an explicit M-Pesa-not-configured response
- `GET /api/checkout/:reference/status`
- `GET /api/sales`

## PayAssure merchant ID validation

For suppliers marked as enrolled, the merchant ID is mandatory and cannot be blank, but its real format or validity cannot be verified until the PayAssure contract or validation endpoint is provided. The app does not claim that a non-empty ID has been validated.
# chemist_pos
