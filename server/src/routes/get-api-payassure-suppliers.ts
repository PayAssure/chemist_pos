import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/payassure/suppliers", requireAuth, async (_req, res) => {
  try {
    const directory = z.object({
      success: z.literal(true),
      suppliers: z.array(z.object({
        merchantId: z.string().trim().min(1).max(200),
        businessName: z.string().trim().min(1).max(120),
        contactName: z.string().trim().max(120).nullish().transform((value) => value ?? ""),
        email: z.string().trim().max(254).nullish().transform((value) => value ?? ""),
        phoneNumber: z.string().trim().max(30).nullish().transform((value) => value ?? ""),
        physicalAddress: z.string().trim().max(300).nullish().transform((value) => value ?? ""),
      })),
    }).parse(await getPayassureSupplierDirectory());
    res.json({
      suppliers: directory.suppliers.map(({
        businessName,
        merchantId,
        contactName,
        email,
        phoneNumber,
        physicalAddress,
      }) => ({
        name: businessName,
        merchantId,
        contactName,
        phone: phoneNumber,
        email,
        address: physicalAddress,
      })),
    });
  } catch (error) {
    res.status(isPayassureConfigured() ? 502 : 503).json({
      error: error instanceof Error ? error.message : "Could not load PayAssure suppliers",
    });
  }
});

export default router;
