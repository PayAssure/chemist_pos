import { randomUUID } from "node:crypto";
import type { PayassureConfig, PayassureTokens } from "./payassure-types";
import { maskIdentifier, safeEndpoint } from "./payassure-config";
import { PayassureHttpError } from "./payassure-types";
import { fetchPayassure, responseMetadata, responseSummary, transportErrorDetails } from "./payassure-transport";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";

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

export async function login(config: PayassureConfig): Promise<PayassureTokens> {
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

export async function refresh(
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
