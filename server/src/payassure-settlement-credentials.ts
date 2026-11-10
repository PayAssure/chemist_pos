

export type RetailerIntegrationCredentials = {
  apiKey: string;
  apiSecret: string;
  merchantId: string;
};

export function retailerIntegrationCredentials(value: unknown): RetailerIntegrationCredentials {
  const participant = Array.isArray(value) ? value[0] : value;
  if (!participant || typeof participant !== "object") {
    throw new Error("PayAssure retailer profile is unavailable");
  }
  const integration = (participant as Record<string, unknown>).integration;
  if (!integration || typeof integration !== "object") {
    throw new Error("PayAssure retailer integration is unavailable");
  }
  const details = integration as Record<string, unknown>;
  if (details.isActive !== true) {
    throw new Error("PayAssure retailer integration is not active");
  }
  if (
    typeof details.apiKey !== "string" ||
    !details.apiKey ||
    typeof details.apiSecret !== "string" ||
    !details.apiSecret ||
    typeof details.merchantId !== "string" ||
    !details.merchantId
  ) {
    throw new Error("PayAssure retailer integration credentials are incomplete");
  }
  return {
    apiKey: details.apiKey,
    apiSecret: details.apiSecret,
    merchantId: details.merchantId,
  };
}
