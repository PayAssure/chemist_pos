import { randomUUID } from "node:crypto";
import type { CheckoutState } from "./checkout-models";
import type { PoolClient } from "pg";

export async function beginCheckoutTransaction(
  client: PoolClient,
  state: CheckoutState,
): Promise<void> {
  await client.query("BEGIN");
  state.transactionOpen = true;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [state.reference]);
  const duplicate = await client.query<{ id: number; request_fingerprint: string | null }>(
    `SELECT id, request_fingerprint FROM payassure_settlements
     WHERE merchant_transaction_reference = $1`,
    [state.reference],
  );
  if (duplicate.rows[0]) {
    const originalReference = state.reference;
    state.reference = `POS-${randomUUID()}`;
    console.warn("[PayAssure] Duplicate checkout reference detected; generated a fresh reference", {
      originalReference,
      replacementReference: state.reference,
      status: "reference_regenerated",
    });
  }
}
