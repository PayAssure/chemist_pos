import type { Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import {
  parsePayassureWebhookEvent,
  type PayassureWebhookEvent,
} from "../payassure-webhook";
import { applyPayassureWebhookEvent } from "./webhook-event";

export function webhookContext(event: PayassureWebhookEvent) {
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
  event: PayassureWebhookEvent,
  eventId: number,
) {
  const saleId = await applyPayassureWebhookEvent(client, event);
  const status = await client.query(
    `SELECT sale.status AS "saleStatus",
            settlement.status AS "settlementStatus",
            settlement.collection_status AS "collectionStatus"
     FROM sales sale
     JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
     WHERE sale.id = $1`,
    [saleId],
  );
  await client.query(
    `UPDATE payassure_webhook_events
     SET status = 'processed', processed_at = NOW(), error_message = NULL
     WHERE id = $1`,
    [eventId],
  );
  return status.rows[0];
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
  await client.query("BEGIN");
  const eventId = await insertWebhookEvent(client, event);
  if (eventId === null) {
    await client.query("COMMIT");
    console.info("[PayAssure] Duplicate webhook ignored", { ...context, status: "duplicate" });
    res.status(200).json({ received: true, duplicate: true });
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
      status: "deferred",
    });
    res.status(202).json({ received: true, pending: true });
    return;
  }
  await client.query("COMMIT");
  console.info("[PayAssure] Webhook processed", {
    ...context,
    status: "processed",
    ...(checkoutStatus ?? {}),
  });
  res.status(200).json({ received: true });
}

export async function processPendingWebhookEvents(providerSettlementId: string): Promise<void> {
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
         AND payload->'data'->'settlement'->>'id' = $1
       ORDER BY received_at
       FOR UPDATE`,
      [providerSettlementId],
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
    await client.query("COMMIT");
    if (processedCount > 0) {
      console.info("[PayAssure] Deferred webhooks processed", {
        providerSettlementId,
        processedCount,
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
