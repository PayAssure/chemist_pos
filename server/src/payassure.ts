import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { PoolClient } from "pg";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";
import { pool } from "./db";

const payassureAgent = new Agent({ connect: buildConnector({ family: 4, port: 443 }) });

function fetchPayassure(
  url: string,
  init: UndiciRequestInit,
): Promise<UndiciResponse> {
  return undiciFetch(url, { ...init, dispatcher: payassureAgent });
}

type PayassureTokens = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

type PayassureConfig = {
  baseUrl: string;
  identifier: string;
  password: string;
};

export type PayassureSettlementPayload = {
  merchantId: string;
  merchantTransactionReference: string;
  amount: number;
  currency: "KES";
  payment: {
    methods: Array<
      | { type: "CASH"; amount: number }
      | { type: "MPESA"; amount: number; phoneNumber: string }
    >;
  };
  items: Array<{
    supplierMerchantId: string;
    itemReference: string;
    supplierAmount: number;
    retailerAmount: number;
  }>;
  metadata: { posSaleId: string };
};

export class PayassureHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function safeEndpoint(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

function maskIdentifier(identifier: string): string {
  const separator = identifier.lastIndexOf("@");
  if (separator > 0) {
    return `${identifier[0]}***${identifier.slice(separator)}`;
  }
  return `${identifier.slice(0, 2)}***`;
}

function responseSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { format: Array.isArray(value) ? "array" : typeof value };
  }
  const body = value as Record<string, unknown>;
  return {
    keys: Object.keys(body),
    ...(typeof body.message === "string" ? { message: body.message } : {}),
    ...(typeof body.profileComplete === "boolean"
      ? { profileComplete: body.profileComplete }
      : {}),
  };
}

function transportErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  let current = error;
  let depth = 0;
  while (current && depth < 4) {
    if (current instanceof Error) {
      const errorWithCode = current as Error & { code?: string; cause?: unknown };
      details[`error${depth || ""}`] = {
        name: current.name,
        message: current.message,
        ...(errorWithCode.code ? { code: errorWithCode.code } : {}),
      };
      current = errorWithCode.cause;
    } else {
      details[`cause${depth || ""}`] = String(current);
      break;
    }
    depth += 1;
  }
  return details;
}

function responseMetadata(response: UndiciResponse, body: unknown): Record<string, unknown> {
  const requestId =
    response.headers.get("x-request-id") ?? response.headers.get("request-id");
  return {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    ...(requestId ? { providerRequestId: requestId } : {}),
    body: responseSummary(body),
  };
}

function getConfig(): PayassureConfig {
  const { PAYASSURE_API_BASE_URL, PAYASSURE_IDENTIFIER, PAYASSURE_PASSWORD } = process.env;
  if (!PAYASSURE_API_BASE_URL || !PAYASSURE_IDENTIFIER || !PAYASSURE_PASSWORD) {
    throw new Error("PayAssure API credentials are not configured on the server");
  }
  return {
    baseUrl: PAYASSURE_API_BASE_URL.replace(/\/+$/, ""),
    identifier: PAYASSURE_IDENTIFIER,
    password: PAYASSURE_PASSWORD,
  };
}

export function isPayassureConfigured(): boolean {
  return Boolean(
    process.env.PAYASSURE_API_BASE_URL &&
      process.env.PAYASSURE_IDENTIFIER &&
      process.env.PAYASSURE_PASSWORD,
  );
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to protect PayAssure tokens");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(":");
}

