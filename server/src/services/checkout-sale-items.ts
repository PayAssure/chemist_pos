import type { PoolClient } from "pg";
import type { CheckoutAllocations, CheckoutProduct } from "./checkout-models";

export async function insertSaleItems(
  client: PoolClient,
  saleId: number,
  products: CheckoutProduct[],
  allocations: CheckoutAllocations,
): Promise<void> {
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
}
