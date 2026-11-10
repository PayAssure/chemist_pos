import { randomUUID } from "node:crypto";
import { PayassureHttpError } from "./payassure-types";
import { getConfig, safeEndpoint } from "./payassure-config";
import { fetchPayassure, responseMetadata, responseSummary, transportErrorDetails } from "./payassure-transport";
import { currentPayassureSession, refreshPayassureSession } from "./payassure-token-store";
import type { Response as UndiciResponse } from "undici";

export async function getPayassureSupplierDirectory(): Promise<unknown> {
  const config = getConfig();
  let session = await currentPayassureSession();
  const supplierDirectoryUrl = `${config.baseUrl}/supplier/directory`;

  async function fetchDirectory(): Promise<UndiciResponse> {
    const requestId = randomUUID();
    console.info("[PayAssure] Sending request", {
      requestId,
      operation: "supplier-directory",
      method: "GET",
      url: safeEndpoint(supplierDirectoryUrl),
      authorization: "******",
    });
    try {
      const response = await fetchPayassure(supplierDirectoryUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      console.info("[PayAssure] Received response", {
        requestId,
        operation: "supplier-directory",
        ...responseMetadata(response, null),
      });
      return response;
    } catch (error) {
      console.error("[PayAssure] Request failed before receiving an HTTP response", {
        requestId,
        operation: "supplier-directory",
        method: "GET",
        url: safeEndpoint(supplierDirectoryUrl),
        ...transportErrorDetails(error),
      });
      throw error;
    }
  }

  let response = await fetchDirectory();
  if (response.status === 401) {
    await refreshPayassureSession();
    session = await currentPayassureSession();
    response = await fetchDirectory();
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message;
    console.error("[PayAssure] Supplier directory request returned an error", {
      status: response.status,
      response: responseSummary(body),
    });
    throw new PayassureHttpError(
      response.status,
      message ?? `PayAssure supplier directory request failed (${response.status})`,
    );
  }
  console.info("[PayAssure] Supplier directory data received", {
    response: responseSummary(body),
    recordCount:
      body && typeof body === "object" && "suppliers" in body && Array.isArray(body.suppliers)
        ? body.suppliers.length
        : 0,
  });
  return body;
}
