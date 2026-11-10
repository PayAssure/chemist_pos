import type { PoolClient } from "pg";
import type { SeedUser } from "./types";

const failureReasons = [
  "Insufficient unexpired stock for requested item",
  "Checkout cancelled before payment",
  "Product quantity exceeded available stock",
];

export async function insertFailedCheckouts(
  client: PoolClient,
  users: SeedUser[],
): Promise<void> {
  for (const [index, failureReason] of failureReasons.entries()) {
    await client.query(
      `INSERT INTO failed_checkout_attempts
         (payment_method, total_cents, failure_reason, created_by, created_at)
       VALUES ('cash', $1, $2, $3, NOW() - ($4 * INTERVAL '18 minutes'))`,
      [12500 + index * 4800, failureReason, users[index % users.length].email, index],
    );
  }
}
