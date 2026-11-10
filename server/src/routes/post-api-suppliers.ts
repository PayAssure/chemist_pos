import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.post("/api/suppliers", requireAuth, async (req, res, next) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a supplier name and valid PayAssure enrollment details" });
    return;
  }
  try {
    const result = await pool.query(
      `INSERT INTO suppliers
         (name, payassure_merchant_id, payassure_enrolled, contact_name, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, payassure_merchant_id AS "merchantId",
                 payassure_enrolled AS "payassureEnrolled",
                 contact_name AS "contactName", phone, email, address`,
      [
        parsed.data.name,
        parsed.data.payassureEnrolled ? parsed.data.merchantId : null,
        parsed.data.payassureEnrolled,
        parsed.data.contactName,
        parsed.data.phone,
        parsed.data.email,
        parsed.data.address,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
