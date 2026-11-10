import { Agent, buildConnector, fetch as undiciFetch } from "undici";
import type { RequestInit as UndiciRequestInit, Response as UndiciResponse } from "undici";

const payassureAgent = new Agent({ connect: buildConnector({ family: 4, port: 443 }) });

export function fetchPayassure(
  url: string,
  init: UndiciRequestInit,
): Promise<UndiciResponse> {
  return undiciFetch(url, { ...init, dispatcher: payassureAgent });
}

export function responseSummary(value: unknown): Record<string, unknown> {
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

export function transportErrorDetails(error: unknown): Record<string, unknown> {
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

export function responseMetadata(response: UndiciResponse, body: unknown): Record<string, unknown> {
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
