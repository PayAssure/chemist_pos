# Authentication

This document describes the authentication behavior implemented by the POS application. The main implementation is in [`server/src/auth.ts`](./server/src/auth.ts), the Express setup is in [`server/src/index.ts`](./server/src/index.ts), and the browser-side login/session UI is under [`web/src/auth/`](./web/src/auth/).

## At a glance

Staff authenticate with a provisioned email address and password. The server verifies the password against a bcrypt hash in PostgreSQL and creates an Express session. The browser receives a signed session cookie; the session data itself is stored server-side in PostgreSQL. Subsequent protected API requests send that cookie, and the `requireAuth` middleware checks that the session contains a `userId`.

This is cookie-backed session authentication, not JWT or bearer-token authentication. The PayAssure service integration has its own server-side credentials and tokens; those are not the staff user's login session.

## Staff login lifecycle

1. **The UI collects credentials.** [`web/src/auth/Login.tsx`](./web/src/auth/Login.tsx) submits the email and password as JSON to `POST /api/auth/login` using the shared API helper. The password field uses the browser's `current-password` autocomplete value.
2. **The browser sends same-origin cookies.** [`web/src/lib/api.ts`](./web/src/lib/api.ts) sets `credentials: "same-origin"` on API fetches, so the session cookie is included on same-origin requests. It adds `Content-Type: application/json` when a request has a body.
3. **The login endpoint applies a request limit and validates input.** [`server/src/routes/post-api-auth-login.ts`](./server/src/routes/post-api-auth-login.ts) applies `loginLimiter` before the handler. [`server/src/routes/login-limiter.ts`](./server/src/routes/login-limiter.ts) configures a limit of 10 requests per 15-minute window. [`server/src/validation/auth.ts`](./server/src/validation/auth.ts) requires an email-shaped string up to 254 characters and a non-empty password up to 200 characters.
4. **The server looks up and verifies the account.** The submitted email is lowercased, then looked up using a parameterized SQL query against `users`. The stored password hash is checked with `bcrypt.compare`; plaintext passwords are not stored. A missing account and an incorrect password both return `401` with `{"error":"Incorrect email or password"}`.
5. **The session is replaced and saved.** After valid credentials, the handler calls `req.session.regenerate()` before setting `userId` and `email`. Regenerating the session ID on login helps prevent session fixation. It explicitly saves the session before returning success, so the browser receives a session that the server has persisted.
6. **The UI treats the returned email as the signed-in identity.** A successful response contains the email and may also contain a `payassureError` (see [PayAssure integration authentication](#payassure-integration-authentication)). The React app stores the email in component state and renders the authenticated POS; the email in React is display/application state, not the credential that protects API calls.

Invalid request shape returns `400` with `{"error":"Enter a valid email and password"}`. Login failures return `401`. Failures while querying the database, regenerating the session, or saving it are forwarded to Express error handling rather than being reported as a successful login.

## Session and cookie configuration

The session middleware is configured in [`server/src/index.ts`](./server/src/index.ts):

| Setting | Current behavior |
|---|---|
| Session store | PostgreSQL through `connect-pg-simple`, using the application's shared `pg` pool and the `user_sessions` table. The store is configured to create the table if it does not exist. |
| Session contents | `userId` and `email`, typed by the `express-session` module augmentation in [`server/src/auth.ts`](./server/src/auth.ts). |
| Cookie name | Express Session's default, `connect.sid`; the cookie carries the signed session identifier, not the user's password or the session fields. |
| Cookie flags | `httpOnly: true`, `sameSite: "lax"`, and `secure: true` when `NODE_ENV` is exactly `"production"` (otherwise `false`). |
| Cookie lifetime | `maxAge` is 8 hours. |
| Session secret | `SESSION_SECRET` is required at startup and must have at least 32 characters. |
| Session save policy | `resave: false` and `saveUninitialized: false`. |
| Reverse proxy | Express trusts one proxy hop in production (`app.set("trust proxy", 1)`) before session middleware is installed. |

The `httpOnly` flag prevents browser JavaScript from reading the session cookie. `sameSite: "lax"` limits cross-site cookie sending while allowing normal same-site navigation behavior. In production, the `secure` flag means browsers should only send the cookie over HTTPS. The secret signs the cookie/session identifier; it is not the database password or a token sent in API JSON.

In production behind Render's HTTPS-terminating reverse proxy, Express must recognize the original request as secure so the secure cookie is issued correctly. The app trusts one proxy hop before setting up the session middleware. Keep this count aligned with the actual hosting topology; do not disable secure cookies to work around proxy configuration.

Keep `SESSION_SECRET` stable across application instances and restarts if existing sessions or encrypted PayAssure tokens are expected to remain valid. Rotating it invalidates cookies signed with the previous secret and prevents decrypting stored PayAssure tokens until the server successfully obtains and stores a fresh PayAssure session. Configure the same value on every instance that shares the database. Use a high-entropy secret, do not put it in source control, and configure it wherever the application runs. The README requires `DATABASE_URL` and `SESSION_SECRET` for operation.

### Optional production session diagnostics

Set `SESSION_DIAGNOSTICS=true` temporarily in the hosting environment to log limited session state for requests to the auth, product, batch, supplier, dashboard, sales, and PayAssure API paths. The middleware runs after Express session loading and before route handlers. It records only the HTTP method, request path, whether Express considers the request secure, and booleans indicating whether a session, session ID, and authenticated `userId` are present. It never logs cookie values, session IDs, secrets, passwords, database credentials, or the complete session object. Disable the flag after troubleshooting by unsetting it or setting it to any value other than `"true"`.

For temporary PayAssure retailer float-balance diagnostics, set `PAYASSURE_DEBUG=true`. The balance flow logs start/completion/failure around configuration loading, session authentication, endpoint URL construction, the float request, the outbound HTTP fetch, and response parsing, correlated by a generated flow ID. Failures include sanitized error name, message, stack, cause, status, and code when available. Known credentials, session tokens, authorization values, and sensitive environment values are redacted. Authentication and float HTTP calls each retain their 15-second timeout; timeout logs identify which stage timed out. Disable the flag after troubleshooting.

## How protected requests are checked

[`requireAuth`](./server/src/auth.ts) is an Express middleware. It checks whether `req.session.userId` is truthy. If it is absent or falsy, the middleware ends the request with `401` and `{"error":"Authentication required"}`; otherwise it calls `next()` and the endpoint handler runs.

The middleware does not read an `Authorization` header, validate a JWT, query the user table, check the password again, or enforce roles. The session store is responsible for looking up the server-side session from the cookie before route middleware runs. Route handlers generally rely on the middleware as their authentication gate.

### Routes behind `requireAuth`

The route modules are registered by [`server/src/routes/index.ts`](./server/src/routes/index.ts). The following APIs currently use `requireAuth`:

- **Session identity:** `GET /api/auth/me`, which returns the session email; `POST /api/auth/logout`.
- **Suppliers:** `GET /api/suppliers`, `POST /api/suppliers`.
- **Products:** `GET /api/products`, `POST /api/products`, `PATCH /api/products/:id`, `PATCH /api/products/:id/buying-price`.
- **Batches and stock:** `GET /api/batches`, `POST /api/batches/:id/stock`, `PATCH /api/batches/:id/stock`, `PATCH /api/batches/:id/expiry`.
- **POS and sales:** `GET /api/dashboard`, `GET /api/sales`, `POST /api/checkout`, `GET /api/checkout/:reference/status`.
- **PayAssure-facing POS APIs:** `GET` and `PATCH /api/payassure/me`, `GET /api/payassure/suppliers`, `GET /api/payassure/float`, `POST /api/payassure/float/balance`, `POST /api/payassure/float/deposits`, and `POST /api/payassure/settlements/:id/retry`.

These are session-gated, not role-gated: every authenticated POS user has the same route-level access in the current implementation.

### Public or separately authenticated routes

- `POST /api/auth/login` is deliberately reachable without a session and is rate-limited.
- `GET /api/health` is public and reports whether the database query succeeds.
- `POST /webhook` does not use a staff session. It is an external PayAssure callback and is checked through webhook signature/timestamp verification in [`server/src/services/webhook-verification.ts`](./server/src/services/webhook-verification.ts). It is a separate authentication mechanism from staff login.
- The frontend route/rendering choice is not an API access control. Actual access to protected data/actions is enforced by server middleware.

## Session restoration, sign-out, and expiration

When the React app starts, [`web/src/app/useSession.ts`](./web/src/app/useSession.ts) requests `GET /api/auth/me`. A successful response sets the displayed email and allows the authenticated POS to render. A failed request sets the browser-side email to `null` and shows the login page. The loading state remains until this initial request completes.

Sign-out is initiated by [`web/src/app/AuthenticatedApp.tsx`](./web/src/app/AuthenticatedApp.tsx), which posts to `POST /api/auth/logout`. The server requires an existing session, destroys it in the session store, clears the `connect.sid` cookie, then responds with `204 No Content`. The browser only switches to the logged-out view after that request succeeds; an error is surfaced to the user.

The configured cookie `maxAge` is eight hours. Expired, missing, or otherwise unavailable sessions do not satisfy `requireAuth`, so protected endpoints return `401`. There is no separate refresh-token or "remember me" flow for POS staff sessions.

## Account creation and password storage

There is no public registration or password-reset endpoint in the current route set. Accounts are provisioned privately with `npm run user:create`, implemented by [`server/src/create-user.ts`](./server/src/create-user.ts):

- `POS_USER_EMAIL` and `POS_USER_PASSWORD` must be supplied through the environment.
- The account email is trimmed and lowercased before insertion.
- Passwords must be at least 12 characters, except disposable accounts on a local development database may use at least 8 characters when `NODE_ENV=development`.
- Passwords are hashed with `bcryptjs` using cost factor 12 before insertion into the `users.password_hash` column.
- `users.email` is unique; the schema is defined in [`server/schema/schema-01.sql`](./server/schema/schema-01.sql).
- The provisioning command does not print the password and closes its database pool after completion.

Use the provisioned account process rather than placing credentials in frontend code, source files, or browser storage. The UI keeps the authenticated email in memory; it does not persist the password or an access token in local storage.

## Login rate limiting

The login route is limited to 10 requests in each 15-minute window by `express-rate-limit`. No custom/shared limiter store is configured in [`server/src/routes/login-limiter.ts`](./server/src/routes/login-limiter.ts), so the package's default in-process store is used. Treat this as a per-process limit, not a centralized account-level lockout policy, especially in multi-instance/serverless deployments. The code does not configure progressive delays, account lockout, or a distributed rate-limit store.

## PayAssure integration authentication

PayAssure's credentials are distinct from a staff member's POS credentials:

- Server environment configuration supplies the PayAssure identifier/password. These are not accepted from the browser as POS login credentials.
- After successful POS password verification, if PayAssure is configured, the login handler attempts to refresh or establish the server's PayAssure session and register the webhook URL. This occurs before the POS session is regenerated and saved.
- If that integration step fails, the error is included as `payassureError` in the otherwise successful POS login response. The staff user can still sign in; the UI displays a PayAssure sign-in warning.
- PayAssure access/refresh tokens are stored separately in the singleton `payassure_tokens` row. [`server/src/payassure-token-store.ts`](./server/src/payassure-token-store.ts) refreshes existing tokens and falls back to PayAssure login when the refresh token is rejected with HTTP 401.
- [`server/src/payassure-crypto.ts`](./server/src/payassure-crypto.ts) encrypts those tokens with AES-256-GCM. The encryption key is derived from `SESSION_SECRET`; changing that secret also prevents decrypting previously stored PayAssure tokens. If stored tokens cannot be decrypted, the server obtains a fresh PayAssure session and replaces the stored values only after login succeeds.

This integration session is server-wide rather than one PayAssure session per POS user. Do not confuse it with the `connect.sid` cookie or use it as proof of staff authentication.

## Deployment and configuration

The Express application installs JSON parsing and the session middleware before registering API routes. Netlify forwards `/api/*` to the serverless function in [`netlify.toml`](./netlify.toml); [`netlify/functions/api.ts`](./netlify/functions/api.ts) adapts Express and initializes the database. Configure `DATABASE_URL` and `SESSION_SECRET` in the hosting environment. Production deployments should use HTTPS so secure session cookies can be sent by browsers. Local development uses the Vite `/api` proxy configured in [`web/vite.config.ts`](./web/vite.config.ts), keeping browser calls same-origin from the frontend's point of view.

## Current boundaries and omissions

The following describe the present implementation, rather than a promise that these controls exist:

- There are no user roles, per-endpoint permissions, or separate admin/staff authorization levels.
- `requireAuth` checks only for a truthy `userId` in the session. It does not re-read the user row on every request or provide a user-disable/revocation check beyond destroying/expiring sessions.
- There is no public registration, password-reset, password-change, or MFA flow.
- There is no JWT/bearer-token API authentication.
- No explicit CSRF token mechanism is configured. The session cookie uses `sameSite: "lax"` and the browser calls the same-origin API, but this should not be described as a CSRF-token implementation.
- Login throttling uses the default per-process limiter store rather than shared storage across application instances.
- A session remains subject to the eight-hour cookie lifetime; the browser's displayed React state is not itself authoritative and cannot bypass a server-side `401`.

When changing authentication behavior, keep the frontend session bootstrap and sign-out flow aligned with the server routes, and ensure every protected API route includes `requireAuth` (or an explicitly documented alternative such as the verified webhook signature).
