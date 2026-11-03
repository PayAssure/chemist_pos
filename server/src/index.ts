import "dotenv/config";
import bcrypt from "bcryptjs";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAuth } from "./auth";
import { initializeDatabase, pool } from "./db";
import {
  getPayassureSupplierDirectory,
  getPayassureParticipant,
  initiatePayassureSettlement,
  isPayassureConfigured,
  PayassureHttpError,
  getPayassureWebhookSecret,
  registerPayassureWebhookUrl,
  type PayassureSettlementPayload,
  refreshPayassureSession,
  updatePayassureParticipant,
} from "./payassure";
import {
  parsePayassureWebhookEvent,
  readPayassureWebhookRecipient,
  verifyPayassureWebhookSignature,
  type PayassureWebhookEvent,
} from "./payassure-webhook";

const app = express();
const PgSession = connectPgSimple(session);
const port = Number(process.env.PORT ?? 3000);
const sessionSecret = process.env.SESSION_SECRET;

app.use("/webhook", express.raw({ type: "application/json", limit: "64kb" }));

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must be set to at least 32 characters");
}

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});
const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  payassureEnrolled: z.boolean(),
  merchantId: z.string().trim().max(200).default(""),
  contactName: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().max(254).refine(
    (value) => !value || z.email().safeParse(value).success,
    "Provide a valid supplier email address",
  ).default(""),
  address: z.string().trim().max(300).default(""),
}).superRefine((supplier, context) => {
  if (supplier.payassureEnrolled && !supplier.merchantId) {
    context.addIssue({
      code: "custom",
      path: ["merchantId"],
      message: "A PayAssure merchant ID is required for enrolled suppliers",
    });
  }
  if (!supplier.payassureEnrolled && supplier.merchantId) {
    context.addIssue({
      code: "custom",
      path: ["merchantId"],
      message: "Non-enrolled suppliers cannot have a PayAssure merchant ID",
    });
  }
});
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  activeIngredient: z.string().trim().max(160).default(""),
  prescriptionRequired: z.boolean().default(false),
  brand: z.string().trim().max(120).default(""),
  preferredName: z.string().trim().max(120).default(""),
  category: z.string().trim().min(1).max(80).default("Medicine"),
  dosageForm: z.string().trim().max(80).default(""),
  strength: z.string().trim().max(80).default(""),
  saleUnit: z.enum(["single", "kit", "bottle", "blister_pack", "tin", "pack", "box"]).default("single"),
  unitsPerPack: z.number().int().positive().max(2147483647).nullable().default(null),
  reorderLevel: z.number().int().min(0).max(2147483647).default(5),
  barcode: z.string().trim().max(120).nullable().default(null),
  stockCode: z.string().trim().max(80).nullable().default(null),
  description: z.string().trim().max(1000).default(""),
  supplierId: z.number().int().positive(),
  priceCents: z.number().int().positive().max(2147483647),
  buyingPriceCents: z.number().int().positive().max(2147483647),
  stockCount: z.number().int().min(0).max(2147483647),
  batchCode: z.string().trim().min(1).max(80),
  expiryDate: z.string().date(),
});
const productUpdateSchema = productSchema.pick({
  name: true,
  activeIngredient: true,
  prescriptionRequired: true,
  preferredName: true,
  category: true,
  dosageForm: true,
  saleUnit: true,
  unitsPerPack: true,
  reorderLevel: true,
  description: true,
  priceCents: true,
}).extend({
  buyingPriceCents: z.number().int().positive().max(2147483647).nullable(),
});
const batchStockSchema = z.object({
  stockCount: z.number().int().min(0).max(2147483647),
});
const incomingStockSchema = z.object({
  incomingStock: z.number().int().positive().max(2147483647),
});
const batchExpirySchema = z.object({
  expiryDate: z.string().date(),
});
const buyingPriceSchema = z.object({
  buyingPriceCents: z.number().int().positive().max(2147483647),
});
const checkoutSchema = z.object({
  paymentMethod: z.enum(["cash", "mpesa", "credit"]),
  merchantTransactionReference: z.string().trim().min(1).max(120).optional(),
  payerName: z.string().trim().max(120).optional(),
  payerPhone: z.string().trim().max(30).optional(),
  prescriptionReference: z.string().trim().max(120).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive().max(2147483647),
      }),
    )
    .min(1)
    .max(100),
}).superRefine((checkout, context) => {
  if (checkout.paymentMethod === "credit") {
    if (!checkout.payerName) {
      context.addIssue({
        code: "custom",
        path: ["payerName"],
        message: "Payer name is required for credit sales",
      });
    }
    if (!checkout.payerPhone || checkout.payerPhone.replace(/\D/g, "").length < 7) {
      context.addIssue({
        code: "custom",
        path: ["payerPhone"],
        message: "A valid payer phone number is required for credit sales",
      });
    }
  }
  if (
    checkout.paymentMethod === "mpesa" &&
    (!checkout.payerPhone || checkout.payerPhone.replace(/\D/g, "").length < 9)
  ) {
    context.addIssue({
      code: "custom",
      path: ["payerPhone"],
      message: "A valid customer phone number is required for M-Pesa",
    });
  }
});
const payassurePaymentUpdateSchema = z.object({
  type: z.enum(["BANK", "MPESA"]).optional(),
  accountName: z.string().trim().max(120).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  bankCode: z.string().trim().max(30).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  shortcode: z.string().trim().max(30).optional(),
  provider: z.string().trim().max(120).optional(),
}).strict().refine((payment) => Object.keys(payment).length > 0);
const payassureParticipantUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(200).optional(),
  registrationNumber: z.string().trim().max(120).optional(),
  kraPin: z.string().trim().max(80).optional(),
  businessType: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
  physicalAddress: z.string().trim().max(300).optional(),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().email().max(254).optional(),
  phoneNumber: z.string().trim().max(30).optional(),
  settlementMethod: z.string().trim().max(40).optional(),
  settlementAccount: z.string().trim().max(120).optional(),
  payment: payassurePaymentUpdateSchema.optional(),
}).strict().refine((participant) => Object.keys(participant).length > 0);

function safePayassureParticipant(value: unknown): unknown {
  function sanitize(participantValue: unknown): unknown {
    if (!participantValue || typeof participantValue !== "object" || Array.isArray(participantValue)) {
      return participantValue;
    }
    const participant = participantValue as Record<string, unknown>;
    const integrationValue = participant.integration;
    const integration =
      integrationValue && typeof integrationValue === "object"
        ? integrationValue as Record<string, unknown>
        : null;
    const paymentValue = participant.payment;
    const payment =
      paymentValue && typeof paymentValue === "object"
        ? paymentValue as Record<string, unknown>
        : null;
    return {
      id: participant.id,
      participantType: participant.participantType,
      businessName: participant.businessName,
      businessType: participant.businessType,
      contactName: participant.contactName,
      email: participant.email,
      status: participant.status,
      createdAt: participant.createdAt,
      updatedAt: participant.updatedAt,
      integration: integration
        ? {
            apiKey: integration.apiKey,
            apiSecret: integration.apiSecret,
            merchantId: integration.merchantId,
            environment: integration.environment,
            isActive: integration.isActive,
            createdAt: integration.createdAt,
          }
        : null,
      payment: payment
        ? {
            type: payment.type,
            accountName: payment.accountName,
            status: payment.status,
            isVerified: payment.isVerified,
            provider: payment.provider,
            bankCode: payment.bankCode,
            accountNumber: payment.accountNumber,
            shortcode: payment.shortcode,
            phoneNumber: payment.phoneNumber,
          }
        : null,
    };
  }
  return Array.isArray(value) ? value.map(sanitize) : sanitize(value);
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check database query failed:", error);
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
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

app.post("/api/auth/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ email: req.session.email });
});

