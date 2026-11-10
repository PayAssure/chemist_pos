import type { Response } from "express";
import { pool } from "../db";
import {
  getRegisteredPayassureWebhookUrl,
  initiatePayassureSettlement,
} from "../payassure";
import type { CheckoutInput, CheckoutState, StagedCheckout } from "./checkout-models";

export async function submitStagedCheckout(
  staged: StagedCheckout,
  checkout: CheckoutInput,
  state: CheckoutState,
  res: Response,
): Promise<void> {
  state.payassureRequestStarted = true;
  const initiation = await initiatePayassureSettlement(staged.payload, async (savedPayload) => {
    await pool.query(
      `UPDATE payassure_settlements
       SET request_payload = $2::jsonb, updated_at = NOW()
       WHERE id = $1`,
      [staged.settlementId, JSON.stringify(savedPayload)],
    );
  });
  state.payassureAccepted = true;
  await pool.query(
    `UPDATE payassure_settlements
     SET status = CASE WHEN status = 'queued' THEN 'accepted' ELSE status END,
         last_error = NULL, provider_request_id = COALESCE(provider_request_id, $2),
         provider_settlement_id = COALESCE(provider_settlement_id, $3),
         updated_at = NOW()
     WHERE id = $1`,
    [staged.settlementId, initiation.providerRequestId, initiation.providerSettlementId],
  );
  const status = await pool.query(
    `SELECT sale.status, settlement.status AS "settlementStatus",
            settlement.collection_status AS "collectionStatus",
            settlement.last_error AS "settlementError"
     FROM sales sale
     JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
     WHERE sale.id = $1`,
    [staged.saleId],
  );
  const checkoutStatus = status.rows[0];
  if (checkoutStatus.collectionStatus === "pending") {
    console.info("[PayAssure] Checkout awaiting collection webhook", {
      saleId: staged.saleId,
      merchantTransactionReference: state.reference,
      endpoint: getRegisteredPayassureWebhookUrl() ?? "not configured",
      settlementStatus: checkoutStatus.settlementStatus,
      collectionStatus: checkoutStatus.collectionStatus,
    });
  }
  res.status(checkoutStatus.collectionStatus === "pending" ? 202 : 200).json({
    id: staged.saleId,
    paymentMethod: checkout.paymentMethod,
    reference: state.reference,
    status: checkoutStatus.status,
    totalCents: staged.totalCents,
    createdAt: staged.createdAt,
    settlementStatus: checkoutStatus.settlementStatus,
    collectionStatus: checkoutStatus.collectionStatus,
    settlementError: checkoutStatus.settlementError,
  });
}
