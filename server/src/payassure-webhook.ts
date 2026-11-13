import {
  payassureWebhookEventTypes,
  type PayassureFloatDepositWebhookEvent,
  type PayassureWebhookEvent,
  type PayassureSettlementWebhookEvent,
} from "./payassure-webhook-types";

export { verifyPayassureWebhookSignature } from "./payassure-webhook-signature";
export type {
  PayassureSettlementWebhookEvent,
  PayassureWebhookEvent,
  PayassureWebhookEventType,
} from "./payassure-webhook-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function readPayassureWebhookRecipient(rawBody: Buffer): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.data) || !isRecord(parsed.data.recipient)) {
    return null;
  }
  const merchantId = parsed.data.recipient.merchant_id;
  return typeof merchantId === "string" && merchantId.trim() ? merchantId.trim() : null;
}

export function parsePayassureWebhookEvent(
  rawBody: Buffer,
  eventIdHeader: string | undefined,
  eventTypeHeader: string | undefined,
): PayassureWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new Error("Webhook body must be valid JSON");
  }
  if (!isRecord(parsed)) throw new Error("Webhook body must be a JSON object");

  const data = parsed.data;
  if (!isRecord(data) || !isRecord(data.recipient)) {
    throw new Error("Webhook data must include a recipient object");
  }
  const id = typeof parsed.id === "string" ? parsed.id : "";
  const type = typeof parsed.type === "string" ? parsed.type : "";
  const recipientMerchantId =
    typeof data.recipient.merchant_id === "string" ? data.recipient.merchant_id : "";
  if (!id || !type || !recipientMerchantId) {
    throw new Error("Webhook is missing required event or recipient fields");
  }
  if (eventIdHeader !== id || eventTypeHeader !== type) {
    throw new Error("Webhook event headers do not match the event body");
  }
  if (!(payassureWebhookEventTypes as readonly string[]).includes(type)) {
    throw new Error(`Unsupported PayAssure event type: ${type}`);
  }
  const createdAt = typeof parsed.created_at === "string" ? parsed.created_at : null;

  if (type === "payment.escrow.deposit.succeeded") {
    if (!isRecord(data.deposit)) {
      throw new Error("Float deposit webhook must include a deposit object");
    }
    const depositId = typeof data.deposit.id === "string" ? data.deposit.id : "";
    const amount = data.deposit.amount;
    const currency = typeof data.deposit.currency === "string" ? data.deposit.currency : "";
    const depositStatus = data.deposit.status;
    if (
      !depositId || typeof amount !== "number" || !Number.isFinite(amount) ||
      !currency || depositStatus !== "SUCCEEDED"
    ) {
      throw new Error("Float deposit webhook is missing required successful deposit fields");
    }
    return {
      id,
      type,
      recipientMerchantId,
      depositId,
      amount,
      currency,
      receiptNumber:
        typeof data.deposit.receipt_number === "string" ? data.deposit.receipt_number : null,
      completedAt:
        typeof data.deposit.completed_at === "string" ? data.deposit.completed_at : null,
      createdAt,
      payload: parsed,
    } satisfies PayassureFloatDepositWebhookEvent;
  }

  if (!isRecord(data.settlement)) {
    throw new Error("Settlement webhook must include a settlement object");
  }
  const settlementId = typeof data.settlement.id === "string" ? data.settlement.id : "";
  const settlementReference =
    typeof data.settlement.reference === "string" ? data.settlement.reference : "";
  const camelCaseReference = data.settlement.merchantTransactionReference;
  const snakeCaseReference = data.settlement.merchant_transaction_reference;
  if (
    typeof camelCaseReference === "string" &&
    typeof snakeCaseReference === "string" &&
    camelCaseReference.trim() !== snakeCaseReference.trim()
  ) {
    throw new Error("Webhook merchant transaction reference fields do not match");
  }
  const merchantTransactionReference =
    typeof camelCaseReference === "string"
      ? camelCaseReference.trim()
      : typeof snakeCaseReference === "string"
        ? snakeCaseReference.trim()
        : "";
  const amount = data.settlement.amount;
  const currency = typeof data.settlement.currency === "string" ? data.settlement.currency : "";

  if (!settlementId || !settlementReference || !merchantTransactionReference ||
      typeof amount !== "number" || !Number.isFinite(amount) || !currency) {
    throw new Error("Webhook is missing required event, recipient, or settlement fields");
  }

  const details = isRecord(data.details) ? data.details : {};
  const payouts = Array.isArray(data.payouts) ? data.payouts : [];
  return {
    id,
    type: type as PayassureSettlementWebhookEvent["type"],
    recipientMerchantId,
    settlementId,
    settlementReference,
    merchantTransactionReference,
    amount,
    currency,
    createdAt,
    details,
    payouts,
    payload: parsed,
  };
}