app.get("/api/payassure/me", requireAuth, async (_req, res) => {
  try {
    const participant = await getPayassureParticipant();
    res.json(safePayassureParticipant(participant));
  } catch (error) {
    res.status(isPayassureConfigured() ? 502 : 503).json({
      error: error instanceof Error ? error.message : "Could not load PayAssure participant",
    });
  }
});

app.get("/api/payassure/suppliers", requireAuth, async (_req, res) => {
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

app.patch("/api/payassure/me", requireAuth, async (req, res) => {
  const parsed = payassureParticipantUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide valid PayAssure participant fields to update" });
    return;
  }
  try {
    const participant = await updatePayassureParticipant(parsed.data);
    res.json(safePayassureParticipant(participant));
  } catch (error) {
    const upstreamClientError =
      error instanceof PayassureHttpError && [400, 403, 404].includes(error.status);
    res.status(upstreamClientError ? error.status : isPayassureConfigured() ? 502 : 503).json({
      error: error instanceof Error ? error.message : "Could not update PayAssure participant",
    });
  }
});

app.get("/api/suppliers", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, payassure_merchant_id AS "merchantId",
              payassure_enrolled AS "payassureEnrolled",
              contact_name AS "contactName", phone, email, address
       FROM suppliers ORDER BY name`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/suppliers", requireAuth, async (req, res, next) => {
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

app.get("/api/products", requireAuth, async (_req, res, next) => {
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

app.get("/api/batches", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.product_id AS "productId", b.batch_code AS "batchCode",
              b.expiry_date AS "expiryDate", b.stock_count AS "stockCount",
              b.expiry_date IS NULL AS "expiryUnknown",
              b.expiry_date < CURRENT_DATE AS "expired",
              p.name AS "productName"
       FROM product_batches b JOIN products p ON p.id = b.product_id
       ORDER BY b.expiry_date ASC NULLS LAST, p.name, b.batch_code`,
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", requireAuth, async (req, res, next) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a valid product and supplier" });
    return;
  }
  const client = await pool.connect().catch((error: unknown) => {
    next(error);
    return undefined;
  });
  if (!client) return;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO products
         (name, supplier_id, price_cents, buying_price_cents, stock_count,
          active_ingredient, prescription_required, brand, preferred_name, category,
          dosage_form, strength, sale_unit, units_per_pack, reorder_level, barcode,
          stock_code, description)
       SELECT $1, s.id, $15, $16, $17, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $18 FROM suppliers s WHERE s.id = $2
       RETURNING id`,
      [
        parsed.data.name,
        parsed.data.supplierId,
        parsed.data.activeIngredient,
        parsed.data.prescriptionRequired,
        parsed.data.brand,
        parsed.data.preferredName,
        parsed.data.category,
        parsed.data.dosageForm,
        parsed.data.strength,
        parsed.data.saleUnit,
        parsed.data.unitsPerPack,
        parsed.data.reorderLevel,
        parsed.data.barcode || null,
        parsed.data.stockCode || null,
        parsed.data.priceCents,
        parsed.data.buyingPriceCents,
        parsed.data.stockCount,
        parsed.data.description,
      ],
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Choose a valid supplier" });
      return;
    }
    const productId = Number(result.rows[0].id);
    await client.query(
      `INSERT INTO product_batches (product_id, batch_code, expiry_date, stock_count)
       VALUES ($1, $2, $3, $4)`,
      [
        productId,
        parsed.data.batchCode,
        parsed.data.expiryDate,
        parsed.data.stockCount,
      ],
    );
    await client.query("COMMIT");
    res.status(201).json({
      id: productId,
      name: parsed.data.name,
      supplierId: parsed.data.supplierId,
      priceCents: parsed.data.priceCents,
      buyingPriceCents: parsed.data.buyingPriceCents,
      stockCount: parsed.data.stockCount,
      activeIngredient: parsed.data.activeIngredient,
      prescriptionRequired: parsed.data.prescriptionRequired,
      brand: parsed.data.brand,
      preferredName: parsed.data.preferredName,
      category: parsed.data.category,
      dosageForm: parsed.data.dosageForm,
      strength: parsed.data.strength,
      saleUnit: parsed.data.saleUnit,
      unitsPerPack: parsed.data.unitsPerPack,
      reorderLevel: parsed.data.reorderLevel,
      barcode: parsed.data.barcode,
      stockCode: parsed.data.stockCode,
      description: parsed.data.description,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That barcode or stock code is already assigned to another product" });
      return;
    }
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/api/products/:id", requireAuth, async (req, res, next) => {
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

app.post("/api/batches/:id/stock", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = incomingStockSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide a valid incoming stock quantity" });
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
    const product = await client.query(
      "SELECT stock_count FROM products WHERE id = $1 FOR UPDATE",
      [productId],
    );
    if (!product.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const batch = await client.query(
      "SELECT stock_count FROM product_batches WHERE id = $1 FOR UPDATE",
      [id],
    );
    const incomingStock = parsed.data.incomingStock;
    const nextBatchStock = Number(batch.rows[0].stock_count) + incomingStock;
    const nextProductStock = Number(product.rows[0].stock_count) + incomingStock;
    if (nextBatchStock > 2147483647 || nextProductStock > 2147483647) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Incoming stock exceeds the maximum supported quantity" });
      return;
    }
    const result = await client.query(
      `UPDATE product_batches SET stock_count = $2 WHERE id = $1
       RETURNING id, product_id AS "productId", batch_code AS "batchCode",
                 expiry_date AS "expiryDate", stock_count AS "stockCount"`,
      [id, nextBatchStock],
    );
    await client.query(
      "UPDATE products SET stock_count = stock_count + $2 WHERE id = $1",
      [productId, incomingStock],
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

app.patch("/api/batches/:id/expiry", requireAuth, async (req, res, next) => {
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

app.patch("/api/products/:id/buying-price", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = buyingPriceSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide a valid product and buying price" });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE products SET buying_price_cents = $2
       WHERE id = $1 RETURNING id, buying_price_cents AS "buyingPriceCents"`,
      [id, parsed.data.buyingPriceCents],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/batches/:id/stock", requireAuth, async (req, res, next) => {
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

