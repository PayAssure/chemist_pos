import type { RetailerIntegrationCredentials } from "./payassure-settlement-credentials";
import { settlementErrorMessage, settlementRequest } from "./payassure-settlement-request";

export async function authenticateRetailer(
  baseUrl: string,
  platformAccessToken: string,
  credentials: RetailerIntegrationCredentials,
): Promise<string> {
  try {
    const auth = await settlementRequest(
      "retailer-authenticate",
      `${baseUrl}/settlement/authenticate`,
      platformAccessToken,
      { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret },
      { apiKey: "[REDACTED]", apiSecret: "[REDACTED]" },
      {},
      [credentials.apiKey, credentials.apiSecret, platformAccessToken],
    );
    if (typeof auth.body.token !== "string" || !auth.body.token) {
      throw new Error("PayAssure retailer authentication did not return a session token");
    }
    return auth.body.token;
  } catch (error) {
    console.error("[PayAssure] Retailer authentication failed", {
      operation: "retailer-authenticate",
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: settlementErrorMessage(error, [
        credentials.apiKey,
        credentials.apiSecret,
        platformAccessToken,
      ]),
    });
    throw error;
  }
}
