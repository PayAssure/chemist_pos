import type { PoolClient } from "pg";
import type { PayassureSettlementWebhookEvent } from "../payassure-webhook";
import { applyPayassureCollectionFailure } from "./webhook-event-failure";
import { applyPayassureSettlementEvent } from "./webhook-event-settlement";
import {
  completePayassureSaleAfterSettlement,
  confirmPayassureCollectionInventory,
} from "./webhook-event-stock";

export async function applyPayassureWebhookEvent(
  client: PoolClient,
  event: PayassureSettlementWebhookEvent,
): Promise<number> {
  type CheckoutSettlement = {
    id: number;
    status: "completed" | "pending" | "failed";
    totalCents: number;
    collectionStatus: "pending" | "succeeded" | "failed";
    settlementStatus: string;
    lastEventAt: string | null;
    providerSettlementId: string | null;
    merchantTransactionReference: string;
  };
  const result = await client.query<CheckoutSettlement>(
    `SELECT sale.id, sale.status, sale.total_cents AS "totalCents",
            settlement.collection_status AS "collectionStatus",
            settlement.status AS "settlementStatus",
            settlement.last_event_at AS "lastEventAt",
            settlement.provider_settlement_id AS "providerSettlementId",
            settlement.merchant_transaction_reference AS "merchantTransactionReference"
     FROM payassure_settlements settlement
     JOIN sales sale ON sale.id = settlement.sale_id
     WHERE settlement.merchant_transaction_reference = $1
     FOR UPDATE OF settlement, sale`,
    [event.merchantTransactionReference],
  );
  let sale = result.rows[0];
  let isChildSettlement = false;
  if (!sale) {
    const settlementMatch = await client.query<CheckoutSettlement>(
      `SELECT sale.id, sale.status, sale.total_cents AS "totalCents",
              settlement.collection_status AS "collectionStatus",
              settlement.status AS "settlementStatus",
              settlement.last_event_at AS "lastEventAt",
              settlement.provider_settlement_id AS "providerSettlementId",
              settlement.merchant_transaction_reference AS "merchantTransactionReference"
       FROM payassure_settlements settlement
       JOIN sales sale ON sale.id = settlement.sale_id
       WHERE settlement.provider_settlement_id = $1
       FOR UPDATE OF settlement, sale`,
      [event.settlementId],
    );
    sale = settlementMatch.rows[0];
    if (sale) {
      console.warn("[PayAssure] Webhook merchant transaction reference did not match; checkout found by provider settlement ID", {
        eventMerchantTransactionReference: event.merchantTransactionReference,
        storedMerchantTransactionReference: sale.merchantTransactionReference,
        eventSettlementId: event.settlementId,
      });
    }
  }
  if (!sale) {
    const childSettlementMatch = await client.query<CheckoutSettlement>(
      `SELECT sale.id, sale.status, sale.total_cents AS "totalCents",
              settlement.collection_status AS "collectionStatus",
              settlement.status AS "settlementStatus",
              settlement.last_event_at AS "lastEventAt",
              settlement.provider_settlement_id AS "providerSettlementId",
              settlement.merchant_transaction_reference AS "merchantTransactionReference"
       FROM payassure_settlements settlement
       JOIN sales sale ON sale.id = settlement.sale_id
       WHERE left($1, length(settlement.merchant_transaction_reference) + 1)
             = settlement.merchant_transaction_reference || '-'
       ORDER BY length(settlement.merchant_transaction_reference) DESC
       LIMIT 1
       FOR UPDATE OF settlement, sale`,
      [event.settlementReference],
    );
    sale = childSettlementMatch.rows[0];
    isChildSettlement = Boolean(sale);
    if (sale) {
      console.info("[PayAssure] Child payout webhook matched to parent checkout", {
        eventMerchantTransactionReference: event.merchantTransactionReference,
        eventSettlementReference: event.settlementReference,
        storedMerchantTransactionReference: sale.merchantTransactionReference,
        eventSettlementId: event.settlementId,
      });
    }
  }
  if (!sale) {
    throw Object.assign(
      new Error("No checkout matches the PayAssure merchant transaction reference"),
      { status: 404 },
    );
  }
  isChildSettlement ||= event.settlementReference.startsWith(
    `${sale.merchantTransactionReference}-`,
  );

  const providerSettlementConflict = await client.query(
    `SELECT 1
     FROM payassure_settlements
     WHERE provider_settlement_id = $1
       AND sale_id <> $2
     LIMIT 1`,
    [event.settlementId, sale.id],
  );
  if (providerSettlementConflict.rowCount) {
    throw Object.assign(new Error("PayAssure settlement ID is already mapped to a different checkout"), {
      status: 409,
    });
  }
  if (sale.providerSettlementId && sale.providerSettlementId !== event.settlementId) {
    console.warn("[PayAssure] Provider settlement ID differs; matching checkout by merchant transaction reference", {
      settlementReference: event.settlementReference,
      merchantTransactionReference: event.merchantTransactionReference,
      storedProviderSettlementId: sale.providerSettlementId,
      eventProviderSettlementId: event.settlementId,
    });
  }

  const eventAmountCents = Math.round(event.amount * 100);
  if (
    event.currency !== "KES" ||
    (isChildSettlement
      ? eventAmountCents <= 0 || eventAmountCents > Number(sale.totalCents)
      : eventAmountCents !== Number(sale.totalCents))
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

  if (isChildSettlement && event.type !== "payment.settlement.partially_failed") {
    return sale.id;
  }

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
    await completePayassureSaleAfterSettlement(client, sale.id);
    return sale.id;
  }

  if (event.type === "payment.collection.failed") {
    if (sale.collectionStatus !== "succeeded") {
      await applyPayassureCollectionFailure(client, sale.id, event);
    }
    return sale.id;
  }

  if (
    sale.collectionStatus === "failed" ||
    sale.settlementStatus === "completed" ||
    isStaleSettlementEvent
  ) return sale.id;

  await applyPayassureSettlementEvent(client, sale.id, event);
  if (event.type === "payment.settlement.completed") {
    await completePayassureSaleAfterSettlement(client, sale.id);
  }
  return sale.id;
}
