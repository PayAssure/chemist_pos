import { pool } from "../db";

export type CheckoutStatusUpdate = {
  status: "pending" | "completed" | "failed";
  settlementStatus:
    | "queued" | "processing" | "accepted" | "failed" | "retrying"
    | "partially_failed" | "awaiting_reconciliation" | "completed";
  collectionStatus: "pending" | "succeeded" | "failed";
  settlementError: string | null;
};

export const checkoutStatusChannel = "payassure_checkout_status";

export async function publishCheckoutStatus(reference: string): Promise<void> {
  const result = await pool.query("SELECT pg_notify($1, $2)", [checkoutStatusChannel, reference]);
  console.info("[PayAssure] Checkout status notification published", {
    merchantTransactionReference: reference,
    channel: checkoutStatusChannel,
    databaseNotificationQueued: result.rowCount === 1,
  });
}
