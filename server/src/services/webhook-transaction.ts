import type { Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import {
  parsePayassureWebhookEvent,
  type PayassureWebhookEvent,
  type PayassureSettlementWebhookEvent,
} from "../payassure-webhook";
import {
  publishCheckoutStatus,
  type CheckoutStatusUpdate,
} from "./checkout-status-events";
import { publishFloatDepositStatus } from "./float-deposit-status-events";
import { applyPayassureWebhookEvent } from "./webhook-event";

export function webhookContext(event: PayassureWebhookEvent) {
  if (event.type === "payment.escrow.deposit.succeeded") {
    return {
      endpoint: "/webhook",
      eventId: event.id,
      eventType: event.type,
      depositId: event.depositId,
      recipientMerchantId: event.recipientMerchantId,
    };
  }
  return {
    endpoint: "/webhook",
    eventId: event.id,
    eventType: event.type,
    merchantTransactionReference: event.merchantTransactionReference,
    settlementReference: event.settlementReference,
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
  event: PayassureSettlementWebhookEvent,
  eventId: number,
) {
  const saleId = await applyPayassureWebhookEvent(client, event);
  const status = await client.query<CheckoutStatusUpdate & {
    merchantTransactionReference: string;
  }>(
    `SELECT sale.status AS status,
            settlement.status AS "settlementStatus",
            settlement.collection_status AS "collectionStatus",
            settlement.last_error AS "settlementError",
            settlement.merchant_transaction_reference AS "merchantTransactionReference"
     FROM sales sale
     JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
     WHERE sale.id = $1`,
    [saleId],
  );
  const eventUpdate = await client.query(
    `UPDATE payassure_webhook_events
     SET status = 'processed', processed_at = NOW(), error_message = NULL
     WHERE id = $1`,
    [eventId],
  );
  console.info("[PayAssure] Webhook database state updated", {
    ...webhookContext(event),
    webhookRecordId: eventId,
    saleId,
    saleStatus: status.rows[0]?.status,
    settlementStatus: status.rows[0]?.settlementStatus,
    collectionStatus: status.rows[0]?.collectionStatus,
    webhookRecordUpdated: eventUpdate.rowCount === 1,
  });
  return { ...status.rows[0], saleId };
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number(error.status);
  return Number.isInteger(status) ? status : null;
}

export async function processWebhookTransaction(
  client: PoolClient,
  event: PayassureWebhookEvent,
  res: Response,
): Promise<void> {
  const context = webhookContext(event);
  const receivedAt = Date.now();
  await client.query("BEGIN");
  const eventId = await insertWebhookEvent(client, event);
  if (eventId === null) {
    await client.query("COMMIT");
    console.info("[PayAssure] Duplicate webhook ignored", { ...context, status: "duplicate" });
    res.status(200).json({ received: true, duplicate: true });
    return;
  }
  console.info("[PayAssure] Webhook event inserted in transaction; applying event update", {
    ...context,
    webhookRecordId: eventId,
  });
  if (event.type === "payment.escrow.deposit.succeeded") {
    await client.query(
      `UPDATE payassure_webhook_events
       SET status = 'processed', processed_at = NOW(), error_message = NULL
       WHERE id = $1`,
      [eventId],
    );
    await client.query("COMMIT");
    try {
      await publishFloatDepositStatus(event.depositId);
    } catch (error) {
      console.error("[PayAssure] Could not notify float deposit status listeners", {
        ...context,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    console.info("[PayAssure] Float deposit webhook processed", {
      ...context,
      status: "processed",
      amount: event.amount,
      currency: event.currency,
      receiptNumber: event.receiptNumber,
    });
    res.status(200).json({ received: true });
    return;
  }
  let checkoutStatus;
  try {
    checkoutStatus = await applyWebhookEvent(client, event, eventId);
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
    await client.query(
      `UPDATE payassure_webhook_events
       SET error_message = $2
       WHERE id = $1`,
      [eventId, error instanceof Error ? error.message : "Checkout mapping is not available yet"],
    );
    await client.query("COMMIT");
    console.warn("[PayAssure] Webhook deferred until settlement mapping is available", {
      ...context,
      webhookRecordId: eventId,
      status: "deferred",
      databaseCommitted: true,
    });
    res.status(202).json({ received: true, pending: true });
    return;
  }
  await client.query("COMMIT");
  console.info("[PayAssure] Webhook transaction committed", {
    ...context,
    webhookRecordId: eventId,
    saleId: checkoutStatus?.saleId ?? null,
    saleStatus: checkoutStatus?.status ?? null,
    settlementStatus: checkoutStatus?.settlementStatus ?? null,
    collectionStatus: checkoutStatus?.collectionStatus ?? null,
    durationMs: Date.now() - receivedAt,
  });
  if (checkoutStatus) {
    try {
      await publishCheckoutStatus(checkoutStatus.merchantTransactionReference);
    } catch (error) {
      console.error("[PayAssure] Could not notify checkout status listeners", error);
    }
  } else {
    console.warn("[PayAssure] Webhook committed without a checkout status to publish", context);
  }
  console.info("[PayAssure] Webhook processed", {
    ...context,
    status: "processed",
    ...(checkoutStatus ? {
      saleId: checkoutStatus.saleId,
      saleStatus: checkoutStatus.status,
      settlementStatus: checkoutStatus.settlementStatus,
      collectionStatus: checkoutStatus.collectionStatus,
    } : {}),
  });
  res.status(200).json({ received: true });
}

export async function processPendingWebhookEvents(
  providerSettlementId: string,
  merchantTransactionReference: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const pending = await client.query<{
      id: number;
      payload: Record<string, unknown>;
    }>(
      `SELECT id, payload
       FROM payassure_webhook_events
       WHERE status = 'received'
         AND event_type <> 'payment.escrow.deposit.succeeded'
         AND (
           payload->'data'->'settlement'->>'id' = $1
           OR left(
             payload->'data'->'settlement'->>'reference',
             length($2) + 1
           ) = $2 || '-'
         )
       ORDER BY received_at
       FOR UPDATE`,
      [providerSettlementId, merchantTransactionReference],
    );
    let processedCount = 0;
    for (const row of pending.rows) {
      const eventId = typeof row.payload.id === "string" ? row.payload.id : undefined;
      const eventType = typeof row.payload.type === "string" ? row.payload.type : undefined;
      const event = parsePayassureWebhookEvent(
        Buffer.from(JSON.stringify(row.payload)),
        eventId,
        eventType,
      );
      if (event.type === "payment.escrow.deposit.succeeded") continue;
      console.info("[PayAssure] Applying deferred webhook event", {
        ...webhookContext(event),
        webhookRecordId: row.id,
      });
      try {
        await applyWebhookEvent(client, event, row.id);
        processedCount += 1;
      } catch (error) {
        if (errorStatus(error) !== 404) throw error;
        console.warn("[PayAssure] Deferred webhook still has no matching checkout", {
          ...webhookContext(event),
          status: "deferred",
        });
      }
    }
    const checkoutStatus = await client.query<CheckoutStatusUpdate & {
      merchantTransactionReference: string;
    }>(
      `SELECT settlement.merchant_transaction_reference AS "merchantTransactionReference",
              sale.status AS status,
              settlement.status AS "settlementStatus",
              settlement.collection_status AS "collectionStatus",
              settlement.last_error AS "settlementError"
       FROM payassure_settlements settlement
       JOIN sales sale ON sale.id = settlement.sale_id
       WHERE settlement.provider_settlement_id = $1
          OR settlement.merchant_transaction_reference = $2
       ORDER BY CASE WHEN settlement.provider_settlement_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [providerSettlementId, merchantTransactionReference],
    );
    await client.query("COMMIT");
    const finalStatus = checkoutStatus.rows[0];
    if (finalStatus) {
      try {
        await publishCheckoutStatus(finalStatus.merchantTransactionReference);
      } catch (error) {
        console.error("[PayAssure] Could not notify checkout status listeners", error);
      }
    }
    if (processedCount > 0) {
      console.info("[PayAssure] Deferred webhooks processed", {
        providerSettlementId,
        processedCount,
        finalStatus: finalStatus ?? null,
      });
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[PayAssure] Could not roll back deferred webhook transaction", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
