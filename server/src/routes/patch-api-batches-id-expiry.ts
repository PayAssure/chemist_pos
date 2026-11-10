import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.patch("/api/batches/:id/expiry", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = batchExpirySchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide a valid batch expiry date" });
    return;
  }
  const client = await pool.connect().catch((error: unknown) => {
    next(error);
    return undefined;
  });
  if (!client) return;
  try {
    await client.query("BEGIN");
    const batchInfo = await client.query(
      "SELECT product_id FROM product_batches WHERE id = $1",
      [id],
    );
    if (!batchInfo.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Batch not found" });
      return;
    }
    await client.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [
      Number(batchInfo.rows[0].product_id),
    ]);
    const result = await client.query(
      `UPDATE product_batches SET expiry_date = $2 WHERE id = $1
       RETURNING id, product_id AS "productId", batch_code AS "batchCode",
                 expiry_date AS "expiryDate", stock_count AS "stockCount"`,
      [id, parsed.data.expiryDate],
    );
    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

export default router;
