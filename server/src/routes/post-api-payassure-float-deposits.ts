import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
import {
  floatDepositStatusChannel,
  type FloatDepositStatusUpdate,
} from "../services/float-deposit-status-events";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/payassure/float/deposits/:depositId/events", requireAuth, async (req, res, next) => {
  const depositId = String(req.params.depositId);
  let client: PoolClient;
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
    client.removeListener("notification", onNotification);
    client.removeListener("error", onClientError);
    void client.query(`UNLISTEN ${floatDepositStatusChannel}`)
      .catch((error: unknown) => {
        console.error("[PayAssure] Could not stop float deposit status listener", error);
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
        const status = await client.query<FloatDepositStatusUpdate>(
          `SELECT payload->'data'->'deposit'->>'id' AS "depositId",
                  (payload->'data'->'deposit'->>'amount')::double precision AS amount,
                  payload->'data'->'deposit'->>'currency' AS currency,
                  payload->'data'->'deposit'->>'receipt_number' AS "receiptNumber",
                  payload->'data'->'deposit'->>'completed_at' AS "completedAt"
           FROM payassure_webhook_events
           WHERE event_type = 'payment.escrow.deposit.succeeded'
             AND status = 'processed'
             AND payload->'data'->'deposit'->>'id' = $1
           ORDER BY received_at DESC
           LIMIT 1`,
          [depositId],
        );
        if (closed) return;
        const current = status.rows[0];
        if (!current) {
          res.write(": float deposit event stream ready\n\n");
        } else {
          res.write(`event: float-deposit-status\ndata: ${JSON.stringify(current)}\n\n`);
          res.end();
          close();
          return;
        }
      } while (statusQueryQueued && !closed);
    } catch (error) {
      console.error("[PayAssure] Could not read float deposit status for event stream", {
        depositId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      if (!res.writableEnded) res.end();
      close();
    } finally {
      statusQueryInFlight = false;
    }
  };
  const onNotification = (notification: { channel?: string; payload?: string }) => {
    if (
      notification.channel === floatDepositStatusChannel &&
      notification.payload === depositId
    ) {
      void sendCurrentStatus();
    }
  };
  const onClientError = (error: Error) => {
    console.error("[PayAssure] Float deposit status database listener failed", {
      depositId,
      message: error.message,
    });
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
    await client.query(`LISTEN ${floatDepositStatusChannel}`);
    await sendCurrentStatus();
  } catch (error) {
    close();
    if (res.headersSent) {
      console.error("[PayAssure] Could not initialize float deposit event stream", {
        depositId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      res.end();
      return;
    }
    next(error);
  }
});

router.post("/api/payassure/float/deposits", requireAuth, async (req, res) => {
  const parsed = retailerFloatDepositRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Provide a positive whole-KES amount and a valid payer phone number",
    });
    return;
  }
  try {
    const deposit = await initiatePayassureRetailerFloatDeposit(
      parsed.data.amount,
      parsed.data.payerPhoneNumber,
    );
    res.status(201).json(retailerFloatDepositSchema.parse(deposit));
  } catch (error) {
    const upstreamClientError =
      error instanceof PayassureHttpError && [400, 401, 403, 404, 409].includes(error.status);
    res.status(upstreamClientError ? error.status : isPayassureConfigured() ? 502 : 503).json({
      error: error instanceof Error ? error.message : "Could not submit PayAssure float deposit",
    });
  }
});

export default router;
