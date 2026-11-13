import type { PoolClient } from "pg";
import type { PayassureSettlementWebhookEvent } from "../payassure-webhook";

export async function applyPayassureCollectionFailure(
  client: PoolClient,
  saleId: number,
  event: PayassureSettlementWebhookEvent,
): Promise<void> {
  const reason = String(event.details.failure_reason ?? "PayAssure collection failed");
  const failedSale = await client.query(
    "UPDATE sales SET status = 'failed' WHERE id = $1 AND status = 'pending'",
    [saleId],
  );
  await client.query(
    `UPDATE payassure_settlements
     SET collection_status = 'failed', status = 'failed',
         last_error = $2, provider_settlement_id = $3,
         last_event_type = $4, last_event_payload = $5::jsonb,
         last_event_at = COALESCE($6::timestamptz, last_event_at),
         updated_at = NOW()
     WHERE sale_id = $1`,
    [
      saleId,
      reason,
      event.settlementId,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
    ],
  );
  if (failedSale.rowCount) {
    await client.query(
      `INSERT INTO failed_checkout_attempts
         (payment_method, total_cents, failure_reason, created_by)
       SELECT payment_method, total_cents, $2, 'payassure-webhook'
       FROM sales WHERE id = $1`,
      [saleId, reason],
    );
  }
}
