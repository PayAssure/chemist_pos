import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

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
