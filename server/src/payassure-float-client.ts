import { randomUUID } from "node:crypto";
import { PayassureHttpError } from "./payassure-types";
import { getConfig, safeEndpoint } from "./payassure-config";
import { fetchPayassure, isTimeoutError, responseMetadata, safeTransportErrorDetails } from "./payassure-transport";
import { currentPayassureSession, refreshPayassureSession } from "./payassure-token-store";
import type { Response as UndiciResponse } from "undici";

const FLOAT_REQUEST_TIMEOUT_MS = 15000;
const FLOAT_DIAGNOSTICS_ENABLED = process.env.PAYASSURE_FLOAT_DIAGNOSTICS === "true";

export async function requestRetailerFloat(
  operation: "retailer-float" | "retailer-float-balance" | "retailer-float-deposit",
  method: "GET" | "POST",
  endpoint: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  const config = getConfig();
  const flowId = randomUUID();
  const endpointUrl = `${config.baseUrl}${endpoint}`;
  const isBalanceCheck = operation === "retailer-float-balance";

  function logFlow(phase: string, details: Record<string, unknown> = {}): void {
    if (isBalanceCheck && FLOAT_DIAGNOSTICS_ENABLED) {
      console.info("[PayAssure] Retailer float balance flow", {
        flowId,
        phase,
        ...details,
      });
    }
  }

  async function authenticate(phase: string, refreshFirst = false) {
    const startedAt = Date.now();
    logFlow("authentication_started", { phase });
    try {
      if (refreshFirst) await refreshPayassureSession();
      const authenticatedSession = await currentPayassureSession();
      logFlow("authentication_completed", {
        phase,
        durationMs: Date.now() - startedAt,
        authenticated: true,
      });
      return authenticatedSession;
    } catch (error) {
      const details = {
        flowId,
        phase,
        durationMs: Date.now() - startedAt,
        ...safeTransportErrorDetails(error),
      };
      if (isTimeoutError(error)) {
        console.error("[PayAssure] Retailer float authentication timed out", details);
      } else {
        logFlow("authentication_failed", details);
      }
      throw error;
    }
  }

  let session = await authenticate("initial");

  async function fetchFloat(phase: string): Promise<UndiciResponse> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    logFlow("float_request_started", {
      phase,
      requestId,
      method,
      url: safeEndpoint(endpointUrl),
    });
    console.info("[PayAssure] Sending request", {
      requestId,
      ...(isBalanceCheck ? { flowId, phase } : {}),
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
        signal: AbortSignal.timeout(FLOAT_REQUEST_TIMEOUT_MS),
      });
      const responseDetails = {
        requestId,
        ...(isBalanceCheck ? { flowId, phase } : {}),
        operation,
        durationMs: Date.now() - startedAt,
        ...responseMetadata(response, null),
      };
      console.info("[PayAssure] Received response", {
        ...responseDetails,
      });
      logFlow("float_response_received", {
        phase,
        durationMs: Date.now() - startedAt,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      });
      return response;
    } catch (error) {
      const errorDetails = {
        requestId,
        ...(isBalanceCheck ? { flowId, phase } : {}),
        operation,
        method,
        url: safeEndpoint(endpointUrl),
        timeoutMs: FLOAT_REQUEST_TIMEOUT_MS,
        durationMs: Date.now() - startedAt,
        ...safeTransportErrorDetails(error),
      };
      if (isTimeoutError(error)) {
        console.error(
          isBalanceCheck
            ? "[PayAssure] Retailer float balance request timed out"
            : "[PayAssure] Retailer float request timed out",
          errorDetails,
        );
      } else {
        console.error("[PayAssure] Request failed before receiving an HTTP response", errorDetails);
      }
      logFlow("float_request_failed", {
        phase,
        durationMs: Date.now() - startedAt,
        timedOut: isTimeoutError(error),
        ...safeTransportErrorDetails(error),
      });
      throw error;
    }
  }

  let response = await fetchFloat("initial");
  if (response.status === 401) {
    logFlow("reauthentication_after_401_started", { status: response.status });
    session = await authenticate("after_401", true);
    logFlow("reauthentication_after_401_completed", { authenticated: true });
    response = await fetchFloat("retry_after_401");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message;
    console.error("[PayAssure] Retailer float request returned an error", {
      ...(isBalanceCheck ? { flowId } : {}),
      operation,
      status: response.status,
      responseFormat: Array.isArray(body) ? "array" : typeof body,
      responseKeys:
        body && typeof body === "object" && !Array.isArray(body)
          ? Object.keys(body)
          : [],
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
    ...(isBalanceCheck ? { flowId } : {}),
    operation,
    responseKeys: Object.keys(body),
  });
  logFlow("flow_completed", { status: response.status });
  return body;
}