function decrypt(value: string | null): string | null {
  if (!value) return null;
  const [iv, authTag, encrypted] = value.split(":").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

async function requestJson<T>(
  operation: "login" | "refresh",
  url: string,
  init: UndiciRequestInit,
  safePayload: Record<string, unknown>,
): Promise<T> {
  const requestId = randomUUID();
  const method = init.method ?? "GET";
  console.info("[PayAssure] Sending request", {
    requestId,
    operation,
    method,
    url: safeEndpoint(url),
    payload: safePayload,
  });
  let response: UndiciResponse;
  try {
    response = await fetchPayassure(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch (error) {
    console.error("[PayAssure] Request failed before receiving an HTTP response", {
      requestId,
      operation,
      method,
      url: safeEndpoint(url),
      ...transportErrorDetails(error),
    });
    throw error;
  }
  const body = await response.json().catch(() => null) as
    | (T & { message?: string; accessToken?: string; refreshToken?: string })
    | null;
  const metadata = responseMetadata(response, body);
  console.info("[PayAssure] Received response", { requestId, operation, ...metadata });
  if (!response.ok) {
    console.error("[PayAssure] Request returned an error", { requestId, operation, ...metadata });
    throw new PayassureHttpError(
      response.status,
      body?.message ?? `PayAssure request failed (${response.status})`,
    );
  }
  if (!body) throw new Error("PayAssure returned an empty response");
  return body as T;
}

async function login(config: PayassureConfig): Promise<PayassureTokens> {
  const body = await requestJson<{
    accessToken: string;
    refreshToken: string;
    user?: { id?: string };
  }>("login", `${config.baseUrl}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ identifier: config.identifier, password: config.password }),
  }, {
    identifier: maskIdentifier(config.identifier),
    password: "[REDACTED]",
  });
  if (!body.accessToken || !body.refreshToken || !body.user?.id) {
    throw new Error("PayAssure login did not return tokens and a user ID");
  }
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, userId: body.user.id };
}

async function refresh(
  config: PayassureConfig,
  refreshToken: string,
  previousUserId: string,
): Promise<PayassureTokens> {
  const body = await requestJson<{
    accessToken: string;
    refreshToken: string;
    user?: { id?: string };
  }>("refresh", `${config.baseUrl}/auth/refresh`, {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }, { refreshToken: "[REDACTED]" });
  if (!body.accessToken || !body.refreshToken) {
    throw new Error("PayAssure refresh did not return both tokens");
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user?.id ?? previousUserId,
  };
}

async function readStoredTokens(client: PoolClient): Promise<PayassureTokens | null> {
  await client.query(
    `INSERT INTO payassure_tokens (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );
  const result = await client.query<{
    access_token: string | null;
    refresh_token: string | null;
    user_id: string | null;
  }>("SELECT access_token, refresh_token, user_id FROM payassure_tokens WHERE id = 1 FOR UPDATE");
  try {
    const accessToken = decrypt(result.rows[0]?.access_token ?? null);
    const refreshToken = decrypt(result.rows[0]?.refresh_token ?? null);
    const userId = result.rows[0]?.user_id;
    return accessToken && refreshToken && userId
      ? { accessToken, refreshToken, userId }
      : null;
  } catch {
    return null;
  }
}

async function storeTokens(client: PoolClient, tokens: PayassureTokens): Promise<void> {
  await client.query(
    `UPDATE payassure_tokens
      SET access_token = $1, refresh_token = $2, user_id = $3, updated_at = NOW()
     WHERE id = 1`,
        [encrypt(tokens.accessToken), encrypt(tokens.refreshToken), tokens.userId],
  );
}

export async function refreshPayassureSession(): Promise<void> {
  const config = getConfig();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stored = await readStoredTokens(client);
    let tokens: PayassureTokens;
    if (stored) {
      try {
        tokens = await refresh(config, stored.refreshToken, stored.userId);
      } catch (error) {
        if (!(error instanceof PayassureHttpError) || error.status !== 401) throw error;
        tokens = await login(config);
      }
    } else {
      tokens = await login(config);
    }
    await storeTokens(client, tokens);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function currentPayassureSession(): Promise<PayassureTokens> {
  const result = await pool.query<{ access_token: string | null; user_id: string | null }>(
    "SELECT access_token, user_id FROM payassure_tokens WHERE id = 1",
  );
  const token = decrypt(result.rows[0]?.access_token ?? null);
  const userId = result.rows[0]?.user_id;
  if (token && userId) {
    const stored = await pool.query<{ refresh_token: string | null }>(
      "SELECT refresh_token FROM payassure_tokens WHERE id = 1",
    );
    const refreshToken = decrypt(stored.rows[0]?.refresh_token ?? null);
    if (refreshToken) return { accessToken: token, refreshToken, userId };
  }
  await refreshPayassureSession();
  return currentPayassureSession();
}

async function requestParticipant(
  method: "GET" | "PATCH",
  update?: Record<string, unknown>,
  endpoint = "/onbordings/me",
): Promise<unknown> {
  const config = getConfig();
  let session = await currentPayassureSession();
  const participantUrl = `${config.baseUrl}${endpoint}`;
  async function fetchParticipant(): Promise<UndiciResponse> {
    const requestId = randomUUID();
    console.info("[PayAssure] Sending request", {
      requestId,
      operation: method === "GET" ? "participant" : "participant-update",
      method,
      url: safeEndpoint(participantUrl),
      authorization: "Bearer [REDACTED]",
      ...(update
        ? {
            updatedFields: Object.keys(update),
            paymentFields:
              update.payment && typeof update.payment === "object"
                ? Object.keys(update.payment)
                : [],
          }
        : {}),
    });
    try {
      const participantResponse = await fetchPayassure(participantUrl, {
        method,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...(update ? { "Content-Type": "application/json" } : {}),
        },
        ...(update ? { body: JSON.stringify(update) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      console.info("[PayAssure] Received response", {
        requestId,
        operation: method === "GET" ? "participant" : "participant-update",
        status: participantResponse.status,
        statusText: participantResponse.statusText,
        contentType: participantResponse.headers.get("content-type"),
        providerRequestId:
          participantResponse.headers.get("x-request-id") ??
          participantResponse.headers.get("request-id"),
      });
      return participantResponse;
    } catch (error) {
      console.error("[PayAssure] Request failed before receiving an HTTP response", {
        requestId,
        operation: method === "GET" ? "participant" : "participant-update",
        method,
        url: safeEndpoint(participantUrl),
        ...transportErrorDetails(error),
      });
      throw error;
    }
  }

  let response = await fetchParticipant();
  if (response.status === 401) {
    await refreshPayassureSession();
    session = await currentPayassureSession();
    response = await fetchParticipant();
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message;
    console.error("[PayAssure] Participant request returned an error", {
      operation: method === "GET" ? "participant" : "participant-update",
      status: response.status,
      response: responseSummary(body),
    });
    throw new PayassureHttpError(
      response.status,
      message ?? `PayAssure request failed (${response.status})`,
    );
  }
  console.info("[PayAssure] Participant data received", {
    operation: method === "GET" ? "participant" : "participant-update",
    response: responseSummary(body),
    recordCount: Array.isArray(body) ? body.length : body ? 1 : 0,
  });
  return body;
}

export function getPayassureParticipant(): Promise<unknown> {
  return requestParticipant("GET");
}

export function getPayassureWebhookUrl(): string | null {
  const configuredUrl = process.env.PAYASSURE_WEBHOOK_URL?.trim();
  if (!configuredUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error("PAYASSURE_WEBHOOK_URL must be an absolute HTTPS URL ending in /webhook");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/webhook"
  ) {
    throw new Error("PAYASSURE_WEBHOOK_URL must be an absolute HTTPS URL ending in /webhook");
  }
  return parsed.toString().replace(/\/$/, "");
}

let registeredPayassureWebhookUrl: string | null = null;

export function getRegisteredPayassureWebhookUrl(): string | null {
  return registeredPayassureWebhookUrl;
}

export async function registerPayassureWebhookUrl(): Promise<void> {
  registeredPayassureWebhookUrl = null;
  const fallbackWebhookUrl = getPayassureWebhookUrl();
  const participantValue = await getPayassureParticipant();
  const participant = Array.isArray(participantValue) ? participantValue[0] : participantValue;
  if (!participant || typeof participant !== "object") {
    throw new Error("PayAssure retailer profile is unavailable for webhook registration");
  }
  const participantId = (participant as Record<string, unknown>).id;
  if (typeof participantId !== "string" || !participantId) {
    throw new Error("PayAssure retailer profile did not include a participant ID");
  }
  const participantRecord = participant as Record<string, unknown>;
  const integration = participantRecord.integration;
  const integrationDetails =
    integration && typeof integration === "object"
      ? integration as Record<string, unknown>
      : null;
  const participantWebhookUrl =
    typeof participantRecord.webhookUrl === "string" && participantRecord.webhookUrl.trim()
      ? participantRecord.webhookUrl.trim()
      : null;
  const integrationWebhookUrl =
    typeof integrationDetails?.webhookUrl === "string" && integrationDetails.webhookUrl.trim()
      ? integrationDetails.webhookUrl.trim()
      : null;

  if (integrationDetails) {
    const details = integrationDetails;
    if (
      typeof details.merchantId === "string" &&
      typeof details.apiSecret === "string" &&
      details.apiSecret
    ) {
      await storePayassureWebhookSecret(details.merchantId, details.apiSecret);
    }
  }

  if (fallbackWebhookUrl) {
    console.info("[PayAssure] Registering participant fallback webhook endpoint", {
      endpoint: safeEndpoint(fallbackWebhookUrl),
      status: "registering",
    });
    try {
      await requestParticipant(
        "PATCH",
        { webhookUrl: fallbackWebhookUrl },
        `/onbordings/${encodeURIComponent(participantId)}/webhook`,
      );
    } catch (error) {
      console.error("[PayAssure] Participant fallback webhook registration failed", {
        endpoint: safeEndpoint(fallbackWebhookUrl),
        status: "failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
    console.info("[PayAssure] Participant fallback webhook endpoint registered", {
      endpoint: safeEndpoint(fallbackWebhookUrl),
      status: "registered",
    });
  }

  const participantFallbackUrl = fallbackWebhookUrl ?? participantWebhookUrl;
  const effectiveUrl = integrationWebhookUrl ?? participantFallbackUrl;
  if (!effectiveUrl) {
    console.error("[PayAssure] No effective webhook endpoint is configured", {
      status: "not_configured",
    });
    throw new Error(
      "Configure PAYASSURE_WEBHOOK_URL or set a PayAssure participant/integration webhook URL before checkout",
    );
  }

  let parsedEffectiveUrl: URL;
  try {
    parsedEffectiveUrl = new URL(effectiveUrl);
  } catch {
    throw new Error("The effective PayAssure webhook URL is invalid");
  }
  if (
    parsedEffectiveUrl.protocol !== "https:" ||
    parsedEffectiveUrl.username ||
    parsedEffectiveUrl.password ||
    parsedEffectiveUrl.search ||
    parsedEffectiveUrl.hash ||
    parsedEffectiveUrl.pathname !== "/webhook"
  ) {
    throw new Error("The effective PayAssure webhook URL must be HTTPS and end in /webhook");
  }
  const normalizedEffectiveUrl = parsedEffectiveUrl.toString().replace(/\/$/, "");
  if (
    integrationWebhookUrl &&
    participantFallbackUrl &&
    normalizedEffectiveUrl !== participantFallbackUrl
  ) {
    console.error("[PayAssure] Integration webhook URL overrides the participant fallback", {
      fallbackEndpoint: safeEndpoint(participantFallbackUrl),
      effectiveEndpoint: safeEndpoint(normalizedEffectiveUrl),
      status: "endpoint_mismatch",
    });
    throw new Error(
      "The integration-specific PayAssure webhook URL overrides the participant fallback and must point to the same receiver",
    );
  }

  registeredPayassureWebhookUrl = normalizedEffectiveUrl;
  console.info("[PayAssure] Effective webhook endpoint selected", {
    endpoint: safeEndpoint(normalizedEffectiveUrl),
    source: integrationWebhookUrl
      ? "integration"
      : fallbackWebhookUrl
        ? "participant_fallback"
        : "existing_participant",
    status: "ready",
  });
}

const webhookSecretCache = new Map<string, { secret: string; expiresAt: number }>();

async function storePayassureWebhookSecret(merchantId: string, secret: string): Promise<void> {
  await pool.query(
    `INSERT INTO payassure_webhook_credentials (recipient_merchant_id, encrypted_api_secret)
     VALUES ($1, $2)
     ON CONFLICT (recipient_merchant_id) DO UPDATE
       SET encrypted_api_secret = EXCLUDED.encrypted_api_secret, updated_at = NOW()`,
    [merchantId, encrypt(secret)],
  );
  webhookSecretCache.set(merchantId, {
    secret,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export async function getPayassureWebhookSecret(merchantId: string): Promise<string | null> {
  const cached = webhookSecretCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) return cached.secret;

  const stored = await pool.query<{ encrypted_api_secret: string }>(
    `SELECT encrypted_api_secret
     FROM payassure_webhook_credentials
     WHERE recipient_merchant_id = $1`,
    [merchantId],
  );
  if (stored.rows[0]) {
    try {
      const secret = decrypt(stored.rows[0].encrypted_api_secret);
      if (secret) {
        webhookSecretCache.set(merchantId, {
          secret,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
        return secret;
      }
    } catch {
      // Re-read and replace an unreadable stored credential from PayAssure below.
    }
  }

  const participantValue = await getPayassureParticipant();
  const participant = Array.isArray(participantValue) ? participantValue[0] : participantValue;
  if (!participant || typeof participant !== "object") return null;
  const integration = (participant as Record<string, unknown>).integration;
  if (!integration || typeof integration !== "object") return null;
  const details = integration as Record<string, unknown>;
  if (details.merchantId !== merchantId || typeof details.apiSecret !== "string" || !details.apiSecret) {
    return null;
  }

  await storePayassureWebhookSecret(merchantId, details.apiSecret);
  return details.apiSecret;
}

export function updatePayassureParticipant(
  update: Record<string, unknown>,
): Promise<unknown> {
  return requestParticipant("PATCH", update);
}

export async function getPayassureSupplierDirectory(): Promise<unknown> {
  const config = getConfig();
  let session = await currentPayassureSession();
  const supplierDirectoryUrl = `${config.baseUrl}/supplier/directory`;

  async function fetchDirectory(): Promise<UndiciResponse> {
    const requestId = randomUUID();
    console.info("[PayAssure] Sending request", {
      requestId,
      operation: "supplier-directory",
      method: "GET",
      url: safeEndpoint(supplierDirectoryUrl),
      authorization: "******",
    });
    try {
      const response = await fetchPayassure(supplierDirectoryUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      console.info("[PayAssure] Received response", {
        requestId,
        operation: "supplier-directory",
        ...responseMetadata(response, null),
      });
      return response;
    } catch (error) {
      console.error("[PayAssure] Request failed before receiving an HTTP response", {
        requestId,
        operation: "supplier-directory",
        method: "GET",
        url: safeEndpoint(supplierDirectoryUrl),
        ...transportErrorDetails(error),
      });
      throw error;
    }
  }

  let response = await fetchDirectory();
  if (response.status === 401) {
    await refreshPayassureSession();
    session = await currentPayassureSession();
    response = await fetchDirectory();
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message;
    console.error("[PayAssure] Supplier directory request returned an error", {
      status: response.status,
      response: responseSummary(body),
    });
    throw new PayassureHttpError(
      response.status,
      message ?? `PayAssure supplier directory request failed (${response.status})`,
    );
  }
  console.info("[PayAssure] Supplier directory data received", {
    response: responseSummary(body),
    recordCount:
      body && typeof body === "object" && "suppliers" in body && Array.isArray(body.suppliers)
        ? body.suppliers.length
        : 0,
  });
  return body;
}

async function requestRetailerFloat(
  operation: "retailer-float" | "retailer-float-balance" | "retailer-float-deposit",
  method: "GET" | "POST",
  endpoint: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  const config = getConfig();
  let session = await currentPayassureSession();
  const endpointUrl = `${config.baseUrl}${endpoint}`;

  async function fetchFloat(): Promise<UndiciResponse> {
    const requestId = randomUUID();
    console.info("[PayAssure] Sending request", {
      requestId,
      operation,
      method,
      url: safeEndpoint(endpointUrl),
      authorization: "******",
      ...(payload
        ? {
            payload: {
              ...payload,
              ...(typeof payload.payerPhoneNumber === "string"
                ? { payerPhoneNumber: "[REDACTED]" }
                : {}),
            },
          }
        : {}),
    });
    try {
      const response = await fetchPayassure(endpointUrl, {
        method,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      console.info("[PayAssure] Received response", {
        requestId,
        operation,
        ...responseMetadata(response, null),
      });
      return response;
    } catch (error) {
      console.error("[PayAssure] Request failed before receiving an HTTP response", {
        requestId,
        operation,
        method,
        url: safeEndpoint(endpointUrl),
        ...transportErrorDetails(error),
      });
      throw error;
    }
  }

  let response = await fetchFloat();
  if (response.status === 401) {
    await refreshPayassureSession();
    session = await currentPayassureSession();
    response = await fetchFloat();
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message;
    console.error("[PayAssure] Retailer float request returned an error", {
      operation,
      status: response.status,
      response: responseSummary(body),
    });
    throw new PayassureHttpError(
      response.status,
      message ?? `PayAssure retailer float request failed (${response.status})`,
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("PayAssure retailer float request returned an invalid response");
  }
  console.info("[PayAssure] Retailer float data received", {
    operation,
    response: responseSummary(body),
  });
  return body;
}

export function getPayassureRetailerFloat(): Promise<unknown> {
  return requestRetailerFloat("retailer-float", "GET", "/escrow/retailer/float");
}

export function checkPayassureRetailerFloatBalance(): Promise<unknown> {
  return requestRetailerFloat(
    "retailer-float-balance",
    "POST",
    "/escrow/retailer/float/balance",
  );
}

export function initiatePayassureRetailerFloatDeposit(
  amount: number,
  payerPhoneNumber: string,
): Promise<unknown> {
  return requestRetailerFloat(
    "retailer-float-deposit",
    "POST",
    "/escrow/retailer/float/deposits",
    { amount, payerPhoneNumber },
  );
}

type RetailerIntegrationCredentials = {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
};

function retailerIntegrationCredentials(value: unknown): RetailerIntegrationCredentials {
  const participant = Array.isArray(value) ? value[0] : value;
  if (!participant || typeof participant !== "object") {
    throw new Error("PayAssure retailer profile is unavailable");
  }
  const integration = (participant as Record<string, unknown>).integration;
  if (!integration || typeof integration !== "object") {
    throw new Error("PayAssure retailer integration is unavailable");
  }
  const details = integration as Record<string, unknown>;
  if (details.isActive !== true) {
    throw new Error("PayAssure retailer integration is not active");
  }
  if (
    typeof details.apiKey !== "string" ||
    !details.apiKey ||
    typeof details.apiSecret !== "string" ||
    !details.apiSecret ||
    typeof details.merchantId !== "string" ||
    !details.merchantId
  ) {
    throw new Error("PayAssure retailer integration credentials are incomplete");
  }
  return {
    apiKey: details.apiKey,
    apiSecret: details.apiSecret,
    merchantId: details.merchantId,
  };
}

function settlementErrorMessage(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : "Unknown PayAssure settlement error";
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/("(?:apiKey|apiSecret|token|accessToken|refreshToken)"\s*:\s*")[^"]+/gi, "$1[REDACTED]");
}

async function settlementRequest(
  operation: "retailer-authenticate" | "initiate-settlement",
  url: string,
  accessToken: string,
  body: Record<string, unknown>,
  safePayload: Record<string, unknown>,
  headers: Record<string, string> = {},
  secrets: string[] = [],
): Promise<{ body: Record<string, unknown>; requestId: string }> {
  const requestId = randomUUID();
  console.info("[PayAssure] Sending request", {
    requestId,
    operation,
    method: "POST",
    url: safeEndpoint(url),
    payload: safePayload,
  });

  let response: UndiciResponse;
  try {
    response = await fetchPayassure(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error("[PayAssure] Settlement request failed before receiving an HTTP response", {
      requestId,
      operation,
      method: "POST",
      url: safeEndpoint(url),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw new Error(settlementErrorMessage(error, secrets));
  }

  const responseBody = await response.json().catch(() => null) as unknown;
  const providerRequestId =
    response.headers.get("x-request-id") ?? response.headers.get("request-id");
  const responseKeys =
    responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
      ? Object.keys(responseBody)
      : [];
  console.info("[PayAssure] Received settlement response", {
    requestId,
    operation,
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
    ...(providerRequestId ? { providerRequestId } : {}),
    responseKeys,
  });
  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
        ? (responseBody as Record<string, unknown>).message
        : null;
    const safeMessage = typeof message === "string"
      ? settlementErrorMessage(message, secrets)
      : `PayAssure ${operation} failed (${response.status})`;
    throw new PayassureHttpError(response.status, safeMessage);
  }
  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) {
    throw new Error(`PayAssure ${operation} returned an invalid response`);
  }
  return {
    body: responseBody as Record<string, unknown>,
    requestId: providerRequestId ?? requestId,
  };
}

export async function initiatePayassureSettlement(
  payload: PayassureSettlementPayload,
  onPayloadPrepared: (preparedPayload: PayassureSettlementPayload) => Promise<void>,
): Promise<{ merchantId: string; providerRequestId: string }> {
  const config = getConfig();
  const credentials = retailerIntegrationCredentials(await getPayassureParticipant());
  const preparedPayload = payload.merchantId
    ? payload
    : { ...payload, merchantId: credentials.merchantId };
  await onPayloadPrepared(preparedPayload);
  const platformSession = await currentPayassureSession();
  const authenticateUrl = `${config.baseUrl}/settlement/authenticate`;
  const initiateUrl = `${config.baseUrl}/settlement/initiate-settlement`;
  const safeCredentials = {
    apiKey: "[REDACTED]",
    apiSecret: "[REDACTED]",
  };

  let sessionToken: string;
  try {
    const auth = await settlementRequest(
      "retailer-authenticate",
      authenticateUrl,
      platformSession.accessToken,
      { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret },
      safeCredentials,
      {},
      [credentials.apiKey, credentials.apiSecret, platformSession.accessToken],
    );
    if (typeof auth.body.token !== "string" || !auth.body.token) {
      throw new Error("PayAssure retailer authentication did not return a session token");
    }
    sessionToken = auth.body.token;
  } catch (error) {
    console.error("[PayAssure] Retailer authentication failed", {
      operation: "retailer-authenticate",
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: settlementErrorMessage(error, [
        credentials.apiKey,
        credentials.apiSecret,
        platformSession.accessToken,
      ]),
    });
    throw error;
  }

  try {
    const initiation = await settlementRequest(
      "initiate-settlement",
      initiateUrl,
      platformSession.accessToken,
      preparedPayload,
      {
        merchantId: preparedPayload.merchantId,
        merchantTransactionReference: preparedPayload.merchantTransactionReference,
        amount: preparedPayload.amount,
        currency: preparedPayload.currency,
        paymentMethodTypes: preparedPayload.payment.methods.map(({ type }) => type),
        itemCount: preparedPayload.items.length,
        sessionToken: "[REDACTED]",
      },
      { "x-settlement-session": sessionToken },
      [
        credentials.apiKey,
        credentials.apiSecret,
        platformSession.accessToken,
        sessionToken,
      ],
    );
    console.info("[PayAssure] Settlement initiated", {
      operation: "initiate-settlement",
      merchantTransactionReference: preparedPayload.merchantTransactionReference,
      providerRequestId: initiation.requestId,
      responseKeys: Object.keys(initiation.body),
    });
    return {
      merchantId: credentials.merchantId,
      providerRequestId: initiation.requestId,
    };
  } catch (error) {
    console.error("[PayAssure] Settlement initiation failed", {
      operation: "initiate-settlement",
      merchantTransactionReference: preparedPayload.merchantTransactionReference,
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: settlementErrorMessage(error, [
        credentials.apiKey,
        credentials.apiSecret,
        platformSession.accessToken,
        sessionToken,
      ]),
    });
    throw error;
  }
}