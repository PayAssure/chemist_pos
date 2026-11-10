import type { PoolClient } from "pg";
import { writeDashboardAllocation } from "./dashboard-sale-item";

type DashboardProduct = {
  id: number;
  name: string;
  price_cents: number;
  prescription_required: boolean;
};
type BatchAllocation = {
  id: number;
  batch_code: string;
  expiry_date: string;
  quantity: number;
};

export async function insertDashboardSale(
  client: PoolClient,
  product: DashboardProduct,
  index: number,
  productCount: number,
): Promise<void> {
  const quantity = (index % 3) + 1;
  const lockedProduct = await client.query(
    "SELECT id FROM products WHERE id = $1 FOR UPDATE",
    [product.id],
  );
  if (!lockedProduct.rowCount) {
    throw new Error(`Sample product ${product.name} is no longer available.`);
  }
  const allocations = await allocateBatches(client, product, quantity);
  const isCredit = index >= 8;
  const sale = await client.query(
    `INSERT INTO sales
       (payment_method, status, total_cents, payer_name, payer_phone, created_at)
     VALUES ($1, 'completed', $2, $3, $4, NOW() - ($5 * INTERVAL '2 minutes'))
     RETURNING id`,
    [
      isCredit ? "credit" : "cash",
      Number(product.price_cents) * quantity,
      isCredit ? `Demo Dashboard Payer ${index - 7}` : null,
      isCredit ? `000000000${index - 7}` : null,
      productCount - index,
    ],
  );
  for (const allocation of allocations) {
    await writeDashboardAllocation(
      client, Number(sale.rows[0].id), product.id, allocation,
    );
  }
  await client.query(
    "UPDATE products SET stock_count = stock_count - $2 WHERE id = $1",
    [product.id, quantity],
  );
}

async function allocateBatches(
  client: PoolClient,
  product: DashboardProduct,
  quantity: number,
): Promise<BatchAllocation[]> {
  const batches = await client.query(
    `SELECT id, batch_code, expiry_date, stock_count
     FROM product_batches
     WHERE product_id = $1 AND stock_count > 0 AND expiry_date >= CURRENT_DATE
     ORDER BY expiry_date, id FOR UPDATE`,
    [product.id],
  );
  let remaining = quantity;
  const allocations: BatchAllocation[] = [];
  for (const batch of batches.rows) {
    if (!remaining) break;
    const allocated = Math.min(remaining, Number(batch.stock_count));
    if (allocated > 0) {
      allocations.push({
        id: Number(batch.id), batch_code: batch.batch_code,
        expiry_date: batch.expiry_date, quantity: allocated,
      });
      remaining -= allocated;
    }
  }
  if (remaining > 0) {
    throw new Error(`Not enough unexpired stock for sample product ${product.name}.`);
  }
  return allocations;
}
