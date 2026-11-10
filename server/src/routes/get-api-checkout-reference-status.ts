import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

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
