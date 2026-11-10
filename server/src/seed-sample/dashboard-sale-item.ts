import type { PoolClient } from "pg";

type BatchAllocation = {
  id: number;
  batch_code: string;
  expiry_date: string;
  quantity: number;
};

export async function writeDashboardAllocation(
  client: PoolClient,
  saleId: number,
  productId: number,
  allocation: BatchAllocation,
): Promise<void> {
  await client.query(
    "UPDATE product_batches SET stock_count = stock_count - $2 WHERE id = $1",
    [allocation.id, allocation.quantity],
  );
  await client.query(
    `INSERT INTO sale_items
       (sale_id, product_id, product_name, quantity, unit_price_cents,
        batch_id, batch_code, batch_expiry_date, buying_unit_price_cents,
        supplier_id, supplier_name)
     SELECT $1, p.id, p.name, $3, p.price_cents, b.id, b.batch_code,
            b.expiry_date, p.buying_price_cents, s.id, s.name
     FROM products p JOIN product_batches b ON b.id = $2
     JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $4`,
    [saleId, allocation.id, allocation.quantity, productId],
  );
}
