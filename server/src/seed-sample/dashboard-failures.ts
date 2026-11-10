import type { PoolClient } from "pg";

export async function insertDashboardFailures(
  client: PoolClient,
  users: Array<{ email: string }>,
): Promise<void> {
  for (const [index, failureReason] of [
    "Insufficient unexpired stock for requested item",
    "Checkout cancelled before payment",
    "Product quantity exceeded available stock",
  ].entries()) {
    await client.query(
      `INSERT INTO failed_checkout_attempts
         (payment_method, total_cents, failure_reason, created_by, created_at)
       VALUES ('cash', $1, $2, $3, NOW() - ($4 * INTERVAL '18 minutes'))`,
      [12500 + index * 4800, failureReason, users[index % users.length].email, index],
    );
  }
}
