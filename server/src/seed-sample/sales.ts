import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import type { Medicine } from "./types";
import { selectSaleItems } from "./sale-selection";
import { insertSale } from "./sale-writing";

export const transactionCount = 360;

export async function seedSales(
  client: PoolClient,
  medicines: Medicine[],
): Promise<void> {
  const startTime = Date.now() - 90 * 86_400_000;
  for (let saleIndex = 0; saleIndex < transactionCount; saleIndex += 1) {
    const { items, isTodaySale } = selectSaleItems(
      medicines, saleIndex, transactionCount,
    );
    if (!items.length) continue;
    const createdAt = new Date(
      startTime + randomInt(0, 90 * 86_400_000),
    ).toISOString();
    await insertSale(client, items, saleIndex, transactionCount, isTodaySale, createdAt);
  }
}
