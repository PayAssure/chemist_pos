import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "./db";

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

function responseMetadata(response: Response, body: unknown): Record<string, unknown> {
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
  init: RequestInit,
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
  let response: Response;
  try {
    response = await fetch(url, {
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
): Promise<unknown> {
  const config = getConfig();
  let session = await currentPayassureSession();
  const participantUrl = `${config.baseUrl}/onbordings/me`;
  async function fetchParticipant(): Promise<Response> {
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
      const participantResponse = await fetch(participantUrl, {
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

export function updatePayassureParticipant(
  update: Record<string, unknown>,
): Promise<unknown> {
  return requestParticipant("PATCH", update);
}