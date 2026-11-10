import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.patch("/api/products/:id", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide valid product details" });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $2, active_ingredient = $3, prescription_required = $4,
           preferred_name = $5, category = $6, dosage_form = $7,
           sale_unit = $8, units_per_pack = $9, reorder_level = $10,
           description = $11, price_cents = $12, buying_price_cents = $13
       WHERE id = $1 RETURNING id`,
      [
        id,
        parsed.data.name,
        parsed.data.activeIngredient,
        parsed.data.prescriptionRequired,
        parsed.data.preferredName,
        parsed.data.category,
        parsed.data.dosageForm,
        parsed.data.saleUnit,
        parsed.data.unitsPerPack,
        parsed.data.reorderLevel,
        parsed.data.description,
        parsed.data.priceCents,
        parsed.data.buyingPriceCents,
      ],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json({ id });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That barcode or stock code is already assigned to another product" });
      return;
    }
    next(error);
  }
});

export default router;
