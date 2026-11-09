# PayAssure Pharmacy POS

A lightweight pharmacy point of sale for private staff accounts. It provides medicine inventory by batch, expiry-aware cash and credit checkout, required payer details on credit sales, supplier-linked products, and an informational transaction history. It is not an accounting or dispensing system.

## Requirements and setup

- Node.js 20 or newer
- PostgreSQL

Set `DATABASE_URL` and a random `SESSION_SECRET` (at least 32 characters) in `.env`.
To enable PayAssure participant data, the supplier directory, float management, and settlement checkout, also set `PAYASSURE_API_BASE_URL`, `PAYASSURE_IDENTIFIER`, and `PAYASSURE_PASSWORD`. The server signs in or rotates its refresh token at POS login, stores both tokens encrypted with `SESSION_SECRET`, and proxies authenticated PayAssure requests. Retailer API credentials are used by the server for settlement authentication; settlement logs redact credentials and session tokens.
Outbound PayAssure API requests use IPv4, so the POS server must have outbound IPv4 connectivity to the configured API host on HTTPS port 443.
To receive collection and settlement events, set `PAYASSURE_WEBHOOK_URL` to the receiver URL ending in `/webhook` (for example `https://pos.example.com/webhook`; HTTP is also accepted where needed). This is separate from `PAYASSURE_API_BASE_URL`, which is used only for outbound PayAssure API requests. At POS login, the server registers this URL as the retailer participant's fallback webhook URL. An integration-specific webhook URL takes precedence; if present, it must point to the same receiver, or be removed so the participant fallback is used. The server logs the effective endpoint selected. Checkout is blocked until an effective receiver is configured. The listener verifies PayAssure's raw-body HMAC signature and five-minute timestamp window using the API secret for the recipient merchant ID.

```sh
npm install
npm run dev
```

The API applies the schema and additive pharmacy migrations on startup. The web UI is available at `http://localhost:5173`; the API uses the `PORT` value from `.env` (default `3000`), and the web development proxy forwards `/api` requests to that port.

## Netlify deployment

The Netlify configuration builds the frontend and server with `npm run build`, publishes `web/dist`, and serves the Express API and `/webhook` through a Netlify Function. Configure the required server environment variables (`DATABASE_URL`, `SESSION_SECRET`, and any PayAssure settings) in the Netlify site settings; do not commit `.env`.

Run the app locally through Netlify with `npx netlify dev`. To build and deploy the production site in one command, run `npx netlify deploy --build --prod` after linking the site with the Netlify CLI.

Create a normal staff account privately; there is no public registration. Passwords must be at least 12 characters. For a localhost development database only, the private provisioning command allows a minimum of 8 characters for disposable test accounts:

```sh
POS_USER_EMAIL=staff@example.test POS_USER_PASSWORD='use-a-long-unique-password' npm run user:create
```

## Pharmacy flows

- Each product requires a recorded supplier. Enrolled suppliers are selected from the PayAssure supplier directory; other suppliers can be added with optional contact name, phone, email, and address details.
- Product records include brand, category, active ingredient, dosage form, strength, selling unit, optional units per pack, barcode/stock code, description, reorder level, and a prescription-required flag. Product details can be edited without changing batch stock. Stock and prices are counted per selected selling unit; pack size is informational.
- Inventory is recorded by batch code, expiry date, and quantity. Unknown-expiry legacy stock is retained for audit/count purposes, but cannot be sold.
- Checkout locks stock, consumes the earliest-expiring unexpired batches first, and records the batch on each sale item. Credit checkout requires the payer’s name and phone number and maps to CASH for PayAssure. M-Pesa checkout asks for the customer’s phone number and sends the full sale amount through PayAssure.
- Checkout persists a pending sale and inventory reservation before initiating PayAssure, then polls for up to two minutes for the signed collection webhook to be processed. Inventory quantities are deducted only once, after `payment.collection.succeeded`; `payment.collection.failed` releases the reservation without changing inventory. Webhook endpoint registration, effective endpoint selection, receipt, processing status, and failures are logged without logging full payloads or secrets. Events are deduplicated by recipient merchant ID and event ID, allowing the same event ID to be delivered separately to different merchants. The UI never re-initiates the same merchant transaction reference, preventing duplicate customer charges.
- Signed settlement-started, progress, partially-failed, retrying, completed, and reconciliation-required events update settlement tracking independently from collection. PayAssure owns payment and payout retries; the POS does not re-submit a failed request because that could charge the customer twice.
- The PayAssure float balance is shown throughout the POS, with deposit requests available on PayAssure data. A submitted STK request is not credited; only a verified successful callback changes the virtual balance.
- Transaction history shows payment status, items, and batches. It is informational, not an accounting ledger.

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
- `GET /api/payassure/suppliers` — loads and filters the authenticated PayAssure supplier directory.
- `GET /api/payassure/float` — loads the retailer's float configuration and database-derived balance.
- `POST /api/payassure/float/balance` — checks the authenticated retailer's virtual balance.
- `POST /api/payassure/float/deposits` — requests an M-Pesa float deposit with a positive whole-KES `amount` and `payerPhoneNumber`.
- `GET/POST /api/products` — creating a product also requires its initial batch code and expiry
- `GET /api/batches`
- `POST /api/products/:id/batches` — receive a batch
- `PATCH /api/batches/:id/stock` — correct one batch's on-hand count
- `POST /api/checkout` — cash, credit, or M-Pesa checkout; accepts an optional stable `merchantTransactionReference`, and requires `payerPhone` for M-Pesa
- `GET /api/checkout/:reference/status` — returns collection and settlement status for the checkout reference or sale ID.
- `POST /webhook` — public PayAssure callback; verifies timestamped HMAC signatures and deduplicates by recipient merchant ID plus event ID.
- `GET /api/sales`

# chemist_pos
