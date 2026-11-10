import { getConfig } from "./payassure-config";
import type { PayassureSettlementPayload } from "./payassure-types";
import { getPayassureParticipant } from "./payassure-participant";
import { currentPayassureSession } from "./payassure-token-store";
import {
  retailerIntegrationCredentials,
} from "./payassure-settlement-credentials";
import {
  settlementErrorMessage,
  settlementRequest,
} from "./payassure-settlement-request";
import { authenticateRetailer } from "./payassure-settlement-auth";

export async function initiatePayassureSettlement(
  payload: PayassureSettlementPayload,
  onPayloadPrepared: (preparedPayload: PayassureSettlementPayload) => Promise<void>,
): Promise<{
  merchantId: string;
  providerRequestId: string;
  providerSettlementId: string | null;
}> {
  const config = getConfig();
  const credentials = retailerIntegrationCredentials(await getPayassureParticipant());
  const preparedPayload = payload.merchantId
    ? payload
    : { ...payload, merchantId: credentials.merchantId };
  await onPayloadPrepared(preparedPayload);
  const platformSession = await currentPayassureSession();
  const initiateUrl = `${config.baseUrl}/settlement/initiate-settlement`;
  const sessionToken = await authenticateRetailer(
    config.baseUrl,
    platformSession.accessToken,
    credentials,
  );

  try {
    const initiation = await settlementRequest(
      "initiate-settlement",
      initiateUrl,
      platformSession.accessToken,
      preparedPayload,
      {
        merchantId: preparedPayload.merchantId,
        merchantTransactionReference: preparedPayload.merchantTransactionReference,
        amount: preparedPayload.amount,
        currency: preparedPayload.currency,
        paymentMethodTypes: preparedPayload.payment.methods.map(({ type }) => type),
        itemCount: preparedPayload.items.length,
        sessionToken: "[REDACTED]",
      },
      { "x-settlement-session": sessionToken },
      [
        credentials.apiKey,
        credentials.apiSecret,
        platformSession.accessToken,
        sessionToken,
      ],
    );
    const providerSettlementId =
      typeof initiation.body.settlementId === "string" ? initiation.body.settlementId : null;
    console.info("[PayAssure] Settlement initiated", {
      operation: "initiate-settlement",
      merchantTransactionReference: preparedPayload.merchantTransactionReference,
      providerRequestId: initiation.requestId,
      providerSettlementId,
      responseKeys: Object.keys(initiation.body),
    });
    return {
      merchantId: credentials.merchantId,
      providerRequestId: initiation.requestId,
      providerSettlementId,
    };
  } catch (error) {
    console.error("[PayAssure] Settlement initiation failed", {
      operation: "initiate-settlement",
      merchantTransactionReference: preparedPayload.merchantTransactionReference,
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: settlementErrorMessage(error, [
        credentials.apiKey,
        credentials.apiSecret,
        platformSession.accessToken,
        sessionToken,
      ]),
    });
    throw error;
  }
}
