import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { medicineCatalog, supplierNames } from "./constants";
import type { Medicine } from "./types";
import { expiryDate } from "./utils";

export async function createSuppliers(client: PoolClient): Promise<number[]> {
  const suppliers: number[] = [];
  for (let index = 0; index < supplierNames.length; index += 1) {
    const result = await client.query(
      `INSERT INTO suppliers (name, payassure_merchant_id)
       VALUES ($1, $2) RETURNING id`,
      [supplierNames[index], `DEMO-PA-TEST-MERCHANT-${String(index + 1).padStart(4, "0")}`],
    );
    suppliers.push(Number(result.rows[0].id));
  }
  return suppliers;
}

export async function createMedicines(
  client: PoolClient,
  suppliers: number[],
): Promise<Medicine[]> {
  const medicines: Medicine[] = [];
  for (let index = 0; index < medicineCatalog.length; index += 1) {
    const [name, ingredient, prescriptionRequired, basePrice] = medicineCatalog[index];
    const priceCents = Number(basePrice) * 100;
    const initialStock = randomInt(70, 151) + randomInt(70, 151);
    const result = await client.query(
      `INSERT INTO products
         (name, supplier_id, price_cents, buying_price_cents, stock_count,
          active_ingredient, prescription_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        name, suppliers[index % suppliers.length], priceCents,
        Math.round(Number(basePrice) * 60), initialStock, ingredient,
        prescriptionRequired,
      ],
    );
    const productId = Number(result.rows[0].id);
    const firstStock = randomInt(70, 151);
    const batches = await createBatches(client, index, productId, firstStock, initialStock - firstStock);
    medicines.push({
      id: productId,
      name: String(name),
      priceCents,
      prescriptionRequired: Boolean(prescriptionRequired),
      batches,
    });
  }
  return medicines;
}

async function createBatches(
  client: PoolClient, index: number, productId: number, firstStock: number, secondStock: number,
): Promise<Medicine["batches"]> {
  const stocks = [firstStock, secondStock];
  const batches: Medicine["batches"] = [];
  for (let batchIndex = 0; batchIndex < stocks.length; batchIndex += 1) {
    const code = `DEMO-${String(index + 1).padStart(3, "0")}-${batchIndex ? "B" : "A"}`;
    const expiry = expiryDate(randomInt(100, 720) + batchIndex * 30);
    const result = await client.query(
      `INSERT INTO product_batches (product_id, batch_code, expiry_date, stock_count)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [productId, code, expiry, stocks[batchIndex]],
    );
    batches.push({ id: Number(result.rows[0].id), code, expiry, stock: stocks[batchIndex] });
  }
  return batches;
}
