import type { Response } from "express";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import { applyPayassureWebhookEvent } from "./webhook-event";

export function webhookContext(event: PayassureWebhookEvent) {
  return {
    endpoint: "/webhook",
    eventId: event.id,
    eventType: event.type,
    merchantTransactionReference: event.merchantTransactionReference,
    providerSettlementId: event.settlementId,
    recipientMerchantId: event.recipientMerchantId,
  };
}

async function insertWebhookEvent(
  client: PoolClient,
  event: PayassureWebhookEvent,
): Promise<number | null> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO payassure_webhook_events
       (recipient_merchant_id, provider_event_id, event_type, payload, signature_valid, status)
     VALUES ($1, $2, $3, $4::jsonb, TRUE, 'received')
     ON CONFLICT (recipient_merchant_id, provider_event_id) DO NOTHING
     RETURNING id`,
    [event.recipientMerchantId, event.id, event.type, JSON.stringify(event.payload)],
  );
  return result.rows[0]?.id ?? null;
}

async function applyWebhookEvent(
  client: PoolClient,
  event: PayassureWebhookEvent,
  eventId: number,
) {
  await applyPayassureWebhookEvent(client, event);
  const status = await client.query(
    `SELECT sale.status AS "saleStatus",
            settlement.status AS "settlementStatus",
            settlement.collection_status AS "collectionStatus"
     FROM sales sale
     JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
     WHERE settlement.provider_settlement_id = $2
        OR (
          settlement.provider_settlement_id IS NULL
          AND settlement.merchant_transaction_reference = $1
        )`,
    [event.merchantTransactionReference, event.settlementId],
  );
  await client.query(
    `UPDATE payassure_webhook_events
     SET status = 'processed', processed_at = NOW()
     WHERE id = $1`,
    [eventId],
  );
  return status.rows[0];
}

export async function processWebhookTransaction(
  client: PoolClient,
  event: PayassureWebhookEvent,
  res: Response,
): Promise<void> {
  const context = webhookContext(event);
  await client.query("BEGIN");
  const eventId = await insertWebhookEvent(client, event);
  if (eventId === null) {
    await client.query("COMMIT");
    console.info("[PayAssure] Duplicate webhook ignored", { ...context, status: "duplicate" });
    res.status(200).json({ received: true, duplicate: true });
    return;
  }
  const checkoutStatus = await applyWebhookEvent(client, event, eventId);
  await client.query("COMMIT");
  console.info("[PayAssure] Webhook processed", {
    ...context,
    status: "processed",
    ...(checkoutStatus ?? {}),
  });
  res.status(200).json({ received: true });
}
