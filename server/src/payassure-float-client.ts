import { randomUUID } from "node:crypto";
import { PayassureHttpError } from "./payassure-types";
import { getConfig, safeEndpoint } from "./payassure-config";
import { fetchPayassure, responseMetadata, responseSummary, transportErrorDetails } from "./payassure-transport";
import { currentPayassureSession, refreshPayassureSession } from "./payassure-token-store";
import type { Response as UndiciResponse } from "undici";

export async function requestRetailerFloat(
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
