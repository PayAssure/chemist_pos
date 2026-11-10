import { Router } from "express";
import * as deps from "./deps";
import type { PoolClient } from "pg";
import type { PayassureWebhookEvent } from "../payassure-webhook";
import type { StoredSettlementPayload } from "../services/settlement-payload";
const { requireAuth, pool, z, bcrypt, createHash, randomUUID, rateLimit, checkPayassureRetailerFloatBalance, getPayassureRetailerFloat, getPayassureSupplierDirectory, getPayassureParticipant, initiatePayassureRetailerFloatDeposit, initiatePayassureSettlement, isPayassureConfigured, PayassureHttpError, getRegisteredPayassureWebhookUrl, getPayassureWebhookSecret, registerPayassureWebhookUrl, refreshPayassureSession, updatePayassureParticipant, parsePayassureWebhookEvent, readPayassureWebhookRecipient, verifyPayassureWebhookSignature, loginSchema, supplierSchema, productSchema, productUpdateSchema, batchStockSchema, incomingStockSchema, batchExpirySchema, buyingPriceSchema, checkoutSchema, payassurePaymentUpdateSchema, payassureParticipantUpdateSchema, retailerFloatDepositRequestSchema, retailerFloatBalanceSchema, retailerFloatSchema, retailerFloatCheckSchema, retailerFloatDepositSchema, safePayassureParticipant, recordFailedCheckout, normalizeMpesaPhone, checkoutRequestFingerprint, settlementFailureMessage, prepareSettlementPayload, applyPayassureWebhookEvent, loginLimiter } = deps;

const router = Router();

router.get("/api/products", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.price_cents AS "priceCents",
              p.buying_price_cents AS "buyingPriceCents",
              p.stock_count AS "stockCount", p.supplier_id AS "supplierId",
              p.active_ingredient AS "activeIngredient",
              p.prescription_required AS "prescriptionRequired",
              p.brand, p.preferred_name AS "preferredName", p.category,
              p.dosage_form AS "dosageForm", p.strength, p.sale_unit AS "saleUnit",
              p.units_per_pack AS "unitsPerPack", p.reorder_level AS "reorderLevel",
              p.barcode, p.stock_code AS "stockCode", p.description,
              COALESCE((
                SELECT SUM(GREATEST(
                  b.stock_count - COALESCE((
                    SELECT SUM(reserved_item.quantity)
                    FROM sale_items reserved_item
                    JOIN sales reserved_sale ON reserved_sale.id = reserved_item.sale_id
                    WHERE reserved_sale.status = 'pending'
                      AND reserved_item.batch_id = b.id
                  ), 0),
                  0
                ))::integer
                FROM product_batches b
                WHERE b.product_id = p.id AND b.expiry_date >= CURRENT_DATE
              ), 0) AS "saleableCount",
                      s.name AS "supplierName",
                      s.payassure_merchant_id AS "merchantId"
       FROM products p JOIN suppliers s ON s.id = p.supplier_id
       ORDER BY p.name`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
