type WebhookRegistrationDetails = {
  participantId: string;
  participantWebhookUrl: string | null;
  integrationWebhookUrl: string | null;
  integrationDetails: Record<string, unknown> | null;
};

export function readWebhookRegistrationDetails(value: unknown): WebhookRegistrationDetails {
  const participant = Array.isArray(value) ? value[0] : value;
  if (!participant || typeof participant !== "object") {
    throw new Error("PayAssure retailer profile is unavailable for webhook registration");
  }
  const participantRecord = participant as Record<string, unknown>;
  const participantId = participantRecord.id;
  if (typeof participantId !== "string" || !participantId) {
    throw new Error("PayAssure retailer profile did not include a participant ID");
  }
  const integration = participantRecord.integration;
  const integrationDetails =
    integration && typeof integration === "object"
      ? integration as Record<string, unknown>
      : null;
  const participantWebhookUrl =
    typeof participantRecord.webhookUrl === "string" && participantRecord.webhookUrl.trim()
      ? participantRecord.webhookUrl.trim()
      : null;
  const integrationWebhookUrl =
    typeof integrationDetails?.webhookUrl === "string" && integrationDetails.webhookUrl.trim()
      ? integrationDetails.webhookUrl.trim()
      : null;
  return {
    participantId,
    participantWebhookUrl,
    integrationWebhookUrl,
    integrationDetails,
  };
}

export function normalizeEffectiveWebhookUrl(effectiveUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(effectiveUrl);
  } catch {
    throw new Error("The effective PayAssure webhook URL is invalid");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/webhook"
  ) {
    throw new Error("The effective PayAssure webhook URL must use HTTP or HTTPS and end in /webhook");
  }
  return parsed.toString().replace(/\/$/, "");
}
