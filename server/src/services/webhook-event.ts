import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import { applyPayassureCollectionFailure } from "./webhook-event-failure";
import { applyPayassureSettlementEvent } from "./webhook-event-settlement";
import { confirmPayassureCollectionInventory } from "./webhook-event-stock";

export async function applyPayassureWebhookEvent(
  client: PoolClient,
  event: PayassureWebhookEvent,
): Promise<void> {
  const result = await client.query<{
    id: number;
    status: "completed" | "pending" | "failed";
    totalCents: number;
    collectionStatus: "pending" | "succeeded" | "failed";
    settlementStatus: string;
    lastEventAt: string | null;
  }>(
    `SELECT sale.id, sale.status, sale.total_cents AS "totalCents",
            settlement.collection_status AS "collectionStatus",
            settlement.status AS "settlementStatus",
            settlement.last_event_at AS "lastEventAt"
     FROM payassure_settlements settlement
     JOIN sales sale ON sale.id = settlement.sale_id
     WHERE settlement.provider_settlement_id = $2
        OR (
          settlement.provider_settlement_id IS NULL
          AND settlement.merchant_transaction_reference = $1
        )
     FOR UPDATE OF settlement, sale`,
    [event.merchantTransactionReference, event.settlementId],
  );
  const sale = result.rows[0];
  if (!sale) throw Object.assign(new Error("No matching checkout for this PayAssure event"), { status: 404 });
  if (
    event.currency !== "KES" ||
    Math.round(event.amount * 100) !== Number(sale.totalCents)
  ) {
    throw Object.assign(new Error("PayAssure event amount or currency does not match the checkout"), {
      status: 409,
    });
  }

  const eventTime = event.createdAt ? new Date(event.createdAt) : null;
  const isStaleSettlementEvent =
    eventTime !== null &&
    sale.lastEventAt !== null &&
    eventTime.getTime() < new Date(sale.lastEventAt).getTime();

  if (event.type === "payment.collection.succeeded") {
    if (sale.collectionStatus !== "succeeded") {
      await confirmPayassureCollectionInventory(client, sale.id);
    }

    await client.query(
      `UPDATE payassure_settlements
       SET collection_status = 'succeeded',
           status = CASE WHEN status IN ('queued', 'accepted') THEN 'processing' ELSE status END,
           provider_settlement_id = $2,
           last_error = NULL,
           last_event_type = $3,
           last_event_payload = $4::jsonb,
           last_event_at = COALESCE($5::timestamptz, last_event_at),
           updated_at = NOW()
       WHERE sale_id = $1`,
      [sale.id, event.settlementId, event.type, JSON.stringify(event.payload), event.createdAt],
    );
    return;
  }

  if (event.type === "payment.collection.failed") {
    if (sale.collectionStatus !== "succeeded") {
      await applyPayassureCollectionFailure(client, sale.id, event);
    }
    return;
  }

  if (
    sale.collectionStatus === "failed" ||
    sale.settlementStatus === "completed" ||
    isStaleSettlementEvent
  ) return;

  await applyPayassureSettlementEvent(client, sale.id, event);
}
