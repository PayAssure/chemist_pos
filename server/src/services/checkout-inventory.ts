import type { PoolClient } from "pg";
import type { CheckoutAllocations, CheckoutBatch, CheckoutProduct } from "./checkout-models";

export async function lockCheckoutProducts(
  client: PoolClient,
  productIds: number[],
): Promise<CheckoutProduct[]> {
  const result = await client.query(
    `SELECT id, name, price_cents, buying_price_cents, supplier_id,
            stock_count, prescription_required
     FROM products WHERE id = ANY($1::integer[]) ORDER BY id FOR UPDATE`,
    [productIds],
  );
  return result.rows as CheckoutProduct[];
}

export async function findProductStockFailure(
  client: PoolClient,
  products: CheckoutProduct[],
  quantities: Map<number, number>,
  productIds: number[],
): Promise<string | null> {
  const pendingStock = await client.query<{ product_id: number; quantity: string }>(
    `SELECT item.product_id, SUM(item.quantity)::text AS quantity
     FROM sale_items item
     JOIN sales pending_sale ON pending_sale.id = item.sale_id
     WHERE pending_sale.status = 'pending'
       AND item.product_id = ANY($1::integer[])
     GROUP BY item.product_id`,
    [productIds],
  );
  const reserved = new Map(
    pendingStock.rows.map((row) => [Number(row.product_id), Number(row.quantity)]),
  );
  for (const product of products) {
    const quantity = quantities.get(Number(product.id))!;
    if (product.stock_count - (reserved.get(Number(product.id)) ?? 0) < quantity) {
      return `Not enough stock for ${product.name}`;
    }
  }
  return null;
}

async function lockAvailableBatches(
  client: PoolClient,
  productIds: number[],
): Promise<CheckoutBatch[]> {
  const result = await client.query(
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
  return result.rows as CheckoutBatch[];
}

export async function allocateCheckoutBatches(
  client: PoolClient,
  products: CheckoutProduct[],
  quantities: Map<number, number>,
  productIds: number[],
): Promise<{ allocations: CheckoutAllocations; failure: string | null }> {
  const batches = await lockAvailableBatches(client, productIds);
  const allocations: CheckoutAllocations = new Map();
  for (const product of products) {
    let remaining = quantities.get(Number(product.id))!;
    for (const batch of batches.filter((item) => Number(item.product_id) === Number(product.id))) {
      if (!remaining) break;
      const quantity = Math.min(remaining, Number(batch.stock_count));
      if (quantity > 0) {
        const forProduct = allocations.get(Number(product.id)) ?? [];
        forProduct.push({ batch, quantity });
        allocations.set(Number(product.id), forProduct);
        remaining -= quantity;
      }
    }
    if (remaining > 0) {
      return {
        allocations,
        failure: `Not enough unexpired, verified batch stock for ${product.name}`,
      };
    }
  }
  return { allocations, failure: null };
}
