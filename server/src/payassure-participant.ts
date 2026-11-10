import { randomUUID } from "node:crypto";
import { PayassureHttpError } from "./payassure-types";
import { getConfig, safeEndpoint } from "./payassure-config";
import { fetchPayassure, responseSummary, transportErrorDetails } from "./payassure-transport";
import { currentPayassureSession, refreshPayassureSession } from "./payassure-token-store";
import type { Response as UndiciResponse } from "undici";

export async function requestParticipant(
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

export const getPayassureParticipant = (): Promise<unknown> => requestParticipant("GET");

export const updatePayassureParticipant = (
  update: Record<string, unknown>,
): Promise<unknown> => requestParticipant("PATCH", update);
