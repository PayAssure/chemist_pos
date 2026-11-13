import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
import {
  checkoutStatusChannel,
  type CheckoutStatusUpdate,
} from "../services/checkout-status-events";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/checkout/:reference/events", requireAuth, async (req, res, next) => {
  const reference = String(req.params.reference);
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    next(error);
    return;
  }
  let closed = false;
  let statusQueryInFlight = false;
  let statusQueryQueued = false;
  const close = () => {
    if (closed) return;
    closed = true;
    console.info("[PayAssure] Checkout status event stream closing", {
      merchantTransactionReference: reference,
      responseFinished: res.writableFinished,
    });
    client.removeListener("notification", onNotification);
    client.removeListener("error", onClientError);
    void client.query(`UNLISTEN ${checkoutStatusChannel}`)
      .catch((error: unknown) => {
        console.error("[PayAssure] Could not stop checkout status listener", error);
      })
      .finally(() => client.release());
  };
  const sendCurrentStatus = async () => {
    if (statusQueryInFlight) {
      statusQueryQueued = true;
      return;
    }
    statusQueryInFlight = true;
    try {
      do {
        statusQueryQueued = false;
        const status = await client.query<CheckoutStatusUpdate>(
          `SELECT sale.status AS status,
                  settlement.status AS "settlementStatus",
                  settlement.collection_status AS "collectionStatus",
                  settlement.last_error AS "settlementError"
           FROM sales sale
           JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
           WHERE settlement.merchant_transaction_reference = $1`,
          [reference],
        );
        if (closed) return;
        const current = status.rows[0];
        if (!current) {
          console.info("[PayAssure] Checkout status stream has no matching checkout yet", {
            merchantTransactionReference: reference,
          });
          res.write(": checkout event stream ready\n\n");
        } else {
          const writable = res.write(
            `event: checkout-status\ndata: ${JSON.stringify(current)}\n\n`,
          );
          console.info("[PayAssure] Checkout status event written to response", {
            merchantTransactionReference: reference,
            status: current.status,
            settlementStatus: current.settlementStatus,
            collectionStatus: current.collectionStatus,
            writeAccepted: writable,
          });
          if (current.status !== "pending") {
            res.end();
            close();
            return;
          }
        }
      } while (statusQueryQueued && !closed);
    } catch (error) {
      console.error("[PayAssure] Could not read checkout status for event stream", error);
      if (!res.writableEnded) res.end();
      close();
    } finally {
      statusQueryInFlight = false;
    }
  };
  const onNotification = (notification: { channel?: string; payload?: string }) => {
    if (notification.channel === checkoutStatusChannel && notification.payload === reference) {
      console.info("[PayAssure] Checkout status database notification received", {
        merchantTransactionReference: reference,
        channel: notification.channel,
      });
      void sendCurrentStatus();
    }
  };
  const onClientError = (error: Error) => {
    console.error("[PayAssure] Checkout status database listener failed", error);
    if (!res.writableEnded) res.end();
    close();
  };

  client.on("notification", onNotification);
  client.on("error", onClientError);
  res.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.on("close", close);

  try {
    await client.query(`LISTEN ${checkoutStatusChannel}`);
    console.info("[PayAssure] Checkout status event stream connected", {
      merchantTransactionReference: reference,
    });
    await sendCurrentStatus();
  } catch (error) {
    close();
    if (res.headersSent) {
      console.error("[PayAssure] Could not initialize checkout event stream", error);
      res.end();
      return;
    }
    next(error);
  }
});

router.get("/api/checkout/:reference/status", requireAuth, async (req, res, next) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  try {
    const reference = String(req.params.reference);
    const sale = await pool.query(
      `SELECT sale.id, sale.payment_method AS "paymentMethod", sale.status,
              sale.total_cents AS "totalCents", sale.created_at AS "createdAt",
              settlement.status AS "settlementStatus",
              settlement.collection_status AS "collectionStatus",
              settlement.last_error AS "settlementError"
       FROM sales sale
       JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
       WHERE settlement.merchant_transaction_reference = $1
          OR ($2::boolean AND sale.id = $3::integer)`,
      [reference, /^\d+$/.test(reference), /^\d+$/.test(reference) ? Number(reference) : 0],
    );
    if (sale.rowCount) {
      res.json(sale.rows[0]);
      return;
    }
    res.status(404).json({ error: "Checkout not found" });
  } catch (error) {
    next(error);
  }
});

export default router;
