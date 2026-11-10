import { randomUUID } from "node:crypto";
import { PayassureHttpError } from "./payassure-types";
import { safeEndpoint } from "./payassure-config";
import { fetchPayassure } from "./payassure-transport";
import type { Response as UndiciResponse } from "undici";

export function settlementErrorMessage(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : "Unknown PayAssure settlement error";
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/("(?:apiKey|apiSecret|token|accessToken|refreshToken)"\s*:\s*")[^"]+/gi, "$1[REDACTED]");
}

export async function settlementRequest(
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
