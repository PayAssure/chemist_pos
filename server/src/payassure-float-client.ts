import { randomUUID } from "node:crypto";
import { PayassureHttpError } from "./payassure-types";
import { getConfig, safeEndpoint } from "./payassure-config";
import { fetchPayassure, isTimeoutError, responseMetadata, safeTransportErrorDetails } from "./payassure-transport";
import { currentPayassureSession, refreshPayassureSession } from "./payassure-token-store";
import type { Response as UndiciResponse } from "undici";

const FLOAT_REQUEST_TIMEOUT_MS = 15000;
const FLOAT_DIAGNOSTICS_ENABLED = process.env.PAYASSURE_DEBUG === "true";

export async function requestRetailerFloat(
  operation: "retailer-float" | "retailer-float-balance" | "retailer-float-deposit",
  method: "GET" | "POST",
  endpoint: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  const flowId = randomUUID();
  const isBalanceCheck = operation === "retailer-float-balance";
  let config: ReturnType<typeof getConfig> | undefined;
  let endpointUrl = "";
  let session!: Awaited<ReturnType<typeof currentPayassureSession>>;
  let diagnosticSession: Awaited<ReturnType<typeof currentPayassureSession>> | undefined;

  function logFlow(stage: string, phase: string, details: Record<string, unknown> = {}): void {
    if (isBalanceCheck && FLOAT_DIAGNOSTICS_ENABLED) {
      console.info("[PayAssure] Retailer float balance diagnostic", {
        flowId,
        stage,
        phase,
        ...details,
      });
    }
  }

  function diagnosticSecrets(): string[] {
    return [
      config?.password,
      diagnosticSession?.accessToken,
      diagnosticSession?.refreshToken,
    ].filter((value): value is string => Boolean(value));
  }

  async function traceStage<T>(
    stage: string,
    phase: string,
    action: () => T | Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    logFlow(stage, phase, { event: "started" });
    try {
      const result = await action();
      logFlow(stage, phase, { event: "completed", durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      if (isBalanceCheck && FLOAT_DIAGNOSTICS_ENABLED) {
        console.error("[PayAssure] Retailer float diagnostic stage failed", {
          flowId,
          stage,
          phase,
          durationMs: Date.now() - startedAt,
          timeout: isTimeoutError(error),
          ...safeTransportErrorDetails(error, diagnosticSecrets()),
        });
      }
      throw error;
    }
  }

  const resolvedConfig = await traceStage("getConfig", "initial", () => getConfig());
  config = resolvedConfig;
  endpointUrl = await traceStage(
    "construct_endpoint_url",
    "initial",
    () => `${resolvedConfig.baseUrl}${endpoint}`,
  );
  logFlow("construct_endpoint_url", "initial", {
    event: "value_ready",
    url: safeEndpoint(endpointUrl),
  });

  async function authenticate(phase: string, refreshFirst = false) {
    const startedAt = Date.now();
    logFlow("authentication", phase, { event: "started" });
    try {
      if (refreshFirst) {
        await traceStage("refreshPayassureSession", phase, () => refreshPayassureSession());
      }
      const authenticatedSession = await traceStage(
        "currentPayassureSession",
        phase,
        () => currentPayassureSession(),
      );
      diagnosticSession = authenticatedSession;
      logFlow("authentication", phase, {
        event: "completed",
        durationMs: Date.now() - startedAt,
        authenticated: true,
      });
      return authenticatedSession;
    } catch (error) {
      const details = {
        flowId,
        stage: "authentication",
        phase,
        durationMs: Date.now() - startedAt,
        timeout: isTimeoutError(error),
        ...safeTransportErrorDetails(error, diagnosticSecrets()),
      };
      if (isBalanceCheck && FLOAT_DIAGNOSTICS_ENABLED) {
        console.error(
          isTimeoutError(error)
            ? "[PayAssure] Retailer float authentication timed out"
            : "[PayAssure] Retailer float authentication failed",
          details,
        );
      }
      throw error;
    }
  }

  session = await authenticate("initial");

  async function fetchFloat(phase: string): Promise<UndiciResponse> {
    return traceStage("fetchFloat", phase, async () => {
      const requestId = randomUUID();
      const startedAt = Date.now();
      logFlow("fetchFloat", phase, {
        event: "request_started",
        requestId,
        method,
        url: safeEndpoint(endpointUrl),
        timeoutMs: FLOAT_REQUEST_TIMEOUT_MS,
      });
      console.info("[PayAssure] Sending request", {
        requestId,
        ...(isBalanceCheck ? { flowId, phase } : {}),
        operation,
        method,
        url: safeEndpoint(endpointUrl),
        authorization: "[REDACTED]",
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
      const response = await traceStage("fetchPayassure", phase, () =>
        fetchPayassure(endpointUrl, {
          method,
          headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
          ...(payload ? { body: JSON.stringify(payload) } : {}),
          signal: AbortSignal.timeout(FLOAT_REQUEST_TIMEOUT_MS),
        }),
      );
      const responseDetails = {
        requestId,
        ...(isBalanceCheck ? { flowId, phase } : {}),
        operation,
        durationMs: Date.now() - startedAt,
        ...responseMetadata(response, null),
      };
      console.info("[PayAssure] Received response", responseDetails);
      logFlow("fetchFloat", phase, {
        event: "response_received",
        durationMs: Date.now() - startedAt,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      });
      return response;
    });
  }

  let responsePhase = "initial";
  let response = await fetchFloat(responsePhase);
  if (response.status === 401) {
    logFlow("reauthentication", "after_401", {
      event: "started",
      status: response.status,
    });
    session = await authenticate("after_401", true);
    logFlow("reauthentication", "after_401", {
      event: "completed",
      authenticated: true,
    });
    responsePhase = "retry_after_401";
    response = await fetchFloat(responsePhase);
  }

  const body = await traceStage("parse_response_body", responsePhase, () => response.json())
    .catch(() => null);
  const validatedBody = await traceStage("validate_response", responsePhase, () => {
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
    return body;
  });
  console.info("[PayAssure] Retailer float data received", {
    ...(isBalanceCheck ? { flowId } : {}),
    operation,
    responseKeys: Object.keys(validatedBody),
  });
  logFlow("flow", "completed", { status: response.status });
  return validatedBody;
}
