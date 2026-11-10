import type { PoolClient } from "pg";

export async function confirmPayassureCollectionInventory(
  client: PoolClient,
  saleId: number,
): Promise<void> {
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
    [saleId],
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
            product.stock_count AS "productStock", batch.stock_count AS "batchStock",
            COALESCE((
              SELECT SUM(other_item.quantity)
              FROM sale_items other_item JOIN sales other_sale ON other_sale.id = other_item.sale_id
              WHERE other_sale.status = 'pending' AND other_sale.id <> $1
                AND other_item.product_id = item.product_id
            ), 0)::text AS "pendingProduct",
            COALESCE((
              SELECT SUM(other_item.quantity)
              FROM sale_items other_item JOIN sales other_sale ON other_sale.id = other_item.sale_id
              WHERE other_sale.status = 'pending' AND other_sale.id <> $1
                AND other_item.batch_id = item.batch_id
            ), 0)::text AS "pendingBatch"
     FROM sale_items item
     JOIN products product ON product.id = item.product_id JOIN product_batches batch ON batch.id = item.batch_id
     WHERE item.sale_id = $1
     GROUP BY item.product_id, item.batch_id, product.stock_count, batch.stock_count ORDER BY item.product_id, item.batch_id`,
    [saleId],
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
    [saleId],
  );
}
