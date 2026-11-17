import { Router } from "express";
import type { PoolClient } from "pg";
import { requireAuth } from "../auth";
import { pool } from "../db";
import {
  retailerFloatBalanceChannel,
  type RetailerFloatBalanceUpdate,
} from "../services/retailer-float-balance-events";

const router = Router();

router.get("/api/payassure/float/events", requireAuth, async (_req, res, next) => {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    next(error);
    return;
  }

  let closed = false;
  let queryInFlight = false;
  let queryQueued = false;
  const close = () => {
    if (closed) return;
    closed = true;
    client.removeListener("notification", onNotification);
    client.removeListener("error", onClientError);
    void client.query(`UNLISTEN ${retailerFloatBalanceChannel}`)
      .catch((error: unknown) => {
        console.error("[PayAssure] Could not stop retailer float balance listener", error);
      })
      .finally(() => client.release());
  };
  const sendCurrentBalance = async () => {
    if (queryInFlight) {
      queryQueued = true;
      return;
    }
    queryInFlight = true;
    try {
      do {
        queryQueued = false;
        const result = await client.query<RetailerFloatBalanceUpdate>(
          `SELECT recipient_merchant_id AS "merchantId",
                  (payload->'data'->'escrow_balance'->>'balance')::double precision AS balance,
                  (payload->'data'->'escrow_balance'->>'available_balance')::double precision
                    AS "availableBalance",
                  payload->'data'->'escrow_balance'->>'currency' AS currency,
                  COALESCE(payload->>'created_at', processed_at::text) AS "asOf"
           FROM payassure_webhook_events
           WHERE status = 'processed'
             AND jsonb_typeof(payload->'data'->'escrow_balance') = 'object'
             AND jsonb_typeof(payload->'data'->'escrow_balance'->'balance') = 'number'
             AND jsonb_typeof(payload->'data'->'escrow_balance'->'available_balance') = 'number'
             AND jsonb_typeof(payload->'data'->'escrow_balance'->'currency') = 'string'
           ORDER BY received_at DESC
           LIMIT 1`,
        );
        if (closed) return;
        const update = result.rows[0];
        if (update) {
          res.write(`event: retailer-float-balance\ndata: ${JSON.stringify(update)}\n\n`);
        } else {
          res.write(": retailer float balance event stream ready\n\n");
        }
      } while (queryQueued && !closed);
    } catch (error) {
      console.error("[PayAssure] Could not read retailer float balance for event stream", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      if (!res.writableEnded) res.end();
      close();
    } finally {
      queryInFlight = false;
    }
  };
  const onNotification = (notification: { channel?: string }) => {
    if (notification.channel === retailerFloatBalanceChannel) {
      void sendCurrentBalance();
    }
  };
  const onClientError = (error: Error) => {
    console.error("[PayAssure] Retailer float balance database listener failed", {
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
    await client.query(`LISTEN ${retailerFloatBalanceChannel}`);
    await sendCurrentBalance();
  } catch (error) {
    close();
    if (res.headersSent) {
      console.error("[PayAssure] Could not initialize retailer float balance event stream", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      res.end();
      return;
    }
    next(error);
  }
});

export default router;