async function recordFailedCheckout(
  email: string,
  paymentMethod: "cash" | "mpesa" | "credit",
  items: Array<{ productId: number; quantity: number }>,
  failureReason: string,
): Promise<void> {
  const total = await pool.query(
    `SELECT COUNT(*) AS "matchedProducts",
            COALESCE(SUM(p.price_cents::bigint * requested.quantity), 0)::text AS "totalCents"
     FROM jsonb_to_recordset($1::jsonb)
       AS requested("productId" integer, quantity integer)
     JOIN products p ON p.id = requested."productId"`,
    [JSON.stringify(items)],
  );
  const totalCents =
    Number(total.rows[0].matchedProducts) === items.length
      ? Number(total.rows[0].totalCents)
      : null;
  await pool.query(
    `INSERT INTO failed_checkout_attempts
       (payment_method, total_cents, failure_reason, created_by)
     VALUES ($1, $2, $3, $4)`,
    [paymentMethod, totalCents, failureReason, email],
  );
}

function normalizeMpesaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^(07|01)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^(7|1)\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan M-Pesa phone number");
}

function checkoutRequestFingerprint(
  checkout: z.infer<typeof checkoutSchema>,
  normalizedMpesaPhone: string | null,
): string {
  const requestedQuantities = new Map<number, number>();
  for (const item of checkout.items) {
    requestedQuantities.set(
      item.productId,
      (requestedQuantities.get(item.productId) ?? 0) + item.quantity,
    );
  }
  const details = {
    paymentMethod: checkout.paymentMethod,
    items: [...requestedQuantities]
      .sort(([productIdA], [productIdB]) => productIdA - productIdB)
      .map(([productId, quantity]) => ({ productId, quantity })),
    payerName: checkout.payerName?.trim() ?? null,
    payerPhone: normalizedMpesaPhone ?? checkout.payerPhone?.trim() ?? null,
    prescriptionReference: checkout.prescriptionReference?.trim() ?? null,
  };
  return createHash("sha256").update(JSON.stringify(details)).digest("hex");
}

function settlementFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown PayAssure settlement error";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/("(?:apiKey|apiSecret|token|accessToken|refreshToken)"\s*:\s*")[^"]+/gi, "$1[REDACTED]");
}

type StoredSettlementPayload = Omit<PayassureSettlementPayload, "items"> & {
  items: Array<
    Omit<PayassureSettlementPayload["items"][number], "supplierAmount" | "retailerAmount"> & {
      supplierAmount: number | null;
      retailerAmount: number | null;
    }
  >;
};

async function prepareSettlementPayload(
  saleId: number,
  payload: StoredSettlementPayload,
  client?: PoolClient,
): Promise<PayassureSettlementPayload> {
  const query = `SELECT s.total_cents::text AS "totalCents",
            COALESCE(supplier.payassure_merchant_id, '') AS "supplierMerchantId",
            supplier.name AS "supplierName",
            supplier.payassure_enrolled AS "supplierEnrolled",
            COALESCE(NULLIF(p.stock_code, ''), NULLIF(p.barcode, ''),
                     'POS-PRODUCT-' || i.product_id::text) AS "itemReference",
            CASE WHEN BOOL_OR(COALESCE(
              i.buying_unit_price_cents, p.buying_price_cents
            ) IS NULL) THEN NULL ELSE SUM(
              COALESCE(i.buying_unit_price_cents, p.buying_price_cents)::bigint * i.quantity
            )::text END AS "supplierAmountCents",
            CASE WHEN BOOL_OR(COALESCE(
              i.buying_unit_price_cents, p.buying_price_cents
            ) IS NULL) THEN NULL ELSE SUM(
              (i.unit_price_cents::bigint -
                COALESCE(i.buying_unit_price_cents, p.buying_price_cents)::bigint)
              * i.quantity
            )::text END AS "retailerAmountCents",
            BOOL_OR(COALESCE(
              i.buying_unit_price_cents, p.buying_price_cents
            ) IS NULL) AS "missingBuyingPrice"
     FROM sale_items i
     JOIN sales s ON s.id = i.sale_id
     JOIN products p ON p.id = i.product_id
     JOIN suppliers supplier ON supplier.id = COALESCE(i.supplier_id, p.supplier_id)
     WHERE i.sale_id = $1
     GROUP BY s.total_cents, i.product_id, p.stock_code, p.barcode,
              supplier.payassure_merchant_id, supplier.name, supplier.payassure_enrolled
     ORDER BY i.product_id`;
  const values = [saleId];
  const result = client
    ? await client.query<{
    totalCents: string;
    supplierMerchantId: string;
    supplierName: string;
    supplierEnrolled: boolean;
    itemReference: string;
    supplierAmountCents: string | null;
    retailerAmountCents: string | null;
    missingBuyingPrice: boolean;
  }>(query, values)
    : await pool.query<{
        totalCents: string;
        supplierMerchantId: string;
        supplierName: string;
        supplierEnrolled: boolean;
        itemReference: string;
        supplierAmountCents: string | null;
        retailerAmountCents: string | null;
        missingBuyingPrice: boolean;
      }>(query, values);
  if (result.rows.length === 0) {
    throw new Error("Cannot initiate settlement: the sale has no recorded items");
  }
  const items = result.rows.map((line) => {
    if (line.missingBuyingPrice || line.supplierAmountCents === null || line.retailerAmountCents === null) {
      throw new Error(
        `Cannot initiate settlement: set a buying price for products supplied by ${line.supplierName}, then retry`,
      );
    }
    if (!line.supplierEnrolled || !line.supplierMerchantId) {
      throw new Error(
        `Cannot initiate settlement: supplier ${line.supplierName} is not enrolled with a PayAssure merchant ID`,
      );
    }
    const supplierAmountCents = Number(line.supplierAmountCents);
    const retailerAmountCents = Number(line.retailerAmountCents);
    if (retailerAmountCents < 0) {
      throw new Error(
        `Cannot initiate settlement: buying price exceeds the sale price for ${line.itemReference}`,
      );
    }
    return {
      supplierMerchantId: line.supplierMerchantId,
      itemReference: line.itemReference,
      supplierAmountCents,
      retailerAmountCents,
      supplierAmount: Number((supplierAmountCents / 100).toFixed(2)),
      retailerAmount: Number((retailerAmountCents / 100).toFixed(2)),
    };
  });
  const itemAmountCents = items.reduce(
    (sum, item) => sum + item.supplierAmountCents + item.retailerAmountCents,
    0,
  );
  if (itemAmountCents !== Number(result.rows[0].totalCents)) {
    throw new Error("Cannot initiate settlement: item amounts do not match the sale total");
  }
  return {
    ...payload,
    items: items.map(({ supplierAmountCents: _supplierCents, retailerAmountCents: _retailerCents, ...item }) => item),
  };
}

