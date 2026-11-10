import type { NextFunction, Request, Response } from "express";
import { pool } from "../db";
import { productSchema } from "../validation/products";

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    const id = Number(result.rows[0].id);
    await client.query(
      `INSERT INTO product_batches (product_id, batch_code, expiry_date, stock_count)
       VALUES ($1, $2, $3, $4)`,
      [id, parsed.data.batchCode, parsed.data.expiryDate, parsed.data.stockCount],
    );
    await client.query("COMMIT");
    res.status(201).json({
      id,
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
}
