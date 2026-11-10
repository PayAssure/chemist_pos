import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/batches", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.product_id AS "productId", b.batch_code AS "batchCode",
              b.expiry_date AS "expiryDate", b.stock_count AS "stockCount",
              b.expiry_date IS NULL AS "expiryUnknown",
              b.expiry_date < CURRENT_DATE AS "expired",
              p.name AS "productName"
       FROM product_batches b JOIN products p ON p.id = b.product_id
       ORDER BY b.expiry_date ASC NULLS LAST, p.name, b.batch_code`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