async function applyPayassureWebhookEvent(
  client: PoolClient,
  event: PayassureWebhookEvent,
): Promise<void> {
  const result = await client.query<{
    id: number;
    status: "completed" | "pending" | "failed";
    totalCents: number;
    collectionStatus: "pending" | "succeeded" | "failed";
    settlementStatus: string;
    lastEventAt: string | null;
  }>(
    `SELECT sale.id, sale.status, sale.total_cents AS "totalCents",
            settlement.collection_status AS "collectionStatus",
            settlement.status AS "settlementStatus",
            settlement.last_event_at AS "lastEventAt"
     FROM payassure_settlements settlement
     JOIN sales sale ON sale.id = settlement.sale_id
     WHERE settlement.merchant_transaction_reference = $1
     FOR UPDATE OF settlement, sale`,
    [event.merchantTransactionReference],
  );
  const sale = result.rows[0];
  if (!sale) throw Object.assign(new Error("No matching checkout for this PayAssure event"), { status: 404 });
  if (
    event.currency !== "KES" ||
    Math.round(event.amount * 100) !== Number(sale.totalCents)
  ) {
    throw Object.assign(new Error("PayAssure event amount or currency does not match the checkout"), {
      status: 409,
    });
  }

  const eventTime = event.createdAt ? new Date(event.createdAt) : null;
  const isStaleSettlementEvent =
    eventTime !== null &&
    sale.lastEventAt !== null &&
    eventTime.getTime() < new Date(sale.lastEventAt).getTime();

  if (event.type === "payment.collection.succeeded") {
    if (sale.collectionStatus !== "succeeded") {
      const itemResult = await client.query<{
        productId: number;
        batchId: number | null;
        quantity: number;
      }>(
        `SELECT product_id AS "productId", batch_id AS "batchId",
                SUM(quantity)::integer AS quantity
         FROM sale_items
         WHERE sale_id = $1
         GROUP BY product_id, batch_id
         ORDER BY product_id, batch_id`,
        [sale.id],
      );
      if (!itemResult.rows.length || itemResult.rows.some((item) => item.batchId === null)) {
        throw new Error("Cannot confirm collection: sale inventory allocation is incomplete");
      }

      const productIds = [...new Set(itemResult.rows.map((item) => item.productId))].sort((a, b) => a - b);
      const batchIds = [...new Set(itemResult.rows.map((item) => item.batchId!))].sort((a, b) => a - b);
      await client.query(
        "SELECT id FROM products WHERE id = ANY($1::integer[]) ORDER BY id FOR UPDATE",
        [productIds],
      );
      await client.query(
        "SELECT id FROM product_batches WHERE id = ANY($1::integer[]) ORDER BY id FOR UPDATE",
        [batchIds],
      );

      const stockResult = await client.query<{
        productId: number;
        batchId: number;
        quantity: number;
        productStock: number;
        batchStock: number;
        pendingProduct: string;
        pendingBatch: string;
      }>(
        `SELECT item.product_id AS "productId", item.batch_id AS "batchId",
                SUM(item.quantity)::integer AS quantity,
                product.stock_count AS "productStock",
                batch.stock_count AS "batchStock",
                COALESCE((
                  SELECT SUM(other_item.quantity)
                  FROM sale_items other_item
                  JOIN sales other_sale ON other_sale.id = other_item.sale_id
                  WHERE other_sale.status = 'pending'
                    AND other_sale.id <> $1
                    AND other_item.product_id = item.product_id
                ), 0)::text AS "pendingProduct",
                COALESCE((
                  SELECT SUM(other_item.quantity)
                  FROM sale_items other_item
                  JOIN sales other_sale ON other_sale.id = other_item.sale_id
                  WHERE other_sale.status = 'pending'
                    AND other_sale.id <> $1
                    AND other_item.batch_id = item.batch_id
                ), 0)::text AS "pendingBatch"
         FROM sale_items item
         JOIN products product ON product.id = item.product_id
         JOIN product_batches batch ON batch.id = item.batch_id
         WHERE item.sale_id = $1
         GROUP BY item.product_id, item.batch_id, product.stock_count, batch.stock_count
         ORDER BY item.product_id, item.batch_id`,
        [sale.id],
      );
      const productStock = new Map<number, { stock: number; pending: number }>();
      const requiredByProduct = new Map<number, number>();
      for (const stock of stockResult.rows) {
         if (stock.batchStock - Number(stock.pendingBatch) < stock.quantity) {
           throw new Error("Cannot confirm collection: reserved inventory is no longer available");
         }
         productStock.set(stock.productId, {
           stock: stock.productStock,
           pending: Number(stock.pendingProduct),
         });
         requiredByProduct.set(
           stock.productId,
           (requiredByProduct.get(stock.productId) ?? 0) + stock.quantity,
        );
        await client.query(
          "UPDATE product_batches SET stock_count = stock_count - $2 WHERE id = $1",
          [stock.batchId, stock.quantity],
        );
      }
      for (const [productId, quantity] of requiredByProduct) {
        const available = productStock.get(productId);
        if (!available || available.stock - available.pending < quantity) {
          throw new Error("Cannot confirm collection: reserved product inventory is no longer available");
        }
        await client.query(
          "UPDATE products SET stock_count = stock_count - $2 WHERE id = $1",
          [productId, quantity],
        );
      }
      await client.query(
        "UPDATE sales SET status = 'completed' WHERE id = $1 AND status IN ('pending', 'failed')",
        [sale.id],
      );
    }

    await client.query(
      `UPDATE payassure_settlements
       SET collection_status = 'succeeded',
           status = CASE WHEN status IN ('queued', 'accepted') THEN 'processing' ELSE status END,
           provider_settlement_id = $2,
           last_error = NULL,
           last_event_type = $3,
           last_event_payload = $4::jsonb,
           last_event_at = COALESCE($5::timestamptz, last_event_at),
           updated_at = NOW()
       WHERE sale_id = $1`,
      [sale.id, event.settlementId, event.type, JSON.stringify(event.payload), event.createdAt],
    );
    return;
  }

  if (event.type === "payment.collection.failed") {
    if (sale.collectionStatus !== "succeeded") {
      const failedSale = await client.query(
        "UPDATE sales SET status = 'failed' WHERE id = $1 AND status = 'pending'",
        [sale.id],
      );
      await client.query(
        `UPDATE payassure_settlements
         SET collection_status = 'failed', status = 'failed',
             last_error = $2, provider_settlement_id = $3,
             last_event_type = $4, last_event_payload = $5::jsonb,
             last_event_at = COALESCE($6::timestamptz, last_event_at),
             updated_at = NOW()
         WHERE sale_id = $1`,
        [
          sale.id,
          String(event.details.failure_reason ?? "PayAssure collection failed"),
          event.settlementId,
          event.type,
          JSON.stringify(event.payload),
          event.createdAt,
        ],
      );
      if (failedSale.rowCount) {
        await client.query(
          `INSERT INTO failed_checkout_attempts
             (payment_method, total_cents, failure_reason, created_by)
           SELECT payment_method, total_cents, $2, 'payassure-webhook'
           FROM sales WHERE id = $1`,
          [
            sale.id,
            String(event.details.failure_reason ?? "PayAssure collection failed"),
          ],
        );
      }
    }
    return;
  }

  if (
    sale.collectionStatus === "failed" ||
    sale.settlementStatus === "completed" ||
    isStaleSettlementEvent
  ) return;

  const settlementStatus = {
    "payment.settlement.started": "processing",
    "payment.settlement.progress": "processing",
    "payment.settlement.partially_failed": "partially_failed",
    "payment.settlement.retrying": "retrying",
    "payment.settlement.completed": "completed",
    "payment.settlement.reconciliation_required": "awaiting_reconciliation",
  }[event.type];
  const failureReason = event.details.failure_reason;
  const attemptCount = event.details.attempt_count;
  await client.query(
    `UPDATE payassure_settlements
     SET status = $2,
         provider_settlement_id = $3,
         last_error = CASE
           WHEN $2 = 'partially_failed' THEN $4
           WHEN $2 IN ('processing', 'completed') THEN NULL
           ELSE last_error
         END,
         attempt_count = CASE
           WHEN $2 = 'retrying' AND $5::integer > attempt_count THEN $5::integer
           WHEN $2 = 'retrying' THEN attempt_count + 1
           ELSE attempt_count
         END,
         last_event_type = $6,
         last_event_payload = $7::jsonb,
         last_event_at = COALESCE($8::timestamptz, last_event_at),
         updated_at = NOW()
     WHERE sale_id = $1`,
    [
      sale.id,
      settlementStatus,
      event.settlementId,
      typeof failureReason === "string" ? failureReason : "PayAssure reported a payout failure",
      typeof attemptCount === "number" && Number.isSafeInteger(attemptCount) ? attemptCount : 0,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
    ],
  );
}

