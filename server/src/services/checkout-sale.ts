import type { PoolClient } from "pg";
import type { CheckoutInput } from "./checkout-models";

export async function insertPendingSale(
  client: PoolClient,
  checkout: CheckoutInput,
  totalCents: number,
): Promise<{ saleId: number; createdAt: string }> {
  const result = await client.query(
    `INSERT INTO sales
       (payment_method, status, total_cents, payer_name, payer_phone)
     VALUES ($1, 'pending', $2, $3, $4) RETURNING id, created_at`,
    [
      checkout.paymentMethod,
      totalCents,
      checkout.paymentMethod === "credit" ? checkout.payerName : null,
      checkout.paymentMethod === "credit" ? checkout.payerPhone : null,
    ],
  );
  return { saleId: Number(result.rows[0].id), createdAt: result.rows[0].created_at };
}
