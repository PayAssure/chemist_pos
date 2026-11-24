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

## Docker deployment

The POS uses its own Compose project, bridge network, PostgreSQL 16 database (`payassure_pos`), and persistent volume (`payassure_pos_postgres_data`). Its app is published only on `127.0.0.1:3010`; the Settlement Engine's port 3000 and deployment are separate and are not changed by these commands.

### Production environment

The Compose stack reads `.env` from the repository root. For a new deployment only, create it from `.env.example`, replace the placeholders with unique secrets without printing them, and restrict file access:

```sh
umask 077
cp .env.example .env
python3 - <<'PY'
from pathlib import Path
import secrets

path = Path(".env")
content = path.read_text()
content = content.replace(
    "replace-with-a-random-64-character-hex-password", secrets.token_hex(32)
).replace(
    "replace-with-a-random-64-character-hex-secret", secrets.token_hex(32)
)
path.write_text(content)
path.chmod(0o600)
PY
```

For an existing deployment, preserve its `.env` and add only any missing POS variables; do not overwrite existing integration credentials or `SESSION_SECRET`. Keep `SESSION_SECRET` stable across restarts because it signs sessions and encrypts stored PayAssure tokens. Do not copy the Settlement Engine's database URL or credentials into the POS configuration. The existing `DATABASE_URL` in a developer `.env` is not passed to the container; Compose constructs the container URL using the dedicated POS database credentials and hostname `db`.

Runtime environment variables:

| Variable | Requirement | Purpose |
|---|---|---|
| `POS_POSTGRES_DB` | Required; `payassure_pos` | Dedicated POS database name |
| `POS_POSTGRES_USER` | Required; `payassure_pos` | Dedicated POS database user |
| `POS_POSTGRES_PASSWORD` | Required; random strong secret | POS database password |
| `SESSION_SECRET` | Required; random, at least 32 characters | Session signing and PayAssure token encryption |
| `PAYASSURE_API_BASE_URL` | Optional integration | PayAssure API base URL |
| `PAYASSURE_IDENTIFIER` | Optional integration | PayAssure retailer identifier |
| `PAYASSURE_PASSWORD` | Optional integration | PayAssure retailer credential |
| `PAYASSURE_WEBHOOK_URL` | Optional until payment checkout is used | Public HTTPS callback URL ending in `/webhook` |
| `PAYASSURE_DEBUG` | Optional; defaults to `false` | Temporary PayAssure diagnostics |
| `SESSION_DIAGNOSTICS` | Optional; defaults to `false` | Temporary session diagnostics |

Set all three PayAssure API credentials to enable the integration. In production, configure `PAYASSURE_WEBHOOK_URL` with the public HTTPS address and put Nginx/TLS in front of this app. Keep `.env` private; it is ignored by Git and excluded from the Docker build context.

### Deploy and verify

Run these commands from the POS repository on the Ubuntu VPS. They name only the `payassure-pos` Compose project and do not stop, rebuild, or recreate the Settlement Engine:

```sh
# Check the existing Settlement Engine before deployment (HTTP reachability).
curl --silent --show-error --output /dev/null --write-out 'Settlement Engine HTTP %{http_code}\n' http://127.0.0.1:3000/

# Validate configuration, build the POS image, and start only its database.
docker compose config --quiet
docker compose build app
docker compose up -d --wait db
docker compose ps db

# If migrating existing POS data, do that now before starting the app.
# The destination volume must still be empty; see "Existing POS data and schema updates".

# Start the app. It waits for PostgreSQL health, applies the SQL schema, and
# only then opens its HTTP listener.
docker compose up -d --wait app
docker compose ps
curl --fail --show-error http://127.0.0.1:3010/api/health

# Confirm the database identity and that the app is configured for the POS DB.
docker compose exec -T db psql -U payassure_pos -d payassure_pos -Atqc 'SELECT current_database(), current_user'
docker compose exec -T app node -e 'const db = new URL(process.env.DATABASE_URL); if (db.hostname !== "db" || db.pathname !== "/payassure_pos") process.exit(1); console.log("POS app uses its dedicated Compose database")'

# Confirm the Settlement Engine still answers on its original host port.
curl --silent --show-error --output /dev/null --write-out 'Settlement Engine HTTP %{http_code}\n' http://127.0.0.1:3000/
```

Use the Settlement Engine's known health URL instead of `/` if it has one. Nginx should proxy to `http://127.0.0.1:3010`. PostgreSQL has no published host port and is reachable only over `payassure-pos-network`. The app uses `init: true`, runs as the non-root Node user, and handles `SIGTERM` for graceful shutdown.

### Existing POS data and schema updates

The project uses the `pg` PostgreSQL driver and ordered SQL schema files in `server/schema/`, not Prisma or another ORM. On every app startup, the existing `initializeDatabase()` process applies these schema files before listening. They include conditional table/column/index creation, constraint updates, and guarded data backfills; there is no separate production migration command. The obsolete prescription columns are retained to avoid deleting legacy data. Seeding is not run automatically.

If existing POS records need to be copied into the new dedicated database, first verify that the source is the POS database and is not the Settlement Engine database. Set `SOURCE_DATABASE_URL` in `.env` only after that verification, then run:

```sh
node scripts/migrate-database-to-compose.mjs
```

This one-time, read-only source dump restores into the new POS volume and refuses to restore over an initialized destination. It requires `pg_dump` on the host at the same or a newer major version than the source PostgreSQL server. Do not run this against the Settlement Engine database. Keep a tested backup of the source and verify POS records after import.

Normal redeployment:

```sh
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
curl --fail --show-error http://127.0.0.1:3010/api/health
```

`docker compose down` stops only this POS project and preserves its data. Never use `docker compose down -v` for routine deployment; it deletes the POS database volume.

Provision a private staff account after the app is healthy:

```sh
docker compose run --rm \
  -e POS_USER_EMAIL=staff@example.com \
  -e POS_USER_PASSWORD='use-a-long-unique-password' \
  app node dist/server/src/create-user.js
```

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

## Login credentials

To provision the configured login accounts, set `POS_ALLOW_SAMPLE_DATA=true` and provide `POS_SAMPLE_USER_PASSWORD` (at least 12 characters). The seeder can run against either a local or production database:

```sh
NODE_ENV=development POS_ALLOW_SAMPLE_DATA=true POS_SAMPLE_USER_PASSWORD='Password@123' npm run seed
```

Set `DATABASE_URL` to the intended database before running the seeder. In production, use a unique strong `POS_SAMPLE_USER_PASSWORD`; the seeder creates or updates `kimaniwilfred95@gmail.com` and `zionlandfarmcareltd@gmail.com` with that password and ensures the three private login accounts (`sample.cashier@payassure.local`, `sample.pharmacist@payassure.local`, and `sample.manager@payassure.local`) exist. Strong one-time passwords for newly created accounts are printed; save them then. The seeder only creates or updates login credentials. It does not create suppliers, products, batches, sales, customers, or failed checkout attempts, and it does not modify existing inventory or transaction data.

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
