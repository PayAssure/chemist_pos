import { safeEndpoint } from "./payassure-config";
import { requestParticipant, getPayassureParticipant } from "./payassure-participant";
import { storePayassureWebhookSecret } from "./payassure-webhook-secrets";
import {
  getPayassureWebhookUrl,
  setRegisteredPayassureWebhookUrl,
} from "./payassure-webhook-url";
import {
  normalizeEffectiveWebhookUrl,
  readWebhookRegistrationDetails,
} from "./payassure-webhook-validation";

export async function registerPayassureWebhookUrl(): Promise<void> {
  setRegisteredPayassureWebhookUrl(null);
  const fallbackWebhookUrl = getPayassureWebhookUrl();
  const details = readWebhookRegistrationDetails(await getPayassureParticipant());
  const integration = details.integrationDetails;
  if (
    integration &&
    typeof integration.merchantId === "string" &&
    typeof integration.apiSecret === "string" &&
    integration.apiSecret
  ) {
    await storePayassureWebhookSecret(integration.merchantId, integration.apiSecret);
  }

  if (fallbackWebhookUrl) {
    console.info("[PayAssure] Registering participant fallback webhook endpoint", {
      endpoint: safeEndpoint(fallbackWebhookUrl),
      status: "registering",
    });
    try {
      await requestParticipant(
        "PATCH",
        { webhookUrl: fallbackWebhookUrl },
        `/onbordings/${encodeURIComponent(details.participantId)}/webhook`,
      );
    } catch (error) {
      console.error("[PayAssure] Participant fallback webhook registration failed", {
        endpoint: safeEndpoint(fallbackWebhookUrl),
        status: "failed",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
    console.info("[PayAssure] Participant fallback webhook endpoint registered", {
      endpoint: safeEndpoint(fallbackWebhookUrl),
      status: "registered",
    });
  }

  const participantFallbackUrl = fallbackWebhookUrl ?? details.participantWebhookUrl;
  const integrationWebhookUrl = details.integrationWebhookUrl;
  const effectiveUrl = integrationWebhookUrl ?? participantFallbackUrl;
  if (!effectiveUrl) {
    console.error("[PayAssure] No effective webhook endpoint is configured", {
      status: "not_configured",
    });
    throw new Error(
      "Configure PAYASSURE_WEBHOOK_URL or set a PayAssure participant/integration webhook URL before checkout",
    );
  }
  const normalizedEffectiveUrl = normalizeEffectiveWebhookUrl(effectiveUrl);
  if (
    integrationWebhookUrl &&
    participantFallbackUrl &&
    normalizedEffectiveUrl !== participantFallbackUrl
  ) {
    console.error("[PayAssure] Integration webhook URL overrides the participant fallback", {
      fallbackEndpoint: safeEndpoint(participantFallbackUrl),
      effectiveEndpoint: safeEndpoint(normalizedEffectiveUrl),
      status: "endpoint_mismatch",
    });
    throw new Error(
      "The integration-specific PayAssure webhook URL overrides the participant fallback and must point to the same receiver",
    );
  }

  setRegisteredPayassureWebhookUrl(normalizedEffectiveUrl);
  console.info("[PayAssure] Effective webhook endpoint selected", {
    endpoint: safeEndpoint(normalizedEffectiveUrl),
    source: integrationWebhookUrl
      ? "integration"
      : fallbackWebhookUrl
        ? "participant_fallback"
        : "existing_participant",
    status: "ready",
  });
}
