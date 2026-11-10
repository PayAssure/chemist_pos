import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/sales", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.payment_method AS "paymentMethod", s.status,
              s.total_cents AS "totalCents", s.created_at AS "createdAt",
              s.payer_name AS "payerName", s.payer_phone AS "payerPhone",
              COALESCE(
                json_agg(json_build_object(
                  'productName', i.product_name,
                  'quantity', i.quantity,
                  'unitPriceCents', i.unit_price_cents,
                  'batchCode', i.batch_code,
                  'batchExpiryDate', i.batch_expiry_date
                )) FILTER (WHERE i.id IS NOT NULL),
                '[]'
              ) AS items
       FROM sales s LEFT JOIN sale_items i ON i.sale_id = s.id
       GROUP BY s.id ORDER BY s.created_at DESC LIMIT 100`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
