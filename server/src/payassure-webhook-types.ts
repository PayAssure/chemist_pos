export const payassureWebhookEventTypes = [
  "payment.collection.succeeded",
  "payment.collection.failed",
  "payment.settlement.started",
  "payment.settlement.progress",
  "payment.settlement.partially_failed",
  "payment.settlement.retrying",
  "payment.settlement.completed",
  "payment.settlement.reconciliation_required",
  "payment.escrow.deposit.succeeded",
] as const;

export type PayassureWebhookEventType = (typeof payassureWebhookEventTypes)[number];

type WebhookEventBase = {
  id: string;
  recipientMerchantId: string;
  createdAt: string | null;
  payload: Record<string, unknown>;
};

export type PayassureSettlementWebhookEvent = WebhookEventBase & {
  type: Exclude<PayassureWebhookEventType, "payment.escrow.deposit.succeeded">;
  settlementId: string;
  settlementReference: string;
  merchantTransactionReference: string;
  amount: number;
  currency: string;
  details: Record<string, unknown>;
  payouts: unknown[];
};

export type PayassureFloatDepositWebhookEvent = WebhookEventBase & {
  type: "payment.escrow.deposit.succeeded";
  depositId: string;
  amount: number;
  currency: string;
  receiptNumber: string | null;
  completedAt: string | null;
};

export type PayassureWebhookEvent =
  | PayassureSettlementWebhookEvent
  | PayassureFloatDepositWebhookEvent;
