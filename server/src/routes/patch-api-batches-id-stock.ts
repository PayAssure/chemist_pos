import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.patch("/api/batches/:id/stock", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = batchStockSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide a valid batch stock count" });
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
    const productId = Number(batchInfo.rows[0].product_id);
    const product = await client.query<{ stock_count: number }>(
      "SELECT stock_count FROM products WHERE id = $1 FOR UPDATE",
      [productId],
    );
    const batch = await client.query(
      "SELECT stock_count FROM product_batches WHERE id = $1 FOR UPDATE",
      [id],
    );
    const reservations = await client.query<{ quantity: string }>(
      `SELECT COALESCE(SUM(item.quantity), 0)::text AS quantity
       FROM sale_items item
       JOIN sales pending_sale ON pending_sale.id = item.sale_id
       WHERE pending_sale.status = 'pending' AND item.batch_id = $1`,
      [id],
    );
    if (parsed.data.stockCount < Number(reservations.rows[0].quantity)) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "Batch stock cannot be reduced below quantities reserved for pending PayAssure collections",
      });
      return;
    }
    const difference = parsed.data.stockCount - Number(batch.rows[0].stock_count);
    const reservedProductStock = await client.query<{ quantity: string }>(
      `SELECT COALESCE(SUM(item.quantity), 0)::text AS quantity
       FROM sale_items item
       JOIN sales pending_sale ON pending_sale.id = item.sale_id
       WHERE pending_sale.status = 'pending' AND item.product_id = $1`,
      [productId],
    );
    if (
      Number(product.rows[0].stock_count) + difference <
      Number(reservedProductStock.rows[0].quantity)
    ) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "Product stock cannot be reduced below quantities reserved for pending PayAssure collections",
      });
      return;
    }
    const result = await client.query(
      `UPDATE product_batches SET stock_count = $2 WHERE id = $1
       RETURNING id, product_id AS "productId", batch_code AS "batchCode",
                 expiry_date AS "expiryDate", stock_count AS "stockCount"`,
      [id, parsed.data.stockCount],
    );
    await client.query(
      "UPDATE products SET stock_count = stock_count + $2 WHERE id = $1",
      [productId, difference],
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
