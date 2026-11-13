import { pool } from "../db";

export type FloatDepositStatusUpdate = {
  depositId: string;
  amount: number;
  currency: string;
  receiptNumber: string | null;
  completedAt: string | null;
};

export const floatDepositStatusChannel = "payassure_float_deposit_status";

export async function publishFloatDepositStatus(depositId: string): Promise<void> {
  const result = await pool.query("SELECT pg_notify($1, $2)", [
    floatDepositStatusChannel,
    depositId,
  ]);
  console.info("[PayAssure] Float deposit status notification published", {
    depositId,
    channel: floatDepositStatusChannel,
    databaseNotificationQueued: result.rowCount === 1,
  });
}
