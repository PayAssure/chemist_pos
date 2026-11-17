import { pool } from "../db";
import type { PayassureEscrowBalance } from "../payassure-webhook-types";

export type RetailerFloatBalanceUpdate = PayassureEscrowBalance & {
  merchantId: string;
  asOf: string;
};

export const retailerFloatBalanceChannel = "payassure_retailer_float_balance";

export async function publishRetailerFloatBalance(
  update: RetailerFloatBalanceUpdate,
): Promise<void> {
  const result = await pool.query("SELECT pg_notify($1, $2)", [
    retailerFloatBalanceChannel,
    JSON.stringify(update),
  ]);
  console.info("[PayAssure] Retailer float balance notification published", {
    merchantId: update.merchantId,
    channel: retailerFloatBalanceChannel,
    databaseNotificationQueued: result.rowCount === 1,
  });
}
