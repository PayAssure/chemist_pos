import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check database query failed:", error);
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

export default router;
