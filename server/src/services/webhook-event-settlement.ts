import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";

export async function applyPayassureSettlementEvent(
  client: PoolClient,
  saleId: number,
  event: PayassureWebhookEvent,
): Promise<void> {
  const settlementStatus = ({
    "payment.settlement.started": "processing",
    "payment.settlement.progress": "processing",
    "payment.settlement.partially_failed": "partially_failed",
    "payment.settlement.retrying": "retrying",
    "payment.settlement.completed": "completed",
    "payment.settlement.reconciliation_required": "awaiting_reconciliation",
  } as Partial<Record<PayassureWebhookEvent["type"], string>>)[event.type];
  if (!settlementStatus) {
    throw new Error(`Unsupported settlement event type: ${event.type}`);
  }
  const failureReason = event.details.failure_reason;
  const attemptCount = event.details.attempt_count;
  await client.query(
    `UPDATE payassure_settlements
     SET status = $2,
         provider_settlement_id = $3,
         last_error = CASE
           WHEN $2 = 'partially_failed' THEN $4
           WHEN $2 IN ('processing', 'completed') THEN NULL
           ELSE last_error
         END,
         attempt_count = CASE
           WHEN $2 = 'retrying' AND $5::integer > attempt_count THEN $5::integer
           WHEN $2 = 'retrying' THEN attempt_count + 1
           ELSE attempt_count
         END,
         last_event_type = $6,
         last_event_payload = $7::jsonb,
         last_event_at = COALESCE($8::timestamptz, last_event_at),
         updated_at = NOW()
     WHERE sale_id = $1`,
    [
      saleId,
      settlementStatus,
      event.settlementId,
      typeof failureReason === "string" ? failureReason : "PayAssure reported a payout failure",
      typeof attemptCount === "number" && Number.isSafeInteger(attemptCount) ? attemptCount : 0,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
    ],
  );
}
