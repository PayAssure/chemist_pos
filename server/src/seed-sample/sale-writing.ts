import type { PoolClient } from "pg";
import type { SaleItem } from "./sale-selection";

export async function insertSale(
  client: PoolClient,
  items: SaleItem[],
  saleIndex: number,
  transactionCount: number,
  isTodaySale: boolean,
  createdAt: string,
): Promise<void> {
  const totalCents = items.reduce(
    (sum, item) => sum + item.quantity * item.medicine.priceCents,
    0,
  );
  const paymentMethod = saleIndex >= transactionCount - 4 ? "credit" : "cash";
  const sale = await client.query(
    `INSERT INTO sales
       (payment_method, status, total_cents, payer_name, payer_phone, created_at)
     VALUES ($1, 'completed', $2, $3, $4,
             CASE WHEN $5 THEN NOW() ELSE $6::timestamptz END) RETURNING id`,
    [
      paymentMethod,
      totalCents,
      paymentMethod === "credit" ? `Demo Payer ${saleIndex + 1}` : null,
      paymentMethod === "credit" ? String(saleIndex + 1).padStart(10, "0") : null,
      isTodaySale,
      createdAt,
    ],
  );
  const saleId = Number(sale.rows[0].id);
  for (const item of items) await insertSaleItem(client, saleId, item);
}

async function insertSaleItem(
  client: PoolClient,
  saleId: number,
  item: SaleItem,
): Promise<void> {
  await client.query(
    "UPDATE product_batches SET stock_count = $2 WHERE id = $1",
    [item.batch.id, item.batch.stock],
  );
  await client.query(
    "UPDATE products SET stock_count = stock_count - $2 WHERE id = $1",
    [item.medicine.id, item.quantity],
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
      saleId, item.medicine.id, item.medicine.name, item.quantity,
      item.medicine.priceCents, item.batch.id, item.batch.code, item.batch.expiry,
    ],
  );
}
