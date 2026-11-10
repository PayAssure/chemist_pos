import type { NextFunction, Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import { processWebhookTransaction, webhookContext } from "./webhook-transaction";

export async function processWebhookRequest(
  event: PayassureWebhookEvent,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const context = webhookContext(event);
  console.info("[PayAssure] Webhook received", { ...context, status: "received" });
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    console.error("[PayAssure] Webhook could not be processed because the database is unavailable", {
      ...context,
      status: "processing_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    next(error);
    return;
  }
  try {
    await processWebhookTransaction(client, event, res);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[PayAssure] Could not roll back webhook transaction", rollbackError);
    }
    console.error("[PayAssure] Webhook processing failed", {
      ...context,
      status: "processing_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown webhook processing error",
    });
    respondWebhookError(error, res, next);
  } finally {
    client.release();
  }
}

function respondWebhookError(error: unknown, res: Response, next: NextFunction): void {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status: unknown }).status)
    : 500;
  if (status === 404 || status === 409) {
    res.status(status).json({
      error: error instanceof Error ? error.message : "PayAssure webhook could not be applied",
    });
  } else {
    next(error);
  }
}