app.post("/webhook", async (req, res, next) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  if (!rawBody) {
    console.warn("[PayAssure] Rejected webhook without a raw JSON body");
    res.status(400).json({ error: "Expected a JSON webhook body" });
    return;
  }
  const recipientMerchantId = readPayassureWebhookRecipient(rawBody);
  if (!recipientMerchantId) {
    console.warn("[PayAssure] Rejected malformed webhook recipient");
    res.status(400).json({ error: "Webhook recipient is missing or malformed" });
    return;
  }
  const timestamp = req.get("x-payassure-timestamp") ?? undefined;
  const signature = req.get("x-payassure-signature") ?? undefined;
  let secret: string | null;
  try {
    secret = await getPayassureWebhookSecret(recipientMerchantId);
  } catch (error) {
    console.error("[PayAssure] Could not load webhook verification credentials", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    res.status(503).json({ error: "PayAssure webhook verification is temporarily unavailable" });
    return;
  }
  if (!secret) {
    console.warn("[PayAssure] Rejected webhook for unknown merchant", { recipientMerchantId });
    res.status(401).json({ error: "Unknown PayAssure webhook recipient" });
    return;
  }
  if (!verifyPayassureWebhookSignature(rawBody, timestamp, signature, secret)) {
    console.warn("[PayAssure] Rejected webhook with invalid or stale signature", {
      recipientMerchantId,
    });
    res.status(401).json({ error: "Invalid PayAssure webhook signature" });
    return;
  }

  let event: PayassureWebhookEvent;
  try {
    event = parsePayassureWebhookEvent(
      rawBody,
      req.get("x-payassure-event-id") ?? undefined,
      req.get("x-payassure-event") ?? undefined,
    );
  } catch (error) {
    console.warn("[PayAssure] Rejected malformed webhook", {
      recipientMerchantId,
      message: error instanceof Error ? error.message : "Invalid event",
    });
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid PayAssure webhook event",
    });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    next(error);
    return;
  }
  try {
    await client.query("BEGIN");
    const recorded = await client.query<{ id: number }>(
      `INSERT INTO payassure_webhook_events
         (recipient_merchant_id, provider_event_id, event_type, payload, signature_valid, status)
       VALUES ($1, $2, $3, $4::jsonb, TRUE, 'received')
       ON CONFLICT (recipient_merchant_id, provider_event_id) DO NOTHING
       RETURNING id`,
      [
        event.recipientMerchantId,
        event.id,
        event.type,
        JSON.stringify(event.payload),
      ],
    );
    if (!recorded.rowCount) {
      await client.query("COMMIT");
      res.status(200).json({ received: true, duplicate: true });
      return;
    }

    await applyPayassureWebhookEvent(client, event);
    await client.query(
      `UPDATE payassure_webhook_events
       SET status = 'processed', processed_at = NOW()
       WHERE id = $1`,
      [recorded.rows[0].id],
    );
    await client.query("COMMIT");
    res.status(200).json({ received: true });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[PayAssure] Could not roll back webhook transaction", rollbackError);
    }
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;
    if (status === 404 || status === 409) {
      res.status(status).json({
        error: error instanceof Error ? error.message : "PayAssure webhook could not be applied",
      });
    } else {
      next(error);
    }
  } finally {
    client.release();
  }
});

