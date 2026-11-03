import { createHmac, timingSafeEqual } from "node:crypto";

export const payassureWebhookEventTypes = [
  "payment.collection.succeeded",
  "payment.collection.failed",
  "payment.settlement.started",
  "payment.settlement.progress",
  "payment.settlement.partially_failed",
  "payment.settlement.retrying",
  "payment.settlement.completed",
  "payment.settlement.reconciliation_required",
] as const;

export type PayassureWebhookEventType = (typeof payassureWebhookEventTypes)[number];

export type PayassureWebhookEvent = {
  id: string;
  type: PayassureWebhookEventType;
  recipientMerchantId: string;
  settlementId: string;
  settlementReference: string;
  merchantTransactionReference: string;
  amount: number;
  currency: string;
  createdAt: string | null;
  details: Record<string, unknown>;
  payouts: unknown[];
  payload: Record<string, unknown>;
};

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

export function verifyPayassureWebhookSignature(
  rawBody: Buffer,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestampHeader || !/^\d+$/.test(timestampHeader) || !signatureHeader) return false;
  const signatureParts = new Map<string, string>();
  for (const part of signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    signatureParts.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const timestamp = signatureParts.get("t");
  const suppliedHex = signatureParts.get("v1");
  if (timestamp !== timestampHeader || !suppliedHex || !/^[a-f0-9]{64}$/i.test(suppliedHex)) {
    return false;
  }

  const receivedAt = Number(timestampHeader);
  if (!Number.isSafeInteger(receivedAt) || Math.abs(nowSeconds - receivedAt) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestampHeader}.${rawBody.toString("utf8")}`)
    .digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
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
  if (!isRecord(data) || !isRecord(data.settlement) || !isRecord(data.recipient)) {
    throw new Error("Webhook data must include settlement and recipient objects");
  }
  const id = typeof parsed.id === "string" ? parsed.id : "";
  const type = typeof parsed.type === "string" ? parsed.type : "";
  const recipientMerchantId =
    typeof data.recipient.merchant_id === "string" ? data.recipient.merchant_id : "";
  const settlementId = typeof data.settlement.id === "string" ? data.settlement.id : "";
  const settlementReference =
    typeof data.settlement.reference === "string" ? data.settlement.reference : "";
  const merchantTransactionReference =
    typeof data.settlement.merchant_transaction_reference === "string"
      ? data.settlement.merchant_transaction_reference
      : "";
  const amount = data.settlement.amount;
  const currency = typeof data.settlement.currency === "string" ? data.settlement.currency : "";

  if (!id || !type || !recipientMerchantId || !settlementId || !settlementReference ||
      !merchantTransactionReference || typeof amount !== "number" || !Number.isFinite(amount) ||
      !currency) {
    throw new Error("Webhook is missing required event, recipient, or settlement fields");
  }
  if (eventIdHeader !== id || eventTypeHeader !== type) {
    throw new Error("Webhook event headers do not match the event body");
  }
  if (!(payassureWebhookEventTypes as readonly string[]).includes(type)) {
    throw new Error(`Unsupported PayAssure event type: ${type}`);
  }

  const details = isRecord(data.details) ? data.details : {};
  const payouts = Array.isArray(data.payouts) ? data.payouts : [];
  return {
    id,
    type: type as PayassureWebhookEventType,
    recipientMerchantId,
    settlementId,
    settlementReference,
    merchantTransactionReference,
    amount,
    currency,
    createdAt: typeof parsed.created_at === "string" ? parsed.created_at : null,
    details,
    payouts,
    payload: parsed,
  };
}
