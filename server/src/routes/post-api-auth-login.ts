import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.post("/api/auth/login", loginLimiter, async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password" });
    return;
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const result = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email],
    );
    const user = result.rows[0] as
      | { id: string; email: string; password_hash: string }
      | undefined;
    if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
      res.status(401).json({ error: "Incorrect email or password" });
      return;
    }

    let payassureError: string | null = null;
    if (isPayassureConfigured()) {
      try {
        await refreshPayassureSession();
        await registerPayassureWebhookUrl();
      } catch (integrationError) {
        payassureError =
          integrationError instanceof Error
            ? integrationError.message
            : "Could not connect to PayAssure";
      }
    }

    req.session.regenerate((error) => {
      if (error) {
        next(error);
        return;
      }
      req.session.userId = Number(user.id);
      req.session.email = user.email;
      req.session.save((saveError) => {
        if (saveError) {
          next(saveError);
          return;
        }
        res.json({
          email: user.email,
          ...(payassureError ? { payassureError } : {}),
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

export default router;
