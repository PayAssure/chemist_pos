import type { PayassureConfig } from "./payassure-types";

export function safeEndpoint(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function maskIdentifier(identifier: string): string {
  const separator = identifier.lastIndexOf("@");
  if (separator > 0) {
    return `${identifier[0]}***${identifier.slice(separator)}`;
  }
  return `${identifier.slice(0, 2)}***`;
}

export function getConfig(): PayassureConfig {
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
