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

export function isTimeoutError(error: unknown): boolean {
  let current = error;
  let depth = 0;
  while (current && depth < 4) {
    if (!(current instanceof Error)) return false;
    const errorWithCode = current as Error & { code?: string; cause?: unknown };
    if (
      current.name === "TimeoutError" ||
      current.name === "AbortError" ||
      ["ETIMEDOUT", "ABORT_ERR", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(errorWithCode.code ?? "")
    ) {
      return true;
    }
    current = errorWithCode.cause;
    depth += 1;
  }
  return false;
}

export function safeTransportErrorDetails(
  error: unknown,
  additionalSecrets: string[] = [],
): Record<string, unknown> {
  const knownSecrets = [
    process.env.PAYASSURE_PASSWORD,
    process.env.PAYASSURE_IDENTIFIER,
    process.env.SESSION_SECRET,
    process.env.DATABASE_URL,
    ...additionalSecrets,
  ].filter((value): value is string => Boolean(value));
  const secretsByLength = knownSecrets.sort((left, right) => right.length - left.length);

  function redact(value: string): string {
    let safeValue = value;
    for (const secret of secretsByLength) {
      safeValue = safeValue.split(secret).join("[REDACTED]");
    }
    return safeValue
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(
        /(\b(?:authorization|password|access[_-]?token|refresh[_-]?token|api[_-]?key|api[_-]?secret|secret|encryption[_-]?key)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "$1[REDACTED]",
      );
  }

  function summarize(value: unknown, depth: number): unknown {
    if (depth >= 4 || value === null || value === undefined) return undefined;
    if (typeof value === "string") return redact(value);
    if (typeof value !== "object") return undefined;

    const errorValue = value as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      cause?: unknown;
    };
    const summary: Record<string, unknown> = {};
    if (typeof errorValue.name === "string") summary.name = redact(errorValue.name);
    if (typeof errorValue.message === "string") summary.message = redact(errorValue.message);
    if (typeof errorValue.stack === "string") summary.stack = redact(errorValue.stack);
    if (typeof errorValue.code === "string" || typeof errorValue.code === "number") {
      summary.code = errorValue.code;
    }
    if (typeof errorValue.status === "number") summary.status = errorValue.status;
    if (typeof errorValue.statusCode === "number") summary.statusCode = errorValue.statusCode;
    if (errorValue.cause !== undefined) {
      const cause = summarize(errorValue.cause, depth + 1);
      if (cause !== undefined) summary.cause = cause;
    }
    return Object.keys(summary).length ? summary : { type: typeof value };
  }

  return { error: summarize(error, 0) };
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
