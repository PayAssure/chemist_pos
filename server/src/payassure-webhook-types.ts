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
