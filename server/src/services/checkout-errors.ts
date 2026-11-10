import type { NextFunction, Response } from "express";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { PayassureHttpError } from "../payassure";
import type { CheckoutInput, CheckoutState } from "./checkout-models";
import { recordFailedCheckout, settlementFailureMessage } from "./checkout-helpers";

export async function handleCheckoutError(
  error: unknown,
  client: PoolClient,
  state: CheckoutState,
  checkout: CheckoutInput,
  email: string,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (state.transactionOpen) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Could not roll back checkout transaction:", rollbackError);
    }
  }
  if (state.payassureRequestStarted && !state.payassureAccepted) {
    await handlePayassureRejection(error, state, email, res, next);
    return;
  }
  if (state.payassureAccepted) {
    console.error("[PayAssure] Could not update local checkout status after PayAssure accepted initiation", {
      merchantTransactionReference: state.reference,
      saleId: state.stagedSaleId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: settlementFailureMessage(error),
    });
    res.status(500).json({
      error: "PayAssure accepted the payment request, but the POS could not refresh its status. Do not retry this checkout; check its status or contact support.",
    });
    return;
  }
  if (state.transactionOpen) {
    try {
      await recordFailedCheckout(
        email,
        checkout.paymentMethod,
        checkout.items,
        "Checkout could not be completed",
      );
    } catch (recordError) {
      console.error("Could not record failed checkout:", recordError);
    }
  }
  next(error);
}

async function handlePayassureRejection(
  error: unknown,
  state: CheckoutState,
  email: string,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const definitiveRejection =
    error instanceof PayassureHttpError && error.status >= 400 && error.status < 500;
  try {
    if (state.stagedSettlementId !== null) {
      await pool.query(
        `UPDATE payassure_settlements
         SET status = CASE WHEN status IN ('queued', 'accepted') THEN 'failed' ELSE status END,
             collection_status = CASE WHEN $3::boolean THEN 'failed' ELSE collection_status END,
             last_error = $2, updated_at = NOW()
         WHERE id = $1`,
        [state.stagedSettlementId, settlementFailureMessage(error), definitiveRejection],
      );
    }
    if (definitiveRejection && state.stagedSaleId !== null) {
      const failed = await pool.query(
        "UPDATE sales SET status = 'failed' WHERE id = $1 AND status = 'pending'",
        [state.stagedSaleId],
      );
      if (failed.rowCount) {
        await pool.query(
          `INSERT INTO failed_checkout_attempts
             (payment_method, total_cents, failure_reason, created_by)
           SELECT payment_method, total_cents, $2, $3 FROM sales WHERE id = $1`,
          [state.stagedSaleId, settlementFailureMessage(error), email],
        );
      }
    }
  } catch (persistenceError) {
    next(persistenceError);
    return;
  }
  res.status(502).json({
    error: settlementFailureMessage(error),
    reference: state.reference,
    collectionStatus: definitiveRejection ? "failed" : "pending",
  });
}
