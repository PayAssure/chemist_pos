import "dotenv/config";
import bcrypt from "bcryptjs";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import path from "node:path";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAuth } from "./auth";
import { initializeDatabase, pool } from "./db";
import {
  getMpesaCheckoutStatus,
  PaymentIntegrationNotConfiguredError,
  startMpesaCheckout,
} from "./payment";

const app = express();
const PgSession = connectPgSimple(session);
const port = Number(process.env.PORT ?? 3000);
const sessionSecret = process.env.SESSION_SECRET;

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
  merchantId: z.string().trim().max(200),
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
const batchExpirySchema = z.object({
  expiryDate: z.string().date(),
});
const buyingPriceSchema = z.object({
  buyingPriceCents: z.number().int().positive().max(2147483647),
});
const checkoutSchema = z.object({
  paymentMethod: z.enum(["cash", "mpesa", "credit"]),
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
});

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
        res.json({ email: user.email });
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

app.get("/api/suppliers", requireAuth, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, payassure_merchant_id AS "merchantId",
              payassure_enrolled AS "payassureEnrolled"
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
      `INSERT INTO suppliers (name, payassure_merchant_id, payassure_enrolled)
       VALUES ($1, $2, $3)
       RETURNING id, name, payassure_merchant_id AS "merchantId",
                 payassure_enrolled AS "payassureEnrolled"`,
      [
        parsed.data.name,
        parsed.data.payassureEnrolled ? parsed.data.merchantId : null,
        parsed.data.payassureEnrolled,
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
                SELECT SUM(b.stock_count)::integer
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
    await client.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [
      productId,
    ]);
    const batch = await client.query(
      "SELECT stock_count FROM product_batches WHERE id = $1 FOR UPDATE",
      [id],
    );
    const difference = parsed.data.stockCount - Number(batch.rows[0].stock_count);
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

app.post("/api/checkout", requireAuth, async (req, res, next) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    if (req.body?.paymentMethod === "credit") {
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

  if (parsed.data.paymentMethod === "mpesa") {
    try {
      await startMpesaCheckout();
      await recordFailedCheckout(
        req.session.email!,
        parsed.data.paymentMethod,
        parsed.data.items,
        "M-Pesa checkout is not configured",
      );
      res.status(501).json({ error: "M-Pesa checkout is not configured" });
    } catch (error) {
      try {
        await recordFailedCheckout(
          req.session.email!,
          parsed.data.paymentMethod,
          parsed.data.items,
          error instanceof Error ? error.message : "M-Pesa checkout failed",
        );
      } catch (recordError) {
        next(recordError);
        return;
      }
      if (error instanceof PaymentIntegrationNotConfiguredError) {
        res.status(503).json({
          code: "MPESA_NOT_CONFIGURED",
          error: error.message,
        });
        return;
      }
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
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const productIds = [...quantities.keys()].sort((a, b) => a - b);
    const result = await client.query(
      `SELECT id, name, price_cents, stock_count, prescription_required
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
      stock_count: number;
      prescription_required: boolean;
    }>;
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
      if (product.stock_count < quantity) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        const error = `Not enough stock for ${product.name}`;
        await recordFailedCheckout(req.session.email!, parsed.data.paymentMethod, parsed.data.items, error);
        res.status(409).json({ error });
        return;
      }
    }

    const batchResult = await client.query(
      `SELECT id, product_id, batch_code, expiry_date, stock_count
       FROM product_batches
       WHERE product_id = ANY($1::integer[])
         AND stock_count > 0 AND expiry_date >= CURRENT_DATE
       ORDER BY expiry_date ASC, id ASC
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
       VALUES ($1, 'completed', $2, $3, $4, $5, $6) RETURNING id, created_at`,
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
    for (const product of products) {
      const quantity = quantities.get(Number(product.id))!;
      await client.query(
        `UPDATE products SET stock_count = stock_count - $2 WHERE id = $1`,
        [product.id, quantity],
      );
      for (const allocation of allocations.get(Number(product.id)) ?? []) {
        await client.query(
          "UPDATE product_batches SET stock_count = stock_count - $2 WHERE id = $1",
          [allocation.batch.id, allocation.quantity],
        );
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
    await client.query("COMMIT");
    transactionOpen = false;
    res.status(201).json({
      id: saleId,
      paymentMethod: parsed.data.paymentMethod,
      status: "completed",
      totalCents,
      createdAt: saleResult.rows[0].created_at,
    });
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Could not roll back checkout transaction:", rollbackError);
      }
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
    client.release();
  }
});

app.get("/api/checkout/:reference/status", requireAuth, async (req, res, next) => {
  try {
    const reference = String(req.params.reference);
    if (/^\d+$/.test(reference)) {
      const sale = await pool.query(
        "SELECT id, payment_method, status, total_cents, created_at FROM sales WHERE id = $1",
        [reference],
      );
      if (sale.rowCount) {
        res.json({
          id: sale.rows[0].id,
          paymentMethod: sale.rows[0].payment_method,
          status: sale.rows[0].status,
          totalCents: sale.rows[0].total_cents,
          createdAt: sale.rows[0].created_at,
        });
        return;
      }
    }
    await getMpesaCheckoutStatus(reference);
    res.status(404).json({ error: "Checkout not found" });
  } catch (error) {
    if (error instanceof PaymentIntegrationNotConfiguredError) {
      res.status(503).json({
        code: "MPESA_NOT_CONFIGURED",
        error: error.message,
      });
      return;
    }
    next(error);
  }
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
        `SELECT id::text AS id, payment_method AS "paymentMethod", status,
                total_cents AS "totalCents", created_at AS "createdAt",
                NULL::text AS "failureReason", payer_name AS "payerName",
                payer_phone AS "payerPhone"
         FROM sales
         WHERE status = 'completed'
           AND created_at >= CURRENT_DATE
           AND created_at < CURRENT_DATE + INTERVAL '1 day'
         UNION ALL
         SELECT ('failed-' || id)::text AS id, payment_method AS "paymentMethod",
                'failed' AS status, total_cents AS "totalCents",
                created_at AS "createdAt", failure_reason AS "failureReason",
                NULL::text AS "payerName", NULL::text AS "payerPhone"
         FROM failed_checkout_attempts
         WHERE created_at >= CURRENT_DATE
           AND created_at < CURRENT_DATE + INTERVAL '1 day'
         ORDER BY "createdAt" DESC LIMIT 50`,
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