app.post("/api/checkout", requireAuth, async (req, res, next) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    if (req.body?.paymentMethod === "credit" || req.body?.paymentMethod === "mpesa") {
      const payerIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === "payerName" || issue.path[0] === "payerPhone",
      );
      if (payerIssue) {
        res.status(400).json({ error: payerIssue.message });
        return;
      }
    }
    res.status(400).json({ error: "Provide one or more valid checkout items" });
    return;
  }

  const merchantTransactionReference =
    parsed.data.merchantTransactionReference ?? `POS-${randomUUID()}`;
  let mpesaPhone: string | null = null;
  if (parsed.data.paymentMethod === "mpesa") {
    try {
      mpesaPhone = normalizeMpesaPhone(parsed.data.payerPhone ?? "");
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Enter a valid Kenyan M-Pesa phone number",
      });
      return;
    }
  }

  const requestFingerprint = checkoutRequestFingerprint(parsed.data, mpesaPhone);
  async function returnExistingSettlement(settlementId: number): Promise<void> {
    const existingSale = await pool.query(
      `SELECT s.id, s.payment_method AS "paymentMethod", s.status,
              s.total_cents AS "totalCents", s.created_at AS "createdAt",
              settlement.status AS "settlementStatus",
              settlement.collection_status AS "collectionStatus",
              settlement.last_error AS "settlementError",
              settlement.merchant_transaction_reference AS "reference"
       FROM sales s
       JOIN payassure_settlements settlement ON settlement.sale_id = s.id
       WHERE settlement.id = $1`,
      [settlementId],
    );
    if (!existingSale.rowCount) {
      res.status(404).json({ error: "Existing checkout was not found" });
      return;
    }
    const checkout = existingSale.rows[0];
    res.status(checkout.collectionStatus === "pending" ? 202 : 200).json(checkout);
  }

  let existingSettlement: { id: number; request_fingerprint: string | null } | undefined;
  try {
    const result = await pool.query<{ id: number; request_fingerprint: string | null }>(
      `SELECT id, request_fingerprint FROM payassure_settlements
       WHERE merchant_transaction_reference = $1`,
      [merchantTransactionReference],
    );
    existingSettlement = result.rows[0];
  } catch (error) {
    next(error);
    return;
  }
  if (existingSettlement) {
    if (
      existingSettlement.request_fingerprint !== null &&
      existingSettlement.request_fingerprint !== requestFingerprint
    ) {
      res.status(409).json({
        error: "This checkout reference was already used for a different sale. Retry with a new reference.",
      });
      return;
    }
    try {
      await returnExistingSettlement(existingSettlement.id);
    } catch (error) {
      next(error);
    }
    return;
  }

  const quantities = new Map<number, number>();
  for (const item of parsed.data.items) {
    const combined = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(combined) || combined > 2147483647) {
      res.status(400).json({ error: "A product quantity is too large" });
      return;
    }
    quantities.set(item.productId, combined);
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    next(error);
    return;
  }
  let transactionOpen = false;
  let clientReleased = false;
  let payassureRequestStarted = false;
  let payassureAccepted = false;
  let stagedSaleId: number | null = null;
  let stagedSettlementId: number | null = null;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      merchantTransactionReference,
    ]);
    const duplicateSettlement = await client.query<{
      id: number;
      request_fingerprint: string | null;
    }>(
      `SELECT id, request_fingerprint FROM payassure_settlements
       WHERE merchant_transaction_reference = $1`,
      [merchantTransactionReference],
    );
    if (duplicateSettlement.rows[0]) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      if (
        duplicateSettlement.rows[0].request_fingerprint !== null &&
        duplicateSettlement.rows[0].request_fingerprint !== requestFingerprint
      ) {
        res.status(409).json({
          error: "This checkout reference was already used for a different sale. Retry with a new reference.",
        });
      } else {
        await returnExistingSettlement(duplicateSettlement.rows[0].id);
      }
      return;
    }
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const result = await client.query(
      `SELECT id, name, price_cents, buying_price_cents, supplier_id,
              stock_count, prescription_required
       FROM products WHERE id = ANY($1::integer[]) ORDER BY id FOR UPDATE`,
      [productIds],
    );
    if (result.rows.length !== productIds.length) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      const error = "One or more products no longer exist";
      await recordFailedCheckout(req.session.email!, parsed.data.paymentMethod, parsed.data.items, error);
      res.status(400).json({ error });
      return;
    }

    const products = result.rows as Array<{
      id: string;
      name: string;
      price_cents: number;
      buying_price_cents: number | null;
      supplier_id: number;
      stock_count: number;
      prescription_required: boolean;
    }>;
    const pendingProductStock = await client.query<{
      product_id: number;
      quantity: string;
    }>(
      `SELECT item.product_id, SUM(item.quantity)::text AS quantity
       FROM sale_items item
       JOIN sales pending_sale ON pending_sale.id = item.sale_id
       WHERE pending_sale.status = 'pending'
         AND item.product_id = ANY($1::integer[])
       GROUP BY item.product_id`,
      [productIds],
    );
    const reservedByProduct = new Map(
      pendingProductStock.rows.map((row) => [Number(row.product_id), Number(row.quantity)]),
    );
    const prescriptionRequired = products.some(
      (product) => product.prescription_required,
    );
    if (prescriptionRequired && !parsed.data.prescriptionReference?.trim()) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      const error = "A prescription reference is required for this sale";
      await recordFailedCheckout(req.session.email!, parsed.data.paymentMethod, parsed.data.items, error);
      res.status(400).json({
        code: "PRESCRIPTION_REFERENCE_REQUIRED",
        error,
      });
      return;
    }
    for (const product of products) {
      const quantity = quantities.get(Number(product.id))!;
      if (product.stock_count - (reservedByProduct.get(Number(product.id)) ?? 0) < quantity) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        const error = `Not enough stock for ${product.name}`;
        await recordFailedCheckout(req.session.email!, parsed.data.paymentMethod, parsed.data.items, error);
        res.status(409).json({ error });
        return;
      }
    }

    const batchResult = await client.query(
      `SELECT batch.id, batch.product_id, batch.batch_code, batch.expiry_date,
              batch.stock_count - COALESCE((
                SELECT SUM(reserved_item.quantity)
                FROM sale_items reserved_item
                JOIN sales reserved_sale ON reserved_sale.id = reserved_item.sale_id
                WHERE reserved_sale.status = 'pending'
                  AND reserved_item.batch_id = batch.id
              ), 0) AS stock_count
       FROM product_batches batch
       WHERE batch.product_id = ANY($1::integer[])
         AND batch.stock_count > 0 AND batch.expiry_date >= CURRENT_DATE
       ORDER BY batch.expiry_date ASC, batch.id ASC
       FOR UPDATE`,
      [productIds],
    );
    const batches = batchResult.rows as Array<{
      id: number;
      product_id: number;
      batch_code: string;
      expiry_date: string;
      stock_count: number;
    }>;
    const allocations = new Map<
      number,
      Array<{ batch: (typeof batches)[number]; quantity: number }>
    >();
    for (const product of products) {
      let remaining = quantities.get(Number(product.id))!;
      for (const batch of batches.filter(
        (candidate) => Number(candidate.product_id) === Number(product.id),
      )) {
        if (!remaining) break;
        const quantity = Math.min(remaining, Number(batch.stock_count));
        if (quantity > 0) {
          const productAllocations = allocations.get(Number(product.id)) ?? [];
          productAllocations.push({ batch, quantity });
          allocations.set(Number(product.id), productAllocations);
          remaining -= quantity;
        }
      }
      if (remaining > 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        const error = `Not enough unexpired, verified batch stock for ${product.name}`;
        await recordFailedCheckout(req.session.email!, parsed.data.paymentMethod, parsed.data.items, error);
        res.status(409).json({
          error,
        });
        return;
      }
    }

    const totalCents = products.reduce(
      (sum, product) =>
        sum + Number(product.price_cents) * quantities.get(Number(product.id))!,
      0,
    );
    if (!Number.isSafeInteger(totalCents)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      res.status(400).json({ error: "Checkout total is too large" });
      return;
    }

    const saleResult = await client.query(
      `INSERT INTO sales
         (payment_method, status, total_cents, payer_name, payer_phone,
          prescription_reference, prescription_checked_by)
       VALUES ($1, 'pending', $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [
        parsed.data.paymentMethod,
        totalCents,
        parsed.data.paymentMethod === "credit" ? parsed.data.payerName : null,
        parsed.data.paymentMethod === "credit" ? parsed.data.payerPhone : null,
        prescriptionRequired ? parsed.data.prescriptionReference?.trim() : null,
        prescriptionRequired ? req.session.email : null,
      ],
    );
    const saleId = Number(saleResult.rows[0].id);
    stagedSaleId = saleId;
    for (const product of products) {
      for (const allocation of allocations.get(Number(product.id)) ?? []) {
        await client.query(
          `INSERT INTO sale_items
             (sale_id, product_id, product_name, quantity, unit_price_cents,
              batch_id, batch_code, batch_expiry_date, buying_unit_price_cents,
              supplier_id, supplier_name)
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, p.buying_price_cents,
                  p.supplier_id, s.name
           FROM products p JOIN suppliers s ON s.id = p.supplier_id
           WHERE p.id = $2`,
          [
            saleId,
            product.id,
            product.name,
            allocation.quantity,
            product.price_cents,
            allocation.batch.id,
            allocation.batch.batch_code,
            allocation.batch.expiry_date,
          ],
        );
      }
    }

    const settlementLines = await client.query<{
      supplierMerchantId: string;
      itemReference: string;
      supplierAmountCents: string | null;
      retailerAmountCents: string | null;
    }>(
      `SELECT COALESCE(s.payassure_merchant_id, '') AS "supplierMerchantId",
              COALESCE(NULLIF(p.stock_code, ''), NULLIF(p.barcode, ''),
                       'POS-PRODUCT-' || i.product_id::text) AS "itemReference",
              CASE WHEN BOOL_OR(i.buying_unit_price_cents IS NULL)
                THEN NULL ELSE SUM(
                  i.buying_unit_price_cents::bigint * i.quantity
                )::text END AS "supplierAmountCents",
              CASE WHEN BOOL_OR(i.buying_unit_price_cents IS NULL)
                THEN NULL ELSE SUM(
                  (i.unit_price_cents::bigint - i.buying_unit_price_cents::bigint)
                  * i.quantity
                )::text END AS "retailerAmountCents"
       FROM sale_items i
       JOIN products p ON p.id = i.product_id
       JOIN suppliers s ON s.id = COALESCE(i.supplier_id, p.supplier_id)
       WHERE i.sale_id = $1
       GROUP BY i.product_id, p.stock_code, p.barcode, s.payassure_merchant_id
       ORDER BY i.product_id`,
      [saleId],
    );
    const amount = Number((totalCents / 100).toFixed(2));
    const payload: StoredSettlementPayload = {
      merchantId: "",
      merchantTransactionReference,
      amount,
      currency: "KES",
      payment: {
        methods: parsed.data.paymentMethod === "mpesa"
          ? [{ type: "MPESA", amount, phoneNumber: mpesaPhone! }]
          : [{ type: "CASH", amount }],
      },
      items: settlementLines.rows.map((line) => ({
        supplierMerchantId: line.supplierMerchantId,
        itemReference: line.itemReference,
        supplierAmount: line.supplierAmountCents === null
          ? null
          : Number((Number(line.supplierAmountCents) / 100).toFixed(2)),
        retailerAmount: line.retailerAmountCents === null
          ? null
          : Number((Number(line.retailerAmountCents) / 100).toFixed(2)),
      })),
      metadata: { posSaleId: String(saleId) },
    };
    const settlement = await client.query<{ id: number }>(
      `INSERT INTO payassure_settlements
         (sale_id, merchant_transaction_reference, request_fingerprint, request_payload)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id`,
      [saleId, merchantTransactionReference, requestFingerprint, JSON.stringify(payload)],
    );
    const settlementId = Number(settlement.rows[0].id);
    stagedSettlementId = settlementId;
    const preparedPayload = await prepareSettlementPayload(saleId, payload, client);
    await client.query("COMMIT");
    transactionOpen = false;
    client.release();
    clientReleased = true;

    payassureRequestStarted = true;
    const initiation = await initiatePayassureSettlement(preparedPayload, async (savedPayload) => {
      await pool.query(
        `UPDATE payassure_settlements
         SET request_payload = $2::jsonb, updated_at = NOW()
         WHERE id = $1`,
        [settlementId, JSON.stringify(savedPayload)],
      );
    });
    payassureAccepted = true;
    await pool.query(
      `UPDATE payassure_settlements
       SET status = CASE WHEN status = 'queued' THEN 'accepted' ELSE status END,
           last_error = NULL, provider_request_id = COALESCE(provider_request_id, $2),
           updated_at = NOW()
       WHERE id = $1`,
      [settlementId, initiation.providerRequestId],
    );
    const checkoutStatus = await pool.query(
      `SELECT sale.status, settlement.status AS "settlementStatus",
              settlement.collection_status AS "collectionStatus",
              settlement.last_error AS "settlementError"
       FROM sales sale
       JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
       WHERE sale.id = $1`,
      [saleId],
    );
    res.status(checkoutStatus.rows[0].collectionStatus === "pending" ? 202 : 200).json({
      id: saleId,
      paymentMethod: parsed.data.paymentMethod,
      reference: merchantTransactionReference,
      status: checkoutStatus.rows[0].status,
      totalCents,
      createdAt: saleResult.rows[0].created_at,
      settlementStatus: checkoutStatus.rows[0].settlementStatus,
      collectionStatus: checkoutStatus.rows[0].collectionStatus,
      settlementError: checkoutStatus.rows[0].settlementError,
    });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Could not roll back checkout transaction:", rollbackError);
      }
    }
    if (payassureRequestStarted && !payassureAccepted) {
      const definitiveRejection =
        error instanceof PayassureHttpError && error.status >= 400 && error.status < 500;
      try {
        if (stagedSettlementId !== null) {
          await pool.query(
            `UPDATE payassure_settlements
             SET status = CASE WHEN status IN ('queued', 'accepted') THEN 'failed' ELSE status END,
                 collection_status = CASE WHEN $3::boolean THEN 'failed' ELSE collection_status END,
                 last_error = $2, updated_at = NOW()
             WHERE id = $1`,
            [stagedSettlementId, settlementFailureMessage(error), definitiveRejection],
          );
        }
        if (definitiveRejection && stagedSaleId !== null) {
          const failed = await pool.query(
            "UPDATE sales SET status = 'failed' WHERE id = $1 AND status = 'pending'",
            [stagedSaleId],
          );
          if (failed.rowCount) {
            await pool.query(
              `INSERT INTO failed_checkout_attempts
                 (payment_method, total_cents, failure_reason, created_by)
               SELECT payment_method, total_cents, $2, $3 FROM sales WHERE id = $1`,
              [stagedSaleId, settlementFailureMessage(error), req.session.email!],
            );
          }
        }
      } catch (persistenceError) {
        next(persistenceError);
        return;
      }
      res.status(502).json({
        error: settlementFailureMessage(error),
        reference: merchantTransactionReference,
        collectionStatus: definitiveRejection ? "failed" : "pending",
      });
      return;
    }
    if (payassureAccepted) {
      console.error("[PayAssure] Could not update local checkout status after PayAssure accepted initiation", {
        merchantTransactionReference,
        saleId: stagedSaleId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        message: settlementFailureMessage(error),
      });
      res.status(500).json({
        error: "PayAssure accepted the payment request, but the POS could not refresh its status. Do not retry this checkout; check its status or contact support.",
      });
      return;
    }
    if (transactionOpen) {
      try {
        await recordFailedCheckout(
          req.session.email!,
          parsed.data.paymentMethod,
          parsed.data.items,
          "Checkout could not be completed",
        );
      } catch (recordError) {
        console.error("Could not record failed checkout:", recordError);
      }
    }
    next(error);
  } finally {
    if (!clientReleased) client.release();
  }
});

app.get("/api/checkout/:reference/status", requireAuth, async (req, res, next) => {
  try {
    const reference = String(req.params.reference);
    const sale = await pool.query(
      `SELECT sale.id, sale.payment_method AS "paymentMethod", sale.status,
              sale.total_cents AS "totalCents", sale.created_at AS "createdAt",
              settlement.status AS "settlementStatus",
              settlement.collection_status AS "collectionStatus",
              settlement.last_error AS "settlementError"
       FROM sales sale
       JOIN payassure_settlements settlement ON settlement.sale_id = sale.id
       WHERE settlement.merchant_transaction_reference = $1
          OR ($2::boolean AND sale.id = $3::integer)`,
      [reference, /^\d+$/.test(reference), /^\d+$/.test(reference) ? Number(reference) : 0],
    );
    if (sale.rowCount) {
      res.json(sale.rows[0]);
      return;
    }
    res.status(404).json({ error: "Checkout not found" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payassure/settlements/:id/retry", requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: "Provide a valid settlement ID" });
    return;
  }
  res.status(409).json({
    error: "PayAssure manages collection and payout retries. Reinitiating here could charge the customer twice.",
  });
});

app.get("/api/dashboard", requireAuth, async (_req, res, next) => {
  try {
    const [sales, items, supplierCosts, failures, transactions] = await Promise.all([
      pool.query(
        `SELECT CURRENT_DATE::text AS date,
                COUNT(*) AS "successfulTransactions",
                COALESCE(SUM(total_cents), 0)::text AS "incomeCents"
         FROM sales
         WHERE status = 'completed'
           AND created_at >= CURRENT_DATE
           AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
      ),
      pool.query(
        `SELECT COALESCE(SUM(i.quantity), 0)::text AS "unitsSold",
                COALESCE(SUM(i.buying_unit_price_cents::bigint * i.quantity)
                  FILTER (WHERE i.buying_unit_price_cents IS NOT NULL), 0)::text AS "supplierCostCents",
                COUNT(*) FILTER (WHERE i.buying_unit_price_cents IS NULL) AS "unpricedSaleLines"
         FROM sales s JOIN sale_items i ON i.sale_id = s.id
         WHERE s.status = 'completed'
           AND s.created_at >= CURRENT_DATE
           AND s.created_at < CURRENT_DATE + INTERVAL '1 day'`,
      ),
      pool.query(
        `SELECT COALESCE(i.supplier_id, p.supplier_id) AS "supplierId",
                COALESCE(i.supplier_name, supplier.name) AS "supplierName",
                COALESCE(SUM(i.buying_unit_price_cents::bigint * i.quantity)
                  FILTER (WHERE i.buying_unit_price_cents IS NOT NULL), 0)::text AS "costCents",
                COALESCE(SUM(i.quantity), 0)::text AS "unitsSold",
                COUNT(*) FILTER (WHERE i.buying_unit_price_cents IS NULL) AS "unpricedSaleLines"
         FROM sales s
         JOIN sale_items i ON i.sale_id = s.id
         JOIN products p ON p.id = i.product_id
         JOIN suppliers supplier ON supplier.id = COALESCE(i.supplier_id, p.supplier_id)
         WHERE s.status = 'completed'
           AND s.created_at >= CURRENT_DATE
           AND s.created_at < CURRENT_DATE + INTERVAL '1 day'
         GROUP BY COALESCE(i.supplier_id, p.supplier_id),
                  COALESCE(i.supplier_name, supplier.name)
         ORDER BY SUM(i.buying_unit_price_cents::bigint * i.quantity)
                    FILTER (WHERE i.buying_unit_price_cents IS NOT NULL) DESC NULLS LAST,
                  "supplierName"`,
      ),
      pool.query(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(total_cents), 0)::text AS "failedAmountCents"
         FROM failed_checkout_attempts
         WHERE created_at >= CURRENT_DATE
           AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
      ),
      pool.query(
        `SELECT * FROM (
           SELECT s.id::text AS id, s.payment_method AS "paymentMethod", s.status,
                  s.total_cents AS "totalCents", s.created_at AS "createdAt",
                    CASE WHEN s.status = 'failed' THEN settlement.last_error END AS "failureReason",
                    s.payer_name AS "payerName",
                    s.payer_phone AS "payerPhone",
                  settlement.id AS "settlementId",
                  settlement.status AS "settlementStatus",
                  settlement.last_error AS "settlementError",
                  settlement.attempt_count AS "settlementAttemptCount",
                  settlement.next_attempt_at AS "nextRetryAt"
           FROM sales s
           LEFT JOIN payassure_settlements settlement ON settlement.sale_id = s.id
           WHERE (s.created_at >= CURRENT_DATE
                  AND s.created_at < CURRENT_DATE + INTERVAL '1 day')
              OR settlement.status IN (
                'queued', 'processing', 'accepted', 'failed', 'retrying',
                'partially_failed', 'awaiting_reconciliation'
              )
           UNION ALL
           SELECT ('failed-' || id)::text AS id, payment_method AS "paymentMethod",
                  'failed' AS status, total_cents AS "totalCents",
                  created_at AS "createdAt", failure_reason AS "failureReason",
                  NULL::text AS "payerName", NULL::text AS "payerPhone",
                  NULL::integer AS "settlementId", NULL::text AS "settlementStatus",
                  NULL::text AS "settlementError", NULL::integer AS "settlementAttemptCount",
                  NULL::timestamptz AS "nextRetryAt"
           FROM failed_checkout_attempts
           WHERE created_at >= CURRENT_DATE
             AND created_at < CURRENT_DATE + INTERVAL '1 day'
         ) AS recent_transactions
         ORDER BY CASE WHEN status = 'pending'
                          OR "settlementStatus" IN (
                            'queued', 'processing', 'accepted', 'failed', 'retrying',
                            'partially_failed', 'awaiting_reconciliation'
                          )
                       THEN 0 ELSE 1 END,
                  "createdAt" DESC
         LIMIT 50`,
      ),
    ]);

    res.json({
      date: sales.rows[0].date,
      successfulTransactions: Number(sales.rows[0].successfulTransactions),
      failedTransactions: Number(failures.rows[0].count),
      incomeCents: Number(sales.rows[0].incomeCents),
      unitsSold: Number(items.rows[0].unitsSold),
      supplierCostCents: Number(items.rows[0].supplierCostCents),
      unpricedSaleLines: Number(items.rows[0].unpricedSaleLines),
      failedAmountCents: Number(failures.rows[0].failedAmountCents),
      supplierCosts: supplierCosts.rows.map((row) => ({
        ...row,
        costCents: Number(row.costCents),
        unitsSold: Number(row.unitsSold),
        unpricedSaleLines: Number(row.unpricedSaleLines),
      })),
      transactions: transactions.rows.map((row) => ({
        ...row,
        totalCents: row.totalCents === null ? null : Number(row.totalCents),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sales", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.payment_method AS "paymentMethod", s.status,
              s.total_cents AS "totalCents", s.created_at AS "createdAt",
              s.payer_name AS "payerName", s.payer_phone AS "payerPhone",
              s.prescription_reference AS "prescriptionReference",
              s.prescription_checked_by AS "prescriptionCheckedBy",
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

if (process.env.NODE_ENV === "production") {
  const webDirectory = path.resolve(__dirname, "../../../web/dist");
  app.use(express.static(webDirectory));
  app.get("*", (_req, res) => res.sendFile(path.join(webDirectory, "index.html")));
}

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Request failed:", error);
    res.status(500).json({ error: "An unexpected server error occurred" });
  },
);

initializeDatabase()
  .then(() => {
    app.listen(port, () => console.log(`POS server listening on port ${port}`));
  })
  .catch((error: unknown) => {
    console.error("Could not initialize the database:", error);
    process.exitCode = 1;
  });
